import { useEffect, useMemo, useState } from "react";

import { metaFor } from "../lib/agents.js";

/**
 * Step 3 — the user picks the taste.
 *
 * The agents settled the money; the split is already final and every option
 * shown here fits its slice. So nothing on this page can overspend — the worst
 * a user can do is pick a cheaper room.
 *
 * Two honesty rules from INTERFACES.md §6 are enforced in the render, not just
 * the payload:
 *
 *   - The heading follows `ranking`. "Top rated" over a price-ranked list is a
 *     false claim, and Duffel flight offers genuinely have no ratings.
 *   - A missing rating renders as "no rating available", never as a zero or a
 *     placeholder star. The payload sends null precisely so this is possible.
 */

function RankingHeading({ ranking }) {
  return ranking === "rating" ? (
    <span className="rank-basis">Ranked by rating</span>
  ) : (
    <span className="rank-basis">
      Lowest price first <em>— these options carry no ratings</em>
    </span>
  );
}

function Countdown({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds ?? 0);

  useEffect(() => {
    if (!seconds) return undefined;
    setLeft(seconds);
    const timer = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          clearInterval(timer);
          onExpire?.();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds, onExpire]);

  if (!seconds) return null;
  return (
    <span className={`countdown ${left <= 10 ? "urgent" : ""}`}>
      {left > 0 ? `${left}s to choose` : "agent picked for you"}
    </span>
  );
}

function OptionCard({ option, chosen, disabled, onPick }) {
  const rated = option.rating !== null && option.rating !== undefined;
  return (
    <button
      type="button"
      className={`option-card ${chosen ? "chosen" : ""}`}
      onClick={() => onPick(option.optionId)}
      disabled={disabled}
    >
      <div className="option-head">
        <span className="option-vendor">{option.vendor}</span>
        <span className="option-price">₹{Number(option.price).toLocaleString("en-IN")}</span>
      </div>
      <p className="option-desc">{option.description}</p>
      <div className="option-meta">
        {rated ? (
          <span className="option-rating">
            {option.rating.toFixed(1)}/5
            {option.ratingBasis === "fixture-score" ? " · fixture score" : ""}
          </span>
        ) : (
          <span className="option-rating none">no rating available</span>
        )}
        <span className={`prov ${option.source}`}>
          {option.source === "live"
            ? `live${option.environment === "test" ? " · test inventory" : ""}`
            : "fixture / simulated"}
        </span>
      </div>
    </button>
  );
}

export default function Choose({ state, runId }) {
  const [sending, setSending] = useState(null);
  const requested = state.choice?.requested ?? {};
  const made = state.choice?.made ?? {};

  const pending = useMemo(
    () => Object.values(requested).filter((row) => !made[row.agent]),
    [requested, made],
  );

  async function pick(agent, optionId) {
    setSending(`${agent}:${optionId}`);
    try {
      await fetch("/api/choices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, agent, optionId }),
      });
    } catch {
      // The agent's timeout is the backstop — it will pick and label the
      // result `agent-timeout`, so a failed click never strands the run.
    } finally {
      setSending(null);
    }
  }

  if (!Object.keys(requested).length) {
    return (
      <div className="page-empty">
        <div className="eyebrow">Step 3 of 5 · your choice</div>
        <h2>Waiting for the agents to finish negotiating…</h2>
        <p>Options appear here once the split is final, so nothing you pick can overspend.</p>
      </div>
    );
  }

  return (
    <div className="choose">
      <div className="eyebrow">Step 3 of 5 · your choice</div>
      <h2 className="page-title">
        The agents set the budget. <span className="accent">You pick the taste.</span>
      </h2>
      <p className="page-lede">
        Every option below already fits that agent's agreed slice — picking cannot push the
        plan over budget.
      </p>

      {Object.values(requested).map((row) => {
        const decided = made[row.agent];
        return (
          <section className="choose-block" key={row.agent}>
            <header className="choose-head">
              <div>
                <h3 className="choose-agent">{metaFor(row.agent).label}</h3>
                <RankingHeading ranking={row.ranking} />
              </div>
              <div className="choose-right">
                <span className="slice">
                  slice ₹{Number(row.slice).toLocaleString("en-IN")}
                </span>
                {!decided ? <Countdown seconds={row.timeoutSeconds} /> : null}
              </div>
            </header>

            {decided ? (
              <p className="chosen-note">
                {decided.chosenBy === "user" ? (
                  <>
                    You chose <strong>{decided.vendor}</strong>.
                  </>
                ) : (
                  <>
                    Time ran out — the agent picked <strong>{decided.vendor}</strong>.{" "}
                    <em>Auto-selected, not your choice.</em>
                  </>
                )}
              </p>
            ) : (
              <div className="option-grid">
                {row.options.map((option) => (
                  <OptionCard
                    key={option.optionId}
                    option={option}
                    chosen={decided?.optionId === option.optionId}
                    disabled={Boolean(sending)}
                    onPick={(id) => pick(row.agent, id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {pending.length === 0 ? (
        <p className="choose-done">All picked. Moving to approval…</p>
      ) : null}
    </div>
  );
}
