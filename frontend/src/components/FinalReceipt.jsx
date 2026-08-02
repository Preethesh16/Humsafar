import { useEffect, useRef } from "react";

import { metaFor, money } from "../lib/agents.js";
import { labelForPurchase, provenCount, runMode, runModeLabel } from "../lib/provenance.js";
import { IconCheck } from "../lib/icons.jsx";

/**
 * Confirmation fan-out (brainstorming.md §7 beat 7): the summary the user sees
 * once every agent has settled, and the payload that would be fanned out to an
 * external channel. The fan-out button is deliberately inert until a channel is
 * wired — it copies the summary rather than pretending a message was sent.
 */
export function FinalReceipt({ receipt, summary, blockedAttempts, renegotiations, isMock, onDismiss }) {
  const closeRef = useRef(null);

  // A modal that can only be dismissed with the mouse is a keyboard trap. Escape
  // closes it, and focus moves into the dialog when it appears so a screen
  // reader announces it rather than leaving focus behind on the page.
  useEffect(() => {
    if (!receipt) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onDismiss?.();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [receipt, onDismiss]);

  if (!receipt) return null;

  const lines = receipt.purchases ?? [];
  const remaining = (receipt.budget ?? 0) - (receipt.totalSpent ?? 0);

  // precaution.md: the receipt must never let one line's result stand for the
  // run. State the run's mode, and how many lines actually exercised a payment
  // path, so "everyone settled" can't be read as "four real orders".
  const mode = runMode(lines);
  const modeLabel = runModeLabel(mode);
  const proven = provenCount(lines);

  const copySummary = () => {
    const text = [
      `Humsafar — trip settled${isMock ? " (MOCKED DEMO DATA)" : ""}`,
      // The fan-out payload carries the same labels as the screen — a summary
      // pasted into a channel must not read as a live order either.
      `${modeLabel.text}. ${proven} of ${lines.length} exercised a payment path.`,
      ...lines.map((l) => {
        const amount = l.status === "failed" ? "not charged" : money(l.amount);
        return `${metaFor(l.agent).label}: ${amount} — ${l.merchant} [${labelForPurchase(l).text}]`;
      }),
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
          <button type="button" className="ghost" onClick={onDismiss} aria-label="Close receipt" ref={closeRef}>
            ✕
          </button>
        </div>

        {isMock && (
          <p className="outcome-warn">
            This receipt was produced by the mocked demo stream. No payment was made.
          </p>
        )}

        <div className={`runmode runmode--${modeLabel.tone}`}>
          <b>{modeLabel.text}</b>
          {modeLabel.detail && <span>{modeLabel.detail}</span>}
          <span className="runmode__count">
            {proven} of {lines.length} purchase{lines.length === 1 ? "" : "s"} exercised a
            payment path.
          </span>
        </div>

        <ul className="outcome-lines">
          {lines.map((line, index) => {
            const meta = metaFor(line.agent);
            // A receipt line carries its own `status` and `source` (INTERFACES.md
            // §2 producer notes). Neither may be dropped: a failed line must not
            // read as a completed purchase, and a fixture line must not read as
            // a live order.
            const failed = line.status === "failed";
            return (
              <li key={`${line.agent}-${index}`} className={failed ? "is-failed" : ""}>
                <i style={{ background: meta.color }} />
                <span className="outcome-agent">{meta.label}</span>
                <span className="outcome-merchant">
                  {line.merchant}
                  <span className={`tag tag--${labelForPurchase(line).tone}`}>
                    {labelForPurchase(line).text}
                  </span>
                </span>
                <span className="outcome-amount">
                  {failed ? "not charged" : money(line.amount)}
                </span>
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
