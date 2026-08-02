/**
 * Presentation metadata for the six speakers in the locked event contract.
 * Colours follow the warm "paper" palette in styles.css: each specialist owns
 * an ink colour and a soft tint used for its glyph plate and bar segment.
 */
export const AGENT_META = {
  flights: { label: "Journey", color: "#547ca8", soft: "#e6eef8", key: "flights" },
  stay: { label: "Stay", color: "#765b92", soft: "#eee6f6", key: "stay" },
  food: { label: "Food", color: "#a16b18", soft: "#fff0cc", key: "food" },
  guide: { label: "Guide", color: "#2e5a42", soft: "#c9f2dd", key: "guide" },
  mediator: { label: "Mediator", color: "#17221b", soft: "#e8e0d2", key: "mediator" },
  orchestrator: { label: "Orchestrator", color: "#667169", soft: "#f9f5ec", key: "orchestrator" },
};

export function metaFor(agent) {
  return (
    AGENT_META[agent] ?? { label: agent ?? "unknown", color: "#8e968f", soft: "#f3efe5", key: "unknown" }
  );
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
