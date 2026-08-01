import { metaFor, money } from "../lib/agents.js";

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
      <div className="receipt">
        <header className="receipt__head">
          <h2>Every agent has settled</h2>
          <button type="button" className="ghost" onClick={onDismiss} aria-label="Close receipt">
            ✕
          </button>
        </header>

        {isMock && (
          <p className="receipt__warn">
            This receipt was produced by the mocked demo stream. No payment was made.
          </p>
        )}

        <ul className="receipt__lines">
          {lines.map((line, index) => {
            const meta = metaFor(line.agent);
            return (
              <li key={`${line.agent}-${index}`}>
                <span className="legend__dot" style={{ background: meta.color }} />
                <span className="receipt__agent">{meta.label}</span>
                <span className="receipt__merchant">{line.merchant}</span>
                <span className="receipt__amount">{money(line.amount)}</span>
              </li>
            );
          })}
        </ul>

        <dl className="receipt__totals">
          <div>
            <dt>Budget</dt>
            <dd>{money(receipt.budget)}</dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd>{money(receipt.totalSpent)}</dd>
          </div>
          <div>
            <dt>Unspent</dt>
            <dd>{money(remaining)}</dd>
          </div>
        </dl>

        <p className="receipt__proof">
          <strong>{blockedAttempts.length}</strong> over-cap attempt
          {blockedAttempts.length === 1 ? "" : "s"} blocked at the card level ·{" "}
          <strong>{renegotiations.length}</strong> slice
          {renegotiations.length === 1 ? "" : "s"} re-negotiated after a failure ·{" "}
          <strong>{summary.failedPurchases}</strong> failed booking
          {summary.failedPurchases === 1 ? "" : "s"} recovered
        </p>

        <button type="button" className="primary" onClick={copySummary}>
          Copy confirmation summary
        </button>
      </div>
    </div>
  );
}
