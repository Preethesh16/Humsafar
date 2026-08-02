import { useEffect, useMemo, useState } from "react";

import { ItineraryPlan } from "../components/ItineraryPlan.jsx";
import { MascotGuide } from "../components/MascotGuide.jsx";
import { fetchPlaceSuggestions, itineraryRequest, previewItinerary } from "../lib/itinerary.js";
import { suggestPlaces } from "../lib/places.js";

import {
  buildTripGoal,
  LOCAL_TRANSPORT_MODES,
  PLACE_INTERESTS,
  PLANNING_MODES,
  STAY_STYLES,
  suggestedRooms,
  TRAVEL_MODES,
  TRIP_PARTS,
  TRIP_PACES,
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
  { title: "What should Humsafar handle?", helper: "Switch off anything you have already sorted. You stay in control of the trip scope." },
  { title: "What is the hard spending limit?", helper: "One shared pot. The agents can trade slices, never cross it." },
  { title: "What would make this trip feel right?", helper: "Pick as many as you care about. You can also say it in your own words." },
  { title: "How much of the day plan should I decide?", helper: "Pick mapped places yourself, or let the Local Planner connect sensible nearby stops for you." },
  { title: "Did I understand you correctly?", helper: "Nothing is booked yet. This sends the brief to the agent team." },
];

const CAT_TIPS = [
  "Name the feeling or the place—ordinary language is enough.",
  "I will compare the route from where you actually begin.",
  "Pick compare if speed, comfort and cost are all negotiable.",
  "A nearby date helps me fetch provider prices and real weather.",
  "Group size changes rooms, fares and the budget split.",
  "Switch off anything you already handled; that agent gets nothing.",
  "This is the hard ceiling. No agent can borrow past it.",
  "Your priorities decide which specialist concedes first.",
  "Easy mode gives me the map; choose mode gives you veto power.",
  "Read the route once. Nothing leaves without your approval.",
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
    categories: TRIP_PARTS.map((part) => part.id),
    stayStyle: "compare",
    budget: 30000,
    vibes: [],
    note: "",
    placePlanningMode: "decide",
    placeInterests: [],
    selectedPlaceIds: [],
    pace: "balanced",
    localTransportMode: "drive",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState(null);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const [itinerary, setItinerary] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planAttempt, setPlanAttempt] = useState(0);

  const days = useMemo(() => tripDays(answers), [answers]);
  const goal = useMemo(() => buildTripGoal(answers), [answers]);
  const question = QUESTIONS[step];
  const isReview = step === QUESTIONS.length - 1;
  const planInput = useMemo(() => itineraryRequest(answers, days), [answers, days]);
  const planKey = useMemo(() => JSON.stringify(planInput), [planInput]);

  useEffect(() => {
    if (!isReview) return undefined;
    let current = true;
    setPlanBusy(true);
    setItinerary(null);
    setError("");
    previewItinerary(planInput)
      .then((result) => {
        if (current) setItinerary(result);
      })
      .catch((cause) => {
        if (current) setError(`Could not build the local route (${cause.message}).`);
      })
      .finally(() => {
        if (current) setPlanBusy(false);
      });
    return () => { current = false; };
  }, [isReview, planKey, planAttempt]);

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

  function togglePlaceInterest(id) {
    setAnswers((current) => ({
      ...current,
      placeInterests: current.placeInterests.includes(id)
        ? current.placeInterests.filter((item) => item !== id)
        : [...current.placeInterests, id],
      selectedPlaceIds: [],
    }));
    setPlaceSuggestions(null);
    setError("");
  }

  function togglePlace(id) {
    setAnswers((current) => ({
      ...current,
      selectedPlaceIds: current.selectedPlaceIds.includes(id)
        ? current.selectedPlaceIds.filter((item) => item !== id)
        : [...current.selectedPlaceIds, id],
    }));
    setError("");
  }

  async function loadPlaceSuggestions() {
    setSuggestionsBusy(true);
    setError("");
    try {
      const result = await fetchPlaceSuggestions(planInput);
      setPlaceSuggestions(result);
    } catch (cause) {
      setError(`Could not load mapped places (${cause.message}).`);
    } finally {
      setSuggestionsBusy(false);
    }
  }

  function togglePart(id) {
    setAnswers((current) => ({
      ...current,
      categories: current.categories.includes(id)
        ? current.categories.filter((item) => item !== id)
        : [...current.categories, id],
    }));
    setError("");
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
    if (!itinerary) {
      setPlanAttempt((value) => value + 1);
      return setError("The mapped day plan must finish before the booking agents start.");
    }
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
          departureDate: answers.departureDate,
          returnDate: effectiveReturnDate(answers, days),
          travelers: Number(answers.travelers),
          rooms: Number(answers.rooms),
          travelMode: answers.travelMode,
          dateFlexibility: answers.dateMode,
          includedCategories: answers.categories,
          stayStyle: answers.stayStyle,
          placePlanningMode: answers.placePlanningMode,
          placeInterests: answers.placeInterests,
          selectedPlaceIds: answers.selectedPlaceIds,
          pace: answers.pace,
          localTransportMode: answers.localTransportMode,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? `Backend returned ${response.status}`);
      onStarted?.({ runId: payload.runId, goal, itinerary });
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
        <span className="brand-mark" aria-hidden="true">H</span>
        <span>Humsafar</span>
        <span className="conversation-mode">trip concierge</span>
      </header>

      <div
        className="conversation-progress"
        role="progressbar"
        aria-label="Trip questions completed"
        aria-valuemin="1"
        aria-valuemax={QUESTIONS.length}
        aria-valuenow={step + 1}
      >
        <span style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
      </div>

      <form className="conversation" onSubmit={submit}>
        <div className="intake-stage">
          <MascotGuide stage message={CAT_TIPS[step]} label={`Milo · question ${step + 1}`} />
          <div className="intake-dialog">
            <section className="assistant-prompt" aria-live="polite">
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
              label="Trip destination"
              suggestId="places-destination"
              autoFocus
            />
          )}

          {step === 1 && (
            <TextAnswer
              value={answers.origin}
              onChange={(value) => update("origin", value)}
              placeholder="Mangaluru"
              label="Leaving from"
              suggestId="places-origin"
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
                <>
                  <div className="quick-row" aria-label="Trip duration">
                    {DURATIONS.map((duration) => (
                      <button type="button" className={answers.flexibleDays === duration ? "selected" : ""} key={duration} onClick={() => update("flexibleDays", duration)}>{duration} days</button>
                    ))}
                  </div>
                  <label className="compact-input"><span>Start around (needed for live prices and weather)</span><input type="date" value={answers.departureDate} onChange={(event) => update("departureDate", event.target.value)} /></label>
                </>
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
              <div className="scope-grid" aria-label="Parts of the trip Humsafar should handle">
                {TRIP_PARTS.map((part) => (
                  <button
                    type="button"
                    className={`scope-option ${answers.categories.includes(part.id) ? "selected" : ""}`}
                    key={part.id}
                    onClick={() => togglePart(part.id)}
                    aria-pressed={answers.categories.includes(part.id)}
                  >
                    <span className="scope-check" aria-hidden="true">{answers.categories.includes(part.id) ? "✓" : "–"}</span>
                    <strong>{part.label}</strong>
                    <span>{part.note}</span>
                  </button>
                ))}
              </div>

              {answers.categories.includes("stay") && (
                <div className="stay-preference">
                  <div>
                    <strong>What kind of stay?</strong>
                    <span>{Number(answers.travelers) >= 3 ? "For your group, comparing an entire home or villa can beat multiple hotel rooms." : "Choose one, or compare all property types."}</span>
                  </div>
                  <div className="answer-options stay-options">
                    {STAY_STYLES.map((style) => (
                      <button
                        className={`answer-option ${answers.stayStyle === style.id ? "selected" : ""}`}
                        type="button"
                        key={style.id}
                        onClick={() => update("stayStyle", style.id)}
                        aria-pressed={answers.stayStyle === style.id}
                      >
                        <strong>{style.label}</strong>
                        <span>{style.note}</span>
                        {style.id === "home" && Number(answers.travelers) >= 3 && <em>Good for this group</em>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="answer-note">A disabled specialist gets ₹0 and will not appear in negotiation or checkout.</p>
            </>
          )}

          {step === 6 && (
            <>
              <div className="quick-row budget-options" aria-label="Budget suggestions">
                {BUDGETS.map((amount) => (
                  <button type="button" className={Number(answers.budget) === amount ? "selected" : ""} key={amount} onClick={() => update("budget", amount)}>{money(amount)}</button>
                ))}
              </div>
              <label className="money-answer"><span>₹</span><input type="number" min="5000" step="500" value={answers.budget} onChange={(event) => update("budget", event.target.value)} aria-label="Custom total budget in rupees" /></label>
              <p className="answer-note">This ceiling covers only the parts you selected, for the whole group.</p>
            </>
          )}

          {step === 7 && (
            <>
              <div className="vibe-grid">
                {TRIP_VIBES.map((vibe) => (
                  <button type="button" className={answers.vibes.includes(vibe.id) ? "selected" : ""} key={vibe.id} onClick={() => toggleVibe(vibe.id)} aria-pressed={answers.vibes.includes(vibe.id)}>{vibe.label}</button>
                ))}
              </div>
              <textarea className="free-answer" value={answers.note} onChange={(event) => update("note", event.target.value)} placeholder="Anything else? For example: no overnight buses, safe for parents, vegetarian food…" aria-label="Anything else Humsafar should know" rows="3" />
            </>
          )}

          {step === 8 && (
            <>
              <div className="answer-options planner-mode-options">
                {PLANNING_MODES.map((mode) => (
                  <button
                    className={`answer-option ${answers.placePlanningMode === mode.id ? "selected" : ""}`}
                    type="button"
                    key={mode.id}
                    onClick={() => {
                      update("placePlanningMode", mode.id);
                      if (mode.id === "decide") update("selectedPlaceIds", []);
                    }}
                    aria-pressed={answers.placePlanningMode === mode.id}
                  >
                    <strong>{mode.label}</strong><span>{mode.note}</span>
                    {mode.id === "decide" ? <em>Easy mode</em> : null}
                  </button>
                ))}
              </div>

              <div className="planner-subquestion">
                <strong>What sounds good?</strong>
                <div className="vibe-grid">
                  {PLACE_INTERESTS.map((interest) => (
                    <button type="button" className={answers.placeInterests.includes(interest.id) ? "selected" : ""} key={interest.id} onClick={() => togglePlaceInterest(interest.id)} aria-pressed={answers.placeInterests.includes(interest.id)}>{interest.label}</button>
                  ))}
                </div>
              </div>

              <div className="planner-controls">
                <label>
                  <span>Daily pace</span>
                  <select value={answers.pace} onChange={(event) => update("pace", event.target.value)}>
                    {TRIP_PACES.map((pace) => <option key={pace.id} value={pace.id}>{pace.label} · {pace.note}</option>)}
                  </select>
                </label>
                <label>
                  <span>Getting around locally</span>
                  <select value={answers.localTransportMode} onChange={(event) => update("localTransportMode", event.target.value)}>
                    {LOCAL_TRANSPORT_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                  </select>
                </label>
              </div>

              {answers.placePlanningMode === "choose" ? (
                <div className="mapped-place-picker">
                  <button className="secondary-action" type="button" onClick={loadPlaceSuggestions} disabled={suggestionsBusy}>
                    {suggestionsBusy ? "Finding real places…" : placeSuggestions ? "Refresh mapped suggestions" : "Show mapped suggestions"}
                  </button>
                  {placeSuggestions ? (
                    <>
                      <p className="answer-note">{placeSuggestions.selectionBasis} These are mapped suggestions, not live ticket availability.</p>
                      <div className="mapped-place-grid">
                        {placeSuggestions.places.map((place) => (
                          <button
                            type="button"
                            className={`mapped-place ${answers.selectedPlaceIds.includes(place.id) ? "selected" : ""}`}
                            key={place.id}
                            onClick={() => togglePlace(place.id)}
                            aria-pressed={answers.selectedPlaceIds.includes(place.id)}
                          >
                            <span>{answers.selectedPlaceIds.includes(place.id) ? "✓ Included" : "Add to trip"}</span>
                            <strong>{place.name}</strong>
                            <small>{place.area || place.address}</small>
                            <em>{place.kind} · {place.estimatedVisitMinutes} min</em>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="answer-note">The planner will select real places matching these interests, keep nearby stops together, include food possibilities without reserving them, and return you to the stay each evening.</p>
              )}
            </>
          )}

              {isReview && <TripReview answers={answers} days={days} goal={goal} itinerary={itinerary} planBusy={planBusy} onRetry={() => setPlanAttempt((value) => value + 1)} onEdit={setStep} />}
            </section>

            {error && <p className="conversation-error" role="alert">{error}</p>}

            <nav className="conversation-actions" aria-label="Trip questions">
              <button className="back-action" type="button" onClick={back} disabled={step === 0 || busy}>Back</button>
              <button className="primary next-action" type="submit" disabled={busy}>
                {busy ? "Waking up the agents…" : isReview ? "Start planning agents" : "Continue"}
              </button>
            </nav>
          </div>
        </div>
      </form>

      <p className="intake-truth">Planning and negotiation are live. Free-data results and simulations are labelled; Humsafar never calls a link a booking.</p>
    </main>
  );
}

function TextAnswer({ value, onChange, placeholder, label, autoFocus = false, suggestId }) {
  return (
    <>
      <input
        className="big-answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        list={suggestId}
        autoComplete="off"
      />
      {suggestId ? <PlaceSuggestions id={suggestId} query={value} /> : null}
    </>
  );
}

/**
 * Type-ahead for the two place questions.
 *
 * A native <datalist> rather than a custom combobox: the browser gives correct
 * keyboard handling, screen-reader semantics and mobile behaviour for free, and
 * a hand-rolled listbox is a well-known source of accessibility bugs. We lose
 * control of the popup's styling, which is the right trade here.
 *
 * The list narrows as you type and never blocks free text — this flow is
 * deliberately free-first, so "somewhere quiet near the sea" must still be a
 * valid answer. Suggestions are a shortcut, not a constraint.
 */
function PlaceSuggestions({ id, query }) {
  return (
    <datalist id={id}>
      {suggestPlaces(query).map((place) => (
        <option key={place.code} value={place.city} label={`${place.code} · ${place.region}`} />
      ))}
    </datalist>
  );
}

function TripReview({ answers, days, goal, itinerary, planBusy, onRetry, onEdit }) {
  const handled = TRIP_PARTS.filter((part) => answers.categories.includes(part.id)).map((part) => part.label).join(", ");
  const stay = STAY_STYLES.find((item) => item.id === answers.stayStyle)?.label;
  const rows = [
    ["Trip", `${answers.origin} → ${answers.destination}`, 0],
    ["Travel", TRAVEL_MODES.find((item) => item.id === answers.travelMode)?.label, 2],
    ["When", answers.dateMode === "exact" ? `${answers.departureDate} → ${answers.returnDate}` : `Flexible · about ${days} days · around ${answers.departureDate}`, 3],
    ["People", `${answers.travelers} traveller${Number(answers.travelers) === 1 ? "" : "s"} · ${answers.rooms} room${answers.rooms === 1 ? "" : "s"}`, 4],
    ["Handling", handled, 5],
    ...(answers.categories.includes("stay") ? [["Stay", stay, 5]] : []),
    ["Ceiling", money(Number(answers.budget)), 6],
    ["Day planner", answers.placePlanningMode === "choose" ? `${answers.selectedPlaceIds.length} places selected` : "Humsafar decides", 8],
    ["Pace", `${answers.pace} · local ${answers.localTransportMode}`, 8],
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
      {planBusy ? <div className="planner-loading" role="status">Connecting real places into sensible days…</div> : null}
      {!planBusy && !itinerary ? <button type="button" className="secondary-action" onClick={onRetry}>Retry local plan</button> : null}
      <ItineraryPlan plan={itinerary} />
      <p className="answer-note">The local route is advisory. Next, the buying agents discover travel/stay options, negotiate one shared budget, and wait for your exact approval.</p>
    </>
  );
}

function futureDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function effectiveReturnDate(answers, days) {
  if (answers.dateMode === "exact") return answers.returnDate;
  if (!answers.departureDate) return undefined;
  const date = new Date(`${answers.departureDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}
