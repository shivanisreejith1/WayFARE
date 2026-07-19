export default function MessageBubble({ role, content }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "72%",
          padding: "10px 14px",
          borderRadius: isUser ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
          background: isUser ? "var(--color-accent)" : "var(--color-surface-2)",
          color: isUser ? "#241705" : "var(--color-text)",
          fontSize: 14,
          lineHeight: 1.5,
          border: isUser ? "none" : "1px solid var(--color-border)",
        }}
      >
        {content}
      </div>
    </div>
  );
}
