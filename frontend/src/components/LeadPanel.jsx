import "./LeadPanel.css";

function Field({ label, value }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className={`field-value ${value ? "" : "empty"}`}>{value || "—"}</span>
    </div>
  );
}

const CONFIDENCE_COLOR = {
  Low: "#8fa3b8",
  Medium: "#e8a33d",
  High: "#4fb3a9",
};

export default function LeadPanel({ travel, customer, qualification, leadCreated, leadJustCreated, cooling }) {
  const score = qualification?.leadScore ?? 0;
  const confidence = qualification?.confidence ?? "Low";
  const destination = travel?.destination || "Your next trip";

  return (
    <aside className="ticket-wrap">
      <div className={`ticket ${leadJustCreated ? "ticket-pulse" : ""}`}>
        {leadCreated && (
          <div className="stamp" aria-label="Qualified lead">
            Qualified
          </div>
        )}

        <div className="ticket-top">
          <span className="ticket-eyebrow">Lead capture · in progress</span>
          <h2 className="ticket-destination">{destination}</h2>
          <div className="ticket-sub">
            {travel?.tripType && <span className="chip">{travel.tripType}</span>}
            {cooling && <span className="chip chip-cool">Interest cooling</span>}
          </div>
        </div>

        <div className="perforation" />

        <div className="ticket-body">
          <div className="field-grid">
            <Field label="Destination" value={travel?.destination} />
            <Field label="Departing from" value={travel?.departureCity} />
            <Field label="Travel date" value={travel?.travelDate} />
            <Field label="Travellers" value={travel?.travellers} />
            <Field label="Budget" value={travel?.budget} />
            <Field label="Duration" value={travel?.duration} />
            <Field label="Trip type" value={travel?.tripType} />
            <Field label="Special requirements" value={travel?.specialRequirements} />
          </div>

          <div className="perforation perforation-tight" />

          <div className="field-grid">
            <Field label="Name" value={customer?.name} />
            <Field label="Phone" value={customer?.phone} />
            <Field label="Email" value={customer?.email} />
          </div>
        </div>

        <div className="perforation" />

        <div className="ticket-stub">
          <div className="score-row">
            <div className="score-meter">
              <div className="score-meter-fill" style={{ width: `${score}%` }} />
            </div>
            <span className="score-number">{score}</span>
          </div>
          <div className="stub-meta">
            <span className="confidence-chip" style={{ color: CONFIDENCE_COLOR[confidence] }}>
              ● {confidence} confidence
            </span>
          </div>
          {qualification?.summary && <p className="stub-summary">{qualification.summary}</p>}
          <div className="barcode" aria-hidden="true" />
        </div>
      </div>
    </aside>
  );
}
