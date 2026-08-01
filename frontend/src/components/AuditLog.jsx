import { money } from "../lib/agents.js";

/**
 * Every event the dashboard received, in order, including types this build does
 * not specifically render. If Preethesh ships a new event type mid-hackathon it
 * shows up here immediately rather than disappearing.
 */
export function AuditLog({ audit }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div className="panel-title">Audit log</div>
        <span className="run-id">{audit.length} events</span>
      </header>

      {audit.length === 0 ? (
        <div style={{ padding: "18px 22px" }}>
          <div className="rail-empty">No events received yet.</div>
        </div>
      ) : (
        <ol className="audit">
          {audit.map((entry) => (
            <li key={`${entry.seq}-${entry.id ?? "n"}`} className="audit__row">
              <span className="audit__id">#{entry.id ?? entry.seq}</span>
              <span className="audit__type">{entry.event.type}</span>
              <span className="audit__detail">{describe(entry.event)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function describe(event) {
  switch (event.type) {
    case "agent_message":
      return `${event.agent}: ${truncate(event.message, 70)}`;
    case "split_update":
      return `round ${event.round} · ${money(event.totalBudget)} across ${Object.keys(event.allocations ?? {}).length} agents`;
    case "approval_requested":
      return "user approval requested";
    case "approval_given":
      return `approved at ${event.timestamp ?? "unknown time"}`;
    case "card_issued":
      return `${event.agent} · ${event.cardId} · cap ${money(event.amountCap)}`;
    case "purchase_result":
      return `${event.agent} · ${event.status} · ${money(event.amount)} at ${event.merchant}`;
    case "blocked_attempt":
      return `${event.agent} tried ${money(event.attemptedAmount)} against a ${money(event.cap)} cap`;
    case "renegotiation_triggered":
      return `${event.agent}: ${truncate(event.reason, 70)}`;
    case "final_receipt":
      return `spent ${money(event.totalSpent)} of ${money(event.budget)}`;
    default:
      return "unrecognised event type — shown raw for traceability";
  }
}

function truncate(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
