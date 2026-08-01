import { AGENTS } from "../state/sessionReducer.js";
import { metaFor, money } from "../lib/agents.js";
import { labelForPurchase } from "../lib/provenance.js";
import { AGENT_ICON, IconShield } from "../lib/icons.jsx";

/**
 * One credential card per specialist: its scoped Prava credential, its cap, and
 * what it actually bought.
 *
 * Honesty rules enforced here (Preethesh's progress log + hackathon rules) —
 * unchanged from the first build, only restyled:
 *  - a failed purchase is never styled as a completed one;
 *  - an issued credential is labelled "card issued", never "paid";
 *  - the INTERFACES.md §4 `source` tag is surfaced verbatim, and an absent tag
 *    renders as "source unverified" rather than silently implying a live charge.
 */
export function PurchaseCards({ cards, purchases, blockedAttempts, isMock }) {
  const issued = Object.keys(cards).length;

  return (
    <section className="panel rail-card">
      <div className="rail-head">
        <span className="rail-title">Scoped credentials</span>
        <span className="budget-state">{issued} of 4 issued</span>
      </div>

      <div className="credential-list">
        {issued === 0 && (
          <div className="rail-empty">
            No credential minted yet — nothing can be spent until the split is approved.
          </div>
        )}

        {AGENTS.map((agent) => {
          const card = cards[agent];
          const agentPurchases = purchases.filter((p) => p.agent === agent);
          const blocked = blockedAttempts.filter((b) => b.agent === agent);
          if (!card && agentPurchases.length === 0 && blocked.length === 0) return null;

          const meta = metaFor(agent);
          const Icon = AGENT_ICON[agent] ?? IconShield;
          const settled = [...agentPurchases].reverse().find((p) => p.status === "success");
          const failed = agentPurchases.some((p) => p.status === "failed");
          const spent = agentPurchases
            .filter((p) => p.status === "success")
            .reduce((sum, p) => sum + (p.amount ?? 0), 0);

          return (
            <article
              key={agent}
              className={`credential ${settled ? "" : failed ? "failed" : card ? "" : "idle"}`}
              style={{ "--agent": meta.color, "--agent-soft": meta.soft }}
            >
              <div className="credential-top">
                <span className="credential-glyph">
                  <Icon />
                </span>
                <span className="credential-title">{meta.label}</span>
                <span className={`credential-state ${stateClass(card, settled, failed)}`}>
                  {stateLabel(card, settled, failed)}
                </span>
              </div>

              {card && (
                <dl className="credential-grid">
                  <span>Credential</span>
                  <b>{card.cardId}</b>
                  <span>Locked cap</span>
                  <b>{money(card.amountCap)}</b>
                  <span>Spent</span>
                  <b>{money(spent)}</b>
                </dl>
              )}

              {agentPurchases.map((p) => (
                <div key={p.key} className={`buy buy--${p.status}`}>
                  <div className="buy__row">
                    <span>{p.merchant}</span>
                    <span className="buy__amount">
                      {p.status === "success" ? money(p.amount) : "not charged"}
                    </span>
                  </div>
                  <p className="buy__details">{p.details}</p>
                  {/* Exact precaution.md wording — never a friendlier synonym. */}
                  <span className={`tag tag--${labelForPurchase(p).tone}`}>
                    {labelForPurchase(p).text}
                    {isMock ? " · mocked stream" : ""}
                  </span>
                </div>
              ))}

              {blocked.map((b) => (
                <div key={b.key} className="buy buy--blocked">
                  <div className="buy__row">
                    <span>Blocked at card level</span>
                    <span className="buy__amount">
                      {money(b.attemptedAmount)} vs {money(b.cap)}
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

function stateLabel(card, settled, failed) {
  if (settled) return "purchased";
  if (failed) return "failed — retrying";
  if (card) return "card issued";
  return "waiting";
}

function stateClass(card, settled, failed) {
  if (settled) return "";
  if (failed) return "warn";
  if (card) return "sim";
  return "idle";
}
