import { metaFor, money } from "../lib/agents.js";
import { IconBlocked, IconRefresh } from "../lib/icons.jsx";

/**
 * Surfaces the two demo proof shots (brainstorming.md §7 beats 5 and 6) as
 * their own panel, so a judge sees them without having to read the feed.
 *
 * Purely a different view of `blockedAttempts` and `renegotiations` that the
 * reducer already tracks — no new state, no new events.
 */
export function ProofPanel({ blockedAttempts, renegotiations }) {
  if (blockedAttempts.length === 0 && renegotiations.length === 0) return null;

  return (
    <>
      {blockedAttempts.map((b) => (
        <section key={b.key} className="proof">
          <div className="proof-top">
            <span className="proof-icon">
              <IconBlocked />
            </span>
            <div>
              <h3>Overspend blocked at the card</h3>
              <p>{metaFor(b.agent).label} could not exceed its own slice.</p>
            </div>
          </div>
          <p>{b.reason}</p>
          <div className="proof-code">
            attempted {money(b.attemptedAmount)} · cap {money(b.cap)} · declined
          </div>
        </section>
      ))}

      {renegotiations.map((r) => (
        <section key={r.key} className="proof">
          <div className="proof-top">
            <span className="proof-icon">
              <IconRefresh />
            </span>
            <div>
              <h3>Single slice re-negotiated</h3>
              <p>{metaFor(r.agent).label} failed — the other purchases stood.</p>
            </div>
          </div>
          <p>{r.reason}</p>
        </section>
      ))}
    </>
  );
}
