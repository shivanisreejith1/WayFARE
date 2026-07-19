import { useState, useRef, useEffect } from "react";
import { sendMessage } from "./api";
import MessageBubble from "./components/MessageBubble.jsx";
import LeadPanel from "./components/LeadPanel.jsx";
import "./App.css";

const WELCOME = "Hi! I'm here to help you plan your next trip. Where are you thinking of going?";

export default function App() {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [state, setState] = useState({
    travel: {},
    customer: {},
    qualification: { leadScore: 0, confidence: "Low", reason: "", summary: "" },
  });
  const [leadCreated, setLeadCreated] = useState(false);
  const [leadJustCreated, setLeadJustCreated] = useState(false);
  const [cooling, setCooling] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await sendMessage(conversationId, text);
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setState(res.state);
      setLeadCreated(res.leadCreated);
      setCooling(res.interestCooling);
      if (res.leadCreatedThisTurn) {
        setLeadJustCreated(true);
        setTimeout(() => setLeadJustCreated(false), 2600);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">✈</span>
          <div>
            <h1>Wayfare</h1>
            <p>Travel lead assistant</p>
          </div>
        </div>
        {conversationId && <span className="conv-id">{conversationId}</span>}
      </header>

      <main className="app-main">
        <section className="chat-column">
          <div className="chat-scroll" ref={scrollRef}>
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {loading && (
              <div className="typing-row">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form className="composer" onSubmit={handleSend}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me about your trip…"
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </section>

        <LeadPanel
          travel={state.travel}
          customer={state.customer}
          qualification={state.qualification}
          leadCreated={leadCreated}
          leadJustCreated={leadJustCreated}
          cooling={cooling}
        />
      </main>
    </div>
  );
}
