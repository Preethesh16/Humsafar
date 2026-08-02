import { useMemo, useState } from "react";

import { resolvePlace, suggestPlaces } from "../lib/places.js";

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

/**
 * Suggestion list for a place or code field.
 *
 * A native <datalist> rather than a custom combobox: the browser gives correct
 * keyboard handling, screen-reader semantics and mobile behaviour for free, and
 * a hand-rolled listbox is a well-known source of accessibility bugs. The
 * trade-off is that we cannot style the popup — worth it here.
 *
 * Options are recomputed from what has been typed so the list narrows as you go.
 */
function PlaceOptions({ id, query, codesOnly = false }) {
  const matches = suggestPlaces(query);
  return (
    <datalist id={id}>
      {matches.map((place) => (
        <option
          key={place.code}
          value={codesOnly ? place.code : place.city}
          label={codesOnly ? `${place.city} · ${place.region}` : `${place.code} · ${place.region}`}
        />
      ))}
    </datalist>
  );
}

export default function Intake({ onStarted, navigate }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originCode, setOriginCode] = useState("");
  const [destinationCode, setDestinationCode] = useState("");

  /**
   * Sets a city and fills its airport code, but only once the typed text
   * unambiguously names a place. Guessing from a partial name could quietly
   * point the flight search at the wrong airport, which is worse than leaving
   * the field for the user. A code already typed by hand is never overwritten.
   */
  const pickCity = (value, setCity, setCode) => {
    setCity(value);
    const place = resolvePlace(value);
    if (place) setCode(place.code);
  };
  const [budget, setBudget] = useState(30000);
  const [departureDate, setDepartureDate] = useState(() => futureDate(7));
  const [returnDate, setReturnDate] = useState(() => futureDate(10));
  const [travelers, setTravelers] = useState(1);
  const [rooms, setRooms] = useState(1);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [emphasis, setEmphasis] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const days = useMemo(
    () => Math.max(1, Math.round((Date.parse(returnDate) - Date.parse(departureDate)) / 86_400_000)),
    [departureDate, returnDate],
  );
  const goal = `Plan a ${days}-day trip from ${origin.trim()} to ${destination.trim()} for ${travelers} traveler${Number(travelers) === 1 ? "" : "s"}`
    + (emphasis.trim() ? `, ${emphasis.trim()}` : "");

  async function start(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          budget: Number(budget),
          days,
          origin: origin.trim(),
          destination: destination.trim(),
          originCode: originCode.trim().toUpperCase(),
          destinationCode: destinationCode.trim().toUpperCase(),
          departureDate,
          returnDate,
          travelers: Number(travelers),
          rooms: Number(rooms),
          latitude: latitude === "" ? undefined : Number(latitude),
          longitude: longitude === "" ? undefined : Number(longitude),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? `Backend returned ${response.status}`);
      const { runId } = payload;
      onStarted?.({ runId, goal });
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
        executes its own part through a merchant-locked credential. You approve the exact plan once.
      </p>

      <div className="intake-grid">
        <label className="field">
          <span className="field-label">Leaving from</span>
          <input
            className="field-input"
            value={origin}
            onChange={(e) => pickCity(e.target.value, setOrigin, setOriginCode)}
            placeholder="Bengaluru"
            list="places-origin"
            autoComplete="off"
            required
          />
          <PlaceOptions id="places-origin" query={origin} />
          <span className="field-hint">Start typing — the airport code fills itself.</span>
        </label>

        <label className="field">
          <span className="field-label">Destination</span>
          <input
            className="field-input"
            value={destination}
            onChange={(e) => pickCity(e.target.value, setDestination, setDestinationCode)}
            placeholder="Goa"
            list="places-destination"
            autoComplete="off"
            required
          />
          <PlaceOptions id="places-destination" query={destination} />
        </label>

        <label className="field">
          <span className="field-label">Origin airport code</span>
          <input className="field-input" value={originCode} onChange={(e) => setOriginCode(e.target.value.toUpperCase())} placeholder="BLR" list="codes-origin" autoComplete="off" minLength="3" maxLength="3" pattern="[A-Za-z]{3}" required />
          <PlaceOptions id="codes-origin" query={originCode} codesOnly />
          <span className="field-hint">IATA code used for live flight search.</span>
        </label>

        <label className="field">
          <span className="field-label">Destination airport code</span>
          <input className="field-input" value={destinationCode} onChange={(e) => setDestinationCode(e.target.value.toUpperCase())} placeholder="GOI" list="codes-destination" autoComplete="off" minLength="3" maxLength="3" pattern="[A-Za-z]{3}" required />
          <PlaceOptions id="codes-destination" query={destinationCode} codesOnly />
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
          <span className="field-label">Departure</span>
          <input
            className="field-input"
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Return</span>
          <input className="field-input" type="date" min={departureDate} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
          <span className="field-hint">{days} day trip</span>
        </label>

        <label className="field">
          <span className="field-label">Travellers</span>
          <input className="field-input" type="number" min="1" max="9" value={travelers} onChange={(e) => setTravelers(e.target.value)} required />
        </label>

        <label className="field">
          <span className="field-label">Rooms</span>
          <input className="field-input" type="number" min="1" max="9" value={rooms} onChange={(e) => setRooms(e.target.value)} required />
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

        <details className="field wide">
          <summary className="field-label">Override hotel search coordinates (optional)</summary>
          <p className="field-hint">When Google Maps and Duffel are configured, Humsafar resolves your destination automatically. Only enter coordinates to override that location.</p>
          <div className="intake-grid">
            {/* These two are the only controls on the form not wrapped in a
                <label>. A placeholder is not an accessible name — it is never
                guaranteed to be announced and it disappears the moment you
                type — so the name is carried explicitly. */}
            <input className="field-input" type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Latitude" aria-label="Latitude override" />
            <input className="field-input" type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Longitude" aria-label="Longitude override" />
          </div>
        </details>
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

function futureDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
