import { AGENTS } from "../state/sessionReducer.js";
import { metaFor, money } from "../lib/agents.js";

/**
 * The finite pot, and how the four specialists are currently carving it up.
 * A single stacked track makes contention legible at a glance: when the
 * segments overflow the budget the state chip flips to "over budget", which is
 * exactly the tension the demo is selling.
 */
export function BudgetSplit({ allocations, summary, round }) {
  const { budget, allocated, unallocated, overBudget } = summary;
  const scale = Math.max(budget, allocated) || 1;

  return (
    <section className="panel rail-card">
      <div className="rail-head">
        <span className="rail-title">Budget split</span>
        <span className={`budget-state ${allocated === 0 ? "" : overBudget ? "over" : "safe"}`}>
          {allocated === 0 ? "no split yet" : overBudget ? "over budget" : "within budget"}
        </span>
      </div>

      <div className="budget-numbers">
        <span className="budget-primary">{money(allocated)}</span>
        <span className="budget-cap">of {money(budget)}</span>
      </div>

      <div
        className="budget-track"
        role="img"
        aria-label={`Allocated ${money(allocated)} of ${money(budget)}`}
      >
        {AGENTS.map((agent) => {
          const value = allocations[agent] ?? 0;
          if (value <= 0) return null;
          const meta = metaFor(agent);
          return (
            <span
              key={agent}
              className="segment"
              style={{ width: `${(value / scale) * 100}%`, background: meta.color }}
              title={`${meta.label}: ${money(value)}`}
            />
          );
        })}
      </div>

      <p className="budget-note">
        {allocated === 0
          ? "Waiting for the first proposed split."
          : overBudget
            ? `Round ${round} overshoots by ${money(allocated - budget)}. The mediator will not let this settle.`
            : `Round ${round} fits, with ${money(unallocated)} unallocated.`}
      </p>

      <div className="legend">
        {AGENTS.map((agent) => {
          const meta = metaFor(agent);
          const value = allocations[agent] ?? 0;
          return (
            <span key={agent}>
              <i style={{ background: meta.color }} />
              {meta.label} <b>{value > 0 ? money(value) : "—"}</b>
            </span>
          );
        })}
      </div>
    </section>
  );
}
