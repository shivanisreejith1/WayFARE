# Wayfare : Getaways Leads

A conversational assistant that chats naturally about travel plans, extracts structured
trip details as they come up, continuously scores buying intent, and  once someone
looks like a real customer  asks for contact details and stores a qualified lead.

- **Frontend:** React (Vite)
- **Backend:** Node.js / Express
- **LLM:** [Groq](https://console.groq.com/keys) 
  API key, OpenAI-compatible endpoint, very low latency
- **Storage:** MongoDB (Mongoose)
- **Deployed:** Render (frontend as a static site / web service, backend as a separate web
  service, MongoDB Atlas free tier for storage)

---

## 1. How it works (architecture)

Every user message triggers **one** LLM call (`services/llmService.js`) that does two jobs
at once, using Groq's OpenAI-compatible chat completions endpoint with
`response_format: { type: "json_object" }`:

1. Writes the next natural chat reply.
2. Extracts any new/updated travel or customer fields, and proposes a `leadScore` (0–100)
   with a reason and summary — judged from the **whole conversation so far**, not just the
   latest message.

I deliberately used a single combined call instead of separate "chat", "extraction", and
"scoring" calls:

- One round trip per turn instead of three → lower latency, lower cost.
- The reply and the score are grounded in the exact same read of the conversation, so they
  can't contradict each other (e.g. the assistant sounding enthusiastic while the stored
  score says "low intent").

Groq's `json_object` mode guarantees syntactically valid JSON but, unlike some other
providers' structured-output modes, doesn't enforce a specific shape. So the exact schema is
spelled out explicitly inside the system prompt, and `llmService.js` runs a defensive
`normalize()` pass on the parsed response (defaulting any missing/malformed field) before it
ever reaches the scoring or persistence logic.

The backend (`routes/chat.js`) then:

1. **Merges** extracted fields into the conversation's running state — only overwriting a
   field when the model returned a genuinely new, non-null value, so state accumulates
   across turns instead of getting reset.
2. **Clamps and stores** the score, appends it to a `scoreHistory` array (used for the
   "interest cooling" edge case, see below).
3. **Computes `confidence` deterministically in code**, not via the LLM (see §2).
4. **Decides whether to persist a `Lead`**: only once we have both `name` **and** `phone`
   *and* the score is at/above a configurable threshold (`LEAD_SCORE_THRESHOLD`, default
   `60`). This is a plain code `if`, not an LLM decision, so it's predictable and auditable.

The system prompt sent to Groq also carries the running state (`travel`, `customer`,
whether contact has already been asked / declined, and whether interest is cooling), so the
model doesn't need the entire message history to know what to do next — it just needs to
know what's *missing*.

## 2. Lead scoring logic

**Score (0–100)** — Groq estimates this every turn from the full conversation, anchored
to the calibration table given in the assignment brief (baked directly into the system
prompt):

| Signal | ~Score |
|---|---|
| Vague browsing, no destination ("tell me about Bali") | ~10 |
| A destination/region, nothing else concrete | ~25 |
| Destination + trip type/occasion (shows planning intent) | ~60 |
| Destination + trip type + concrete logistics (dates, budget) | ~80 |
| All of the above + contact details provided | ~95 |

I told the model to treat these as *anchors to interpolate around*, not hard rules — e.g. a
long conversation that stays generic ("what's fun to do in Europe?") should stay low even
after many turns, and a clearly price-shopping-only user shouldn't creep upward just because
the conversation is long.

**Confidence (Low / Medium / High)** is **not** produced by the LLM. It's computed
deterministically in `services/scoringService.js` from the score plus how much corroborating
detail we actually have (`completeness` = fraction of the 8 travel fields filled), plus
whether we have contact info:

```
score >= 70 and (completeness >= 0.4 or hasContact)  -> High
score >= 40 and (completeness >= 0.2 or hasContact)  -> Medium
score >= 25                                          -> Medium
else                                                 -> Low
```

Rationale: confidence should mean "how much would I trust this number", which depends on
*how much evidence backs it up*, not just the number itself. A single enthusiastic sentence
can spike the LLM's raw score, but shouldn't alone earn "High" confidence — a score with no
supporting detail gets capped at Medium/Low until more concrete facts come in. This also
keeps confidence consistent across conversations even if the model's phrasing varies turn to
turn, which a purely LLM-judged confidence value would not guarantee.

**Lead persistence** is a third, separate decision, in code: `hasName && hasPhone && score
>= threshold`. Score and confidence describe the opportunity; this gate decides whether it's
*actionable* (a consultant can actually call the person).

## 3. Edge cases (from the brief)

- **Contact shared very early / unprompted:** the extraction step accepts and stores it
  immediately — the assistant doesn't need to have asked for it. It's stored on `customer`
  right away, but a `Lead` is still only persisted once the score also clears the threshold,
  so "here's my number" alone (with no real trip detail) won't yet create a lead — it'll sit
  as a low/medium-score conversation with contact info attached, ready to convert the moment
  a few more details come in. The assistant keeps the conversation going naturally rather
  than treating "we have a phone number" as the finish line.
- **Interest shown but contact declined:** `contactDeclined` is tracked once, and the system
  prompt is told never to ask again in that conversation. The assistant keeps helping with
  travel questions; no lead is force-created without a phone number (a `Lead` genuinely
  requires contact info here, matching the assignment's "capture complete lead information
  including contact details" framing).
- **Interest drops mid-conversation:** `scoreHistory` is tracked per conversation.
  `isInterestCooling()` flags a drop of ≥25 points from the conversation's peak score. When
  cooling is detected, the system prompt is told to back off asking for contact and keep the
  tone light — and the UI surfaces an "Interest cooling" chip so a human reviewing the
  transcript sees it too.
- **Vague dates ("sometime next year"):** `travelDate` is stored as free text on purpose,
  exactly as the user phrased it, rather than forced into a strict date. Forcing a fake
  precise date would misrepresent what the user actually said; a consultant can follow up to
  narrow it down.
- **We never ask for contact too early:** the system prompt explicitly withholds the
  name/phone ask until there's a destination/trip-type signal *plus* at least one more
  concrete detail — a bare "tell me about Bali" won't trigger it.

## 4. Data model

`Conversation` (Mongo) stores the full message history plus the current running state
(`travel`, `customer`, `qualification`, `scoreHistory`) — this is what powers the live UI
panel and lets a conversation resume after a refresh.

`Lead` is the finalized, consultant-facing record, created/updated only once the criteria in
§2 are met. Shape:

```json
{
  "conversationId": "conv_18422",
  "customer": { "name": "Rahul Verma", "phone": "+91 9999999999", "email": null },
  "travel": {
    "destination": "Bali",
    "departureCity": null,
    "travelDate": "December",
    "travellers": 2,
    "budget": "Rs 2,00,000",
    "duration": null,
    "tripType": "Honeymoon",
    "specialRequirements": null
  },
  "qualification": {
    "leadScore": 95,
    "confidence": "High",
    "reason": "Destination, trip type, traveller count, budget and contact details are all present.",
    "summary": "Couple planning a honeymoon to Bali in December with a Rs 2,00,000 budget for 2 travellers."
  },
  "hasContact": true,
  "createdAt": "2026-07-19T10:32:00Z"
}
```

## 5. Setup

### Backend
```bash
cd backend
cp .env.example .env
# fill in MONGODB_URI and GROQ_API_KEY (free key: https://console.groq.com/keys)
npm install
npm run dev        # http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173, proxies /api -> :5000
```

Open `http://localhost:5173`. The right-hand "boarding pass" panel fills in live as the
assistant extracts each field; it stamps **QUALIFIED** once a lead is persisted.

### Deploying (Render)

Deployed as two separate Render services + MongoDB Atlas for storage:

- **Backend** — Render Web Service, root `backend/`, build `npm install`, start `npm start`.
  Set env vars: `MONGODB_URI` (Atlas connection string), `GROQ_API_KEY`, `GROQ_MODEL`,
  `LEAD_SCORE_THRESHOLD`, and `CORS_ORIGIN` set to the frontend's Render URL (Render injects
  `PORT` automatically — the app already reads `process.env.PORT`).
- **Frontend** — Render Static Site (or Web Service), root `frontend/`, build `npm install &&
  npm run build`, publish dir `dist`. Set `VITE_API_BASE_URL` to the backend service's URL
  with `/api` appended, e.g. `https://wayfare-backend.onrender.com/api` (this has to be set
  *before* the build, since Vite inlines env vars at build time).

Two things worth knowing about Render's free tier: services on it spin down after inactivity,
so the first message after idle time can take 20-30s while the backend cold-starts; and Atlas
free-tier clusters need the Render service's outbound IP allow-listed (or `0.0.0.0/0` for
convenience during grading).

---

## 6. Sample conversation transcripts + resulting lead JSON

*(Generated by walking through the actual scoring/merge logic in this repo; phrasing of the
assistant's replies is representative of what the Groq prompt produces.)*

### Transcript 1 — clear qualified lead (matches the brief's example)

| Turn | Message |
|---|---|
| User | I'm planning a honeymoon in Bali this December. |
| Assistant | That's exciting, congratulations! Roughly how many people will be travelling? |
| User | Two adults. |
| Assistant | Great. Do you already have a budget in mind? |
| User | Around Rs 2 lakh. |
| Assistant | Perfect — if you'd like a travel consultant to put together a personalised package, could I get your name and a contact number? |
| User | Rahul Verma, +91 9999999999 |
| Assistant | Thanks Rahul! I've passed your details to our Bali specialist — they'll reach out shortly with some honeymoon package options. |

Score progression: `10 → 45 → 60 → 80 → 95`. Lead persisted on the final turn.

```json
{
  "conversationId": "conv_18422",
  "customer": { "name": "Rahul Verma", "phone": "+91 9999999999", "email": null },
  "travel": {
    "destination": "Bali",
    "departureCity": null,
    "travelDate": "December",
    "travellers": 2,
    "budget": "Rs 2,00,000",
    "duration": null,
    "tripType": "Honeymoon",
    "specialRequirements": null
  },
  "qualification": {
    "leadScore": 95,
    "confidence": "High",
    "reason": "Destination, trip type, traveller count, budget and contact details are all present.",
    "summary": "Couple planning a honeymoon to Bali in December with a Rs 2,00,000 budget for 2 travellers."
  },
  "hasContact": true,
  "createdAt": "2026-07-19T10:32:00Z"
}
```

### Transcript 2 — contact declined, no lead created

| Turn | Message |
|---|---|
| User | What's a good time of year to visit Vietnam? |
| Assistant | Vietnam is lovely between Feb and April, dry and not too hot. Are you thinking of a specific trip? |
| User | Maybe a 10-day trip with my partner next spring, mid-range budget. |
| Assistant | Sounds great! If you'd like, I can connect you with a consultant for tailored options — could I grab your name and number? |
| User | I'd rather not share that yet, just researching for now. |
| Assistant | No problem at all — happy to keep answering questions whenever you like. Want a rough day-by-day idea for a 10-day Vietnam trip? |

Score progression: `20 → 65 → 65` (score doesn't collapse just because contact was declined —
intent is still real). `contactDeclined = true`, so the assistant never asks again.
**No `Lead` document is created** — `hasContact` is false, so the persistence gate in
`shouldPersistAsLead()` fails regardless of score. The `Conversation` record still holds
everything captured, so if the user returns and later shares contact info, a lead can still
be created retroactively in the same conversation.

```json
{
  "conversationId": "conv_9f21",
  "note": "No Lead document created — contact info withheld. Conversation state below.",
  "travel": {
    "destination": "Vietnam",
    "departureCity": null,
    "travelDate": "next spring",
    "travellers": 2,
    "budget": "mid-range",
    "duration": "10 days",
    "tripType": null,
    "specialRequirements": null
  },
  "customer": { "name": null, "phone": null, "email": null },
  "qualification": {
    "leadScore": 65,
    "confidence": "Medium",
    "reason": "Specific destination, duration, budget tier and traveller count given, but no contact info to act on.",
    "summary": "User and partner considering a 10-day mid-range Vietnam trip next spring; declined to share contact details.",
    "contactAsked": true,
    "contactDeclined": true
  }
}
```

### Transcript 3 — vague browsing, interest cools off

| Turn | Message |
|---|---|
| User | Tell me about Bali. |
| Assistant | Bali's known for its beaches, temples and rice terraces — very popular for both relaxation and adventure trips. Is there something specific drawing you there? |
| User | Actually thinking honeymoon, maybe December, budget around 2 lakh for 2 of us. |
| Assistant | Lovely — that's a great time to go. Would you like me to connect you with a consultant, or are you still just exploring? |
| User | Actually never mind, just curious for now, not really planning anything. |
| Assistant | All good — happy to help whenever you're ready, no pressure at all! |

Score progression: `10 → 78 → 30`. The drop from the peak (78) to 30 is ≥25, so
`isInterestCooling()` returns `true` from that point on — the system prompt is told to back
off, and the UI shows an "Interest cooling" chip. No contact was ever given, so (independent
of cooling) no `Lead` is persisted either.

```json
{
  "conversationId": "conv_5b7a",
  "note": "No Lead document created — score dropped and no contact info provided.",
  "travel": {
    "destination": "Bali",
    "departureCity": null,
    "travelDate": "December",
    "travellers": 2,
    "budget": "Rs 2,00,000",
    "duration": null,
    "tripType": "Honeymoon",
    "specialRequirements": null
  },
  "customer": { "name": null, "phone": null, "email": null },
  "qualification": {
    "leadScore": 30,
    "confidence": "Medium",
    "reason": "Strong trip details were mentioned but the user then explicitly said they're not planning anything yet.",
    "summary": "User floated a Bali honeymoon idea with rough dates and budget, then backed off — likely still just browsing.",
    "contactAsked": false,
    "contactDeclined": false
  },
  "interestCooling": true
}
```

## 7. Assumptions

- "Genuine buying intent" requires *both* a destination/trip-type signal *and* at least one
  more concrete detail (dates, budget, or traveller count) before the assistant will ask for
  contact info — a single generic question never triggers the ask.
- A `Lead` record specifically requires `name + phone`; email is optional everywhere, matching
  the brief's "Email (optional)".
- `travelDate` is intentionally kept as free text rather than a parsed `Date`, since forcing
  vague answers like "sometime next year" into a real date would misrepresent the user.
- `LEAD_SCORE_THRESHOLD` (default 60) is an env var, not hard-coded, so the business can tune
  how conservative/aggressive lead creation is without a code change.
- Groq's `json_object` mode occasionally returns a field with a slightly different type than
  expected under load; `normalize()` covers the common cases, but a malformed response still
  surfaces as an error to the UI rather than silently retrying, to keep the assignment's scope
  focused on the lead-detection logic itself.

## 8. What I'd add with more time

- Retry/backoff around the Groq call, and a fallback prompt/re-ask if JSON parsing fails.
- A lightweight auth layer + a consultant-facing `/leads` dashboard (the `GET /api/leads` API
  already exists — see `routes/leads.js` — just no UI for it yet).
- Re-scoring a conversation if the user returns after a long gap (session-boundary handling).
- Unit tests around `mergeNonNull` and the Groq prompt/schema contract (currently only
  `scoringService.js`'s pure functions are covered).
