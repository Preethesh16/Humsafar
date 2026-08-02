import { useMemo, useState } from "react";

import {
  buildTripGoal,
  suggestedRooms,
  TRAVEL_MODES,
  TRIP_VIBES,
  tripDays,
  validateStep,
} from "../lib/tripIntake.js";

const QUESTIONS = [
  { title: "Where do you want to disappear to?", helper: "A city, state, beach, mountains—say it normally." },
  { title: "Where are you starting from?", helper: "No airport codes. Humsafar will work out the route." },
  { title: "How do you feel about getting there?", helper: "If you do not care, let the Journey Agent compare the trade-offs." },
  { title: "When can you go?", helper: "Exact dates are useful, but flexible is completely fine." },
  { title: "Who is coming?", helper: "This changes transport, rooms, meals and the total plan." },
  { title: "What is the hard spending limit?", helper: "One shared pot. The agents can trade slices, never cross it." },
  { title: "What would make this trip feel right?", helper: "Pick as many as you care about. You can also say it in your own words." },
  { title: "Did I understand you correctly?", helper: "Nothing is booked yet. This sends the brief to the agent team." },
];

const BUDGETS = [15000, 30000, 50000, 75000];
const PARTY_SIZES = [1, 2, 3, 4, 6];
const DURATIONS = [2, 3, 5, 7];

export default function Intake({ onStarted, navigate }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => ({
    destination: "",
    origin: "",
    travelMode: "compare",
    dateMode: "flexible",
    flexibleDays: 3,
    departureDate: futureDate(7),
    returnDate: futureDate(10),
    travelers: 1,
    rooms: 1,
    budget: 30000,
    vibes: [],
    note: "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const days = useMemo(() => tripDays(answers), [answers]);
  const goal = useMemo(() => buildTripGoal(answers), [answers]);
  const question = QUESTIONS[step];
  const isReview = step === QUESTIONS.length - 1;

  function update(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function chooseParty(value) {
    setAnswers((current) => ({
      ...current,
      travelers: value,
      rooms: suggestedRooms(value),
    }));
    setError("");
  }

  function toggleVibe(id) {
    setAnswers((current) => ({
      ...current,
      vibes: current.vibes.includes(id)
        ? current.vibes.filter((item) => item !== id)
        : [...current.vibes, id],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!isReview) {
      const problem = validateStep(step, answers);
      if (problem) return setError(problem);
      setStep((current) => current + 1);
      setError("");
      return;
    }

    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          budget: Number(answers.budget),
          days,
          origin: answers.origin.trim(),
          destination: answers.destination.trim(),
          departureDate: answers.dateMode === "exact" ? answers.departureDate : undefined,
          returnDate: answers.dateMode === "exact" ? answers.returnDate : undefined,
          travelers: Number(answers.travelers),
          rooms: Number(answers.rooms),
          travelMode: answers.travelMode,
          dateFlexibility: answers.dateMode,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? `Backend returned ${response.status}`);
      onStarted?.({ runId: payload.runId, goal });
      navigate(`/deliberate?runId=${encodeURIComponent(payload.runId)}`);
    } catch (cause) {
      setError(`Could not start the live agent team (${cause.message}).`);
      setBusy(false);
    }
  }

  function back() {
    setStep((current) => Math.max(0, current - 1));
    setError("");
  }

  return (
    <main className="conversation-shell">
      <header className="conversation-brand">
        <span className="brand-mark">H</span>
        <span>Humsafar</span>
        <span className="conversation-mode">trip concierge</span>
      </header>

      <div className="conversation-progress" aria-label={`Question ${step + 1} of ${QUESTIONS.length}`}>
        <span style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
      </div>

      <form className="conversation" onSubmit={submit}>
        <section className="assistant-prompt" aria-live="polite">
          <span className="assistant-avatar">H</span>
          <div>
            <p className="assistant-kicker">Question {step + 1} of {QUESTIONS.length}</p>
            <h1>{question.title}</h1>
            <p>{question.helper}</p>
          </div>
        </section>

        <section className="answer-card">
          {step === 0 && (
            <TextAnswer
              value={answers.destination}
              onChange={(value) => update("destination", value)}
              placeholder="Goa, Jaipur, somewhere quiet near the sea…"
              autoFocus
            />
          )}

          {step === 1 && (
            <TextAnswer
              value={answers.origin}
              onChange={(value) => update("origin", value)}
              placeholder="Mangaluru"
              autoFocus
            />
          )}

          {step === 2 && (
            <div className="answer-options travel-options">
              {TRAVEL_MODES.map((mode) => (
                <button
                  className={`answer-option ${answers.travelMode === mode.id ? "selected" : ""}`}
                  type="button"
                  key={mode.id}
                  onClick={() => update("travelMode", mode.id)}
                  aria-pressed={answers.travelMode === mode.id}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.note}</span>
                  {mode.id === "compare" && <em>Recommended</em>}
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <>
              <div className="segmented-choice" role="group" aria-label="Date preference">
                <button type="button" className={answers.dateMode === "flexible" ? "selected" : ""} onClick={() => update("dateMode", "flexible")}>I am flexible</button>
                <button type="button" className={answers.dateMode === "exact" ? "selected" : ""} onClick={() => update("dateMode", "exact")}>I know my dates</button>
              </div>
              {answers.dateMode === "flexible" ? (
                <div className="quick-row" aria-label="Trip duration">
                  {DURATIONS.map((duration) => (
                    <button type="button" className={answers.flexibleDays === duration ? "selected" : ""} key={duration} onClick={() => update("flexibleDays", duration)}>{duration} days</button>
                  ))}
                </div>
              ) : (
                <div className="date-pair">
                  <label><span>Leave</span><input type="date" value={answers.departureDate} onChange={(event) => update("departureDate", event.target.value)} /></label>
                  <label><span>Come back</span><input type="date" min={answers.departureDate} value={answers.returnDate} onChange={(event) => update("returnDate", event.target.value)} /></label>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div className="quick-row" aria-label="Number of travellers">
                {PARTY_SIZES.map((count) => (
                  <button type="button" className={Number(answers.travelers) === count ? "selected" : ""} key={count} onClick={() => chooseParty(count)}>{count === 1 ? "Just me" : `${count} people`}</button>
                ))}
              </div>
              <label className="compact-input"><span>Or enter a group size</span><input type="number" min="1" max="9" value={answers.travelers} onChange={(event) => chooseParty(Number(event.target.value))} /></label>
            </>
          )}

          {step === 5 && (
            <>
              <div className="quick-row budget-options" aria-label="Budget suggestions">
                {BUDGETS.map((amount) => (
                  <button type="button" className={Number(answers.budget) === amount ? "selected" : ""} key={amount} onClick={() => update("budget", amount)}>{money(amount)}</button>
                ))}
              </div>
              <label className="money-answer"><span>₹</span><input type="number" min="5000" step="500" value={answers.budget} onChange={(event) => update("budget", event.target.value)} aria-label="Custom total budget in rupees" /></label>
              <p className="answer-note">Includes the journey, stay, food and things to do for the whole group.</p>
            </>
          )}

          {step === 6 && (
            <>
              <div className="vibe-grid">
                {TRIP_VIBES.map((vibe) => (
                  <button type="button" className={answers.vibes.includes(vibe.id) ? "selected" : ""} key={vibe.id} onClick={() => toggleVibe(vibe.id)} aria-pressed={answers.vibes.includes(vibe.id)}>{vibe.label}</button>
                ))}
              </div>
              <textarea className="free-answer" value={answers.note} onChange={(event) => update("note", event.target.value)} placeholder="Anything else? For example: no overnight buses, safe for parents, vegetarian food…" rows="3" />
            </>
          )}

          {isReview && <TripReview answers={answers} days={days} goal={goal} onEdit={setStep} />}
        </section>

        {error && <p className="conversation-error" role="alert">{error}</p>}

        <nav className="conversation-actions" aria-label="Trip questions">
          <button className="back-action" type="button" onClick={back} disabled={step === 0 || busy}>Back</button>
          <button className="primary next-action" type="submit" disabled={busy}>
            {busy ? "Waking up the agents…" : isReview ? "Build my plan" : "Continue"}
          </button>
        </nav>
      </form>

      <p className="intake-truth">Planning and negotiation are live. Free-data results and simulations are labelled; Humsafar never calls a link a booking.</p>
    </main>
  );
}

function TextAnswer({ value, onChange, placeholder, autoFocus = false }) {
  return <input className="big-answer" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoFocus={autoFocus} />;
}

function TripReview({ answers, days, goal, onEdit }) {
  const rows = [
    ["Trip", `${answers.origin} → ${answers.destination}`, 0],
    ["Travel", TRAVEL_MODES.find((item) => item.id === answers.travelMode)?.label, 2],
    ["When", answers.dateMode === "exact" ? `${answers.departureDate} → ${answers.returnDate}` : `Flexible · about ${days} days`, 3],
    ["People", `${answers.travelers} traveller${Number(answers.travelers) === 1 ? "" : "s"} · ${answers.rooms} room${answers.rooms === 1 ? "" : "s"}`, 4],
    ["Ceiling", money(Number(answers.budget)), 5],
  ];
  return (
    <>
      <div className="review-grid">
        {rows.map(([label, value, editStep]) => (
          <button type="button" className="review-row" key={label} onClick={() => onEdit(editStep)}>
            <span>{label}</span><strong>{value}</strong><em>Edit</em>
          </button>
        ))}
      </div>
      <div className="agent-brief"><span>The agents receive</span><p>{goal}</p></div>
      <p className="answer-note">First they discover options and negotiate the one shared budget. You still choose the shortlist and approve the exact plan.</p>
    </>
  );
}

function futureDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function money(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}
