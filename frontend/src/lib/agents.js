/** Presentation metadata for the six speakers in the locked event contract. */
export const AGENT_META = {
  flights: { label: "Flights", color: "#4f8cff", glyph: "✈" },
  stay: { label: "Stay", color: "#22c3a6", glyph: "⌂" },
  food: { label: "Food", color: "#f0a02c", glyph: "◍" },
  guide: { label: "Guide", color: "#c07bf0", glyph: "◆" },
  mediator: { label: "Mediator", color: "#e2e8f0", glyph: "§" },
  orchestrator: { label: "Orchestrator", color: "#94a3b8", glyph: "◇" },
};

export function metaFor(agent) {
  return AGENT_META[agent] ?? { label: agent ?? "unknown", color: "#64748b", glyph: "•" };
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function money(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return inr.format(value);
}

export function clockTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
