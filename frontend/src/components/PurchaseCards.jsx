import { AGENTS } from "../state/sessionReducer.js";
import { metaFor, money } from "../lib/agents.js";

/**
 * One card per specialist: its scoped Prava credential, its cap, and what it
 * actually bought.
 *
 * Honesty rules enforced here (Preethesh's progress log + hackathon rules):
 *  - a failed purchase is never styled as a completed one;
 *  - an issued credential is labelled "card issued", never "paid";
 *  - the INTERFACES.md §4 `source` tag is surfaced verbatim, and an absent tag
 *    renders as "unverified" rather than silently implying a live transaction.
 */
export function PurchaseCards({ cards, purchases, blockedAttempts, isMock }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Per-agent scoped cards</h2>
        <span className="pill">{Object.keys(cards).length} issued</span>
      </header>

      <div className="cards">
        {AGENTS.map((agent) => {
          const meta = metaFor(agent);
          const card = cards[agent];
          const agentPurchases = purchases.filter((p) => p.agent === agent);
          const settled = [...agentPurchases].reverse().find((p) => p.status === "success");
          const blocked = blockedAttempts.filter((b) => b.agent === agent);
          const spent = agentPurchases
            .filter((p) => p.status === "success")
            .reduce((sum, p) => sum + (p.amount ?? 0), 0);

          return (
            <article
              key={agent}
              className={`card ${card ? "card--active" : "card--idle"}`}
              style={{ "--agent": meta.color }}
            >
              <div className="card__top">
                <span className="card__glyph" aria-hidden="true">{meta.glyph}</span>
                <h3>{meta.label}</h3>
                <span className={`chip ${statusClass(card, settled, agentPurchases)}`}>
                  {statusLabel(card, settled, agentPurchases)}
                </span>
              </div>

              {card ? (
                <dl className="card__meta">
                  <div>
                    <dt>Credential</dt>
                    <dd className="mono">{card.cardId}</dd>
                  </div>
                  <div>
                    <dt>Locked cap</dt>
                    <dd>{money(card.amountCap)}</dd>
                  </div>
                  <div>
                    <dt>Spent</dt>
                    <dd>{money(spent)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="card__idle">No credential minted yet.</p>
              )}

              {agentPurchases.map((p) => (
                <div key={p.key} className={`buy buy--${p.status}`}>
                  <div className="buy__row">
                    <span className="buy__merchant">{p.merchant}</span>
                    <span className="buy__amount">
                      {p.status === "success" ? money(p.amount) : "not charged"}
                    </span>
                  </div>
                  <p className="buy__details">{p.details}</p>
                  <span className={`tag tag--${p.source ?? "unverified"}`}>
                    {p.source === "live"
                      ? "live transaction"
                      : p.source === "fixture"
                        ? "fixture data"
                        : "source unverified"}
                    {isMock ? " · mocked stream" : ""}
                  </span>
                </div>
              ))}

              {blocked.map((b) => (
                <div key={b.key} className="buy buy--blocked">
                  <div className="buy__row">
                    <span className="buy__merchant">Blocked at card level</span>
                    <span className="buy__amount">
                      {money(b.attemptedAmount)} vs cap {money(b.cap)}
                    </span>
                  </div>
                  <p className="buy__details">{b.reason}</p>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function statusLabel(card, settled, all) {
  if (settled) return "purchased";
  if (all.some((p) => p.status === "failed")) return "failed — retrying";
  if (card) return "card issued";
  return "waiting";
}

function statusClass(card, settled, all) {
  if (settled) return "chip--ok";
  if (all.some((p) => p.status === "failed")) return "chip--warn";
  if (card) return "chip--info";
  return "chip--idle";
}
