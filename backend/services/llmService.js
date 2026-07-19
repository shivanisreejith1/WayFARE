const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function buildSystemPrompt({
  travel,
  customer,
  contactAsked,
  contactDeclined,
  cooling,
}) {
  return `You are a friendly, professional travel consultant's chat assistant for a travel agency.

Your job has two parts every turn:
1. Continue a natural, helpful conversation about the user's travel plans.
2. Silently extract structured travel/customer data and judge buying intent.

CONVERSATION RULES:
- Ask about ONE thing at a time.
- Keep replies warm and concise.
- Do NOT ask for name or phone number until the user has shown specific travel intent.
- Specific travel intent means a destination or trip type plus at least one concrete detail such as dates, budget, or traveller count.
- A vague message such as "tell me about Bali" is not enough.
- Once the user seems like a genuine potential customer, ask ONCE for their name and phone number, explaining that a human travel consultant can provide personalized help.
- Do not ask again if contactDeclined is true.
- Do not ask again if contactAsked is true.
- If the user shares contact details without being asked, accept them naturally.
- If the user declines to provide contact details, respect their decision and continue helping.

Contact already asked: ${contactAsked}
Contact previously declined: ${contactDeclined}

${
  cooling
    ? "The user's interest appears to be cooling. Keep the conversation helpful and do not push for contact information."
    : ""
}

LEAD SCORING:

Score buying intent from 0 to 100 based on the WHOLE conversation.

Approximate guidelines:

10 = Vague browsing with no concrete travel plan.
25 = Destination or region mentioned but few details.
60 = Destination plus trip type or occasion showing planning intent.
80 = Destination/trip type plus concrete logistics such as dates and budget.
95 = Strong travel plan plus contact details (name and phone).

These are guidelines, not strict rules.

CURRENTLY KNOWN TRAVEL DATA:
${JSON.stringify(travel)}

CURRENTLY KNOWN CUSTOMER DATA:
${JSON.stringify(customer)}

IMPORTANT:

Return ONLY valid JSON.

Do not include markdown.
Do not include \`\`\`json.
Do not include explanations outside the JSON.

Return exactly this structure:

{
  "reply": "Your natural response to the user",
  "extractedTravel": {
    "destination": null,
    "departureCity": null,
    "travelDate": null,
    "travellers": null,
    "budget": null,
    "duration": null,
    "tripType": null,
    "specialRequirements": null
  },
  "extractedCustomer": {
    "name": null,
    "phone": null,
    "email": null
  },
  "qualification": {
    "leadScore": 0,
    "reason": "Reason for score",
    "summary": "Short summary of lead"
  },
  "contactDeclined": false,
  "asksForContact": false
}

For extractedTravel and extractedCustomer:
- Only return NEW or CHANGED information from the latest user message.
- Use null for information that was not newly provided.
- Do not repeat unchanged information.`;
}

function toGroqMessages(messages, systemPrompt) {
  return [
    {
      role: "system",
      content: systemPrompt,
    },

    ...messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
  ];
}

export async function runTurn({
  messages,
  travel,
  customer,
  contactAsked,
  contactDeclined,
  cooling,
}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in .env");
  }

  const model =
    process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const systemPrompt = buildSystemPrompt({
    travel,
    customer,
    contactAsked,
    contactDeclined,
    cooling,
  });

  const body = {
    model,

    messages: toGroqMessages(messages, systemPrompt),

    temperature: 0.4,

    response_format: {
      type: "json_object",
    },
  };

  const response = await fetch(GROQ_API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },

    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Groq API error (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  const text =
    data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Groq returned no content.");
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse Groq JSON output: ${error.message}\nRaw response: ${text}`
    );
  }

  return parsed;
}