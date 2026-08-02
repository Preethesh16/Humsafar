import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Step 1 — the user states the goal.
 *
 * This is the page that turns the project from a scripted demo into a product:
 * a judge can type their own destination and budget and watch the agents work
 * on it. Discovery is destination-aware, so a Jaipur request really does return
 * Jaipur inventory.
 *
 * The goal is composed into a sentence rather than sent as structured fields,
 * because the Intent Agent already parses free text and that keeps the locked
 * event contract unchanged.
 */

const SUGGESTIONS = ["Goa", "Jaipur", "Udaipur", "Leh", "Kochi"];

export default function Intake({ onStarted }) {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("Goa");
  const [budget, setBudget] = useState(30000);
  const [days, setDays] = useState(3);
  const [emphasis, setEmphasis] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const goal =
    `Plan my ${destination.trim() || "Goa"} trip for ${days} days` +
    (emphasis.trim() ? `, ${emphasis.trim()}` : "");

  async function start(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budget: Number(budget), days: Number(days) }),
      });
      if (!response.ok) throw new Error(`Backend returned ${response.status}`);
      const { runId } = await response.json();
      onStarted?.(runId);
      navigate(`/deliberate?runId=${encodeURIComponent(runId)}`);
    } catch (cause) {
      // Never pretend a run started. The demo stream stays available and is
      // labelled as simulated wherever it is shown.
      setError(
        `Could not start a live run (${cause.message}). ` +
          "You can still watch the simulated stream.",
      );
      setBusy(false);
    }
  }

  return (
    <form className="intake" onSubmit={start}>
      <div className="eyebrow">Step 1 of 5 · your trip</div>
      <h1 className="intake-title">
        Where are you going, <span className="accent">and what can you spend?</span>
      </h1>
      <p className="intake-lede">
        Four specialist agents will negotiate this budget between themselves, then each
        buys its own part on its own merchant-locked card. You approve once.
      </p>

      <div className="intake-grid">
        <label className="field">
          <span className="field-label">Destination</span>
          <input
            className="field-input"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Goa"
            required
          />
          <div className="chips">
            {SUGGESTIONS.map((city) => (
              <button
                type="button"
                key={city}
                className={`chip ${city === destination ? "on" : ""}`}
                onClick={() => setDestination(city)}
              >
                {city}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span className="field-label">Total budget (₹)</span>
          <input
            className="field-input"
            type="number"
            min="5000"
            step="500"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            required
          />
          <span className="field-hint">The agents can never spend past this.</span>
        </label>

        <label className="field">
          <span className="field-label">Days</span>
          <input
            className="field-input"
            type="number"
            min="1"
            max="14"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            required
          />
        </label>

        <label className="field wide">
          <span className="field-label">Anything you care about? (optional)</span>
          <input
            className="field-input"
            value={emphasis}
            onChange={(e) => setEmphasis(e.target.value)}
            placeholder="I really care about eating well"
          />
          <span className="field-hint">
            This shifts which agent concedes first — it never changes the budget.
          </span>
        </label>
      </div>

      <div className="intake-goal">
        <span className="field-label">The agents will be told</span>
        <code>{goal}</code>
      </div>

      {error ? (
        <p className="intake-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Starting the agents…" : "Send in the agents"}
      </button>
    </form>
  );
}
