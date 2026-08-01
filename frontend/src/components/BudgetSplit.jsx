import { AGENTS } from "../state/sessionReducer.js";
import { metaFor, money } from "../lib/agents.js";

/**
 * The finite pot, and how the four specialists are currently carving it up.
 * A single stacked bar makes contention legible at a glance: when the segments
 * overflow the budget line, the negotiation has not converged yet.
 */
export function BudgetSplit({ allocations, summary, round }) {
  const { budget, allocated, unallocated, overBudget } = summary;
  const scale = Math.max(budget, allocated) || 1;

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Budget split</h2>
        <span className={`pill ${overBudget ? "pill--danger" : ""}`}>
          {money(allocated)} of {money(budget)}
          {overBudget ? ` · over by ${money(allocated - budget)}` : ""}
        </span>
      </header>

      <div className="bar" role="img" aria-label={`Allocated ${money(allocated)} of ${money(budget)}`}>
        {AGENTS.map((agent) => {
          const value = allocations[agent] ?? 0;
          if (value <= 0) return null;
          const meta = metaFor(agent);
          return (
            <div
              key={agent}
              className="bar__seg"
              style={{ width: `${(value / scale) * 100}%`, background: meta.color }}
              title={`${meta.label}: ${money(value)}`}
            />
          );
        })}
        {unallocated > 0 && (
          <div className="bar__seg bar__seg--free" style={{ width: `${(unallocated / scale) * 100}%` }} />
        )}
      </div>

      <ul className="legend">
        {AGENTS.map((agent) => {
          const meta = metaFor(agent);
          const value = allocations[agent] ?? 0;
          const share = budget > 0 ? Math.round((value / budget) * 100) : 0;
          return (
            <li key={agent}>
              <span className="legend__dot" style={{ background: meta.color }} />
              <span className="legend__label">{meta.label}</span>
              <span className="legend__value">{money(value)}</span>
              <span className="legend__share">{value > 0 ? `${share}%` : "—"}</span>
            </li>
          );
        })}
        <li className="legend__free">
          <span className="legend__dot legend__dot--free" />
          <span className="legend__label">Unallocated</span>
          <span className="legend__value">{money(unallocated)}</span>
          <span className="legend__share">{round > 0 ? `after round ${round}` : "—"}</span>
        </li>
      </ul>
    </section>
  );
}
