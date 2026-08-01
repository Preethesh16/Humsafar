import { metaFor, money } from "../lib/agents.js";
import { IconCheck } from "../lib/icons.jsx";

/**
 * Confirmation fan-out (brainstorming.md §7 beat 7): the summary the user sees
 * once every agent has settled, and the payload that would be fanned out to an
 * external channel. The fan-out button is deliberately inert until a channel is
 * wired — it copies the summary rather than pretending a message was sent.
 */
export function FinalReceipt({ receipt, summary, blockedAttempts, renegotiations, isMock, onDismiss }) {
  if (!receipt) return null;

  const lines = receipt.purchases ?? [];
  const remaining = (receipt.budget ?? 0) - (receipt.totalSpent ?? 0);

  const copySummary = () => {
    const text = [
      `Humsafar — trip settled${isMock ? " (MOCKED DEMO DATA)" : ""}`,
      ...lines.map((l) => `${metaFor(l.agent).label}: ${money(l.amount)} — ${l.merchant}`),
      `Total: ${money(receipt.totalSpent)} of ${money(receipt.budget)} (${money(remaining)} unspent)`,
      `${blockedAttempts.length} over-cap attempt(s) blocked at the card level.`,
      `${renegotiations.length} slice(s) re-negotiated after a failure.`,
    ].join("\n");
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Final receipt">
      <div className="outcome">
        <div className="outcome-top">
          <div>
            <div className="outcome-kicker">Confirmation fan-out</div>
            <h2>Every agent has settled</h2>
          </div>
          <span className="outcome-check">
            <IconCheck />
          </span>
          <button type="button" className="ghost" onClick={onDismiss} aria-label="Close receipt">
            ✕
          </button>
        </div>

        {isMock && (
          <p className="outcome-warn">
            This receipt was produced by the mocked demo stream. No payment was made.
          </p>
        )}

        <ul className="outcome-lines">
          {lines.map((line, index) => {
            const meta = metaFor(line.agent);
            return (
              <li key={`${line.agent}-${index}`}>
                <i style={{ background: meta.color }} />
                <span className="outcome-agent">{meta.label}</span>
                <span className="outcome-merchant">{line.merchant}</span>
                <span className="outcome-amount">{money(line.amount)}</span>
              </li>
            );
          })}
        </ul>

        <div className="outcome-stats">
          <div className="outcome-stat">
            <span>Budget</span>
            <b>{money(receipt.budget)}</b>
          </div>
          <div className="outcome-stat">
            <span>Spent</span>
            <b>{money(receipt.totalSpent)}</b>
          </div>
          <div className="outcome-stat">
            <span>Blocked</span>
            <b>{blockedAttempts.length}</b>
          </div>
          <div className="outcome-stat">
            <span>Recovered</span>
            <b>{summary.failedPurchases}</b>
          </div>
        </div>

        <button type="button" className="run-btn" onClick={copySummary}>
          Copy confirmation summary
        </button>
      </div>
    </div>
  );
}
