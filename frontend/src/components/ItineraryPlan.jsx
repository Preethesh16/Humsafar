import { mapsUrl } from "../lib/maps.js";

export function ItineraryPlan({ plan, compact = false }) {
  if (!plan) return null;
  const variable = plan.estimatedVariableCost;
  return (
    <section className={`itinerary-plan ${compact ? "compact" : ""}`} aria-label="Day-by-day local itinerary">
      <header className="itinerary-plan__head">
        <div>
          <span className="assistant-kicker">Local Planner · real mapped places</span>
          <h2>Your days already connect.</h2>
          <p>{plan.baseAssumption}</p>
        </div>
        {variable ? (
          <div className="itinerary-cost">
            <span>Variable-cost estimate</span>
            <strong>{range(variable)}</strong>
            <em>food + entry estimates, not bookings</em>
          </div>
        ) : null}
      </header>

      {!plan.weather?.available ? (
        <p className="itinerary-weather unavailable">Weather: {plan.weather?.reason ?? "not available yet"}</p>
      ) : null}

      <div className="itinerary-days">
        {plan.days.map((day) => (
          <article className="itinerary-day" key={`${day.day}:${day.date ?? "flexible"}`}>
            <header>
              <div>
                <span>Day {day.day}{day.date ? ` · ${friendlyDate(day.date)}` : ""}</span>
                <h3>{day.title}</h3>
              </div>
              <div className="route-total">
                {day.route.distanceKm} km · {day.route.durationMinutes} min on route
                <small>{day.route.source === "geoapify" ? "Geoapify route" : "route estimate"}</small>
              </div>
            </header>
            {day.weather ? (
              <p className="itinerary-weather">
                {day.weather.condition} · {day.weather.temperatureMinC}–{day.weather.temperatureMaxC}°C · rain {day.weather.precipitationProbability ?? "?"}%
              </p>
            ) : null}
            {day.weatherAdvice ? <p className="itinerary-advice">{day.weatherAdvice}</p> : null}

            <ol className="timeline">
              {day.timeline.map((stop, index) => (
                <li key={`${stop.type}:${stop.id ?? stop.label}:${index}`} className={`timeline-stop ${stop.type}`}>
                  <time>{stop.startAt}</time>
                  {stop.type === "place" ? <PlaceStop stop={stop} /> : <FoodStop stop={stop} />}
                </li>
              ))}
              <li className="timeline-stop return">
                <time>{day.returnToBase.departAt}</time>
                <div>
                  <strong>Return to {day.returnToBase.to}</strong>
                  <p>{day.returnToBase.distanceKm} km · about {day.returnToBase.durationMinutes} min · arrive {day.returnToBase.arriveAt}</p>
                </div>
              </li>
            </ol>
            <p className="day-estimate">Day estimate: {range(day.estimatedCost)} · verify prices at each venue</p>
          </article>
        ))}
      </div>

      <div className="itinerary-truth">
        {plan.truth?.map((line) => <span key={line}>✓ {line}</span>)}
      </div>
    </section>
  );
}

function PlaceStop({ stop }) {
  const map = mapsUrl(stop.name, stop.address);
  return (
    <div>
      <strong>{stop.name}</strong>
      <p>{stop.address}</p>
      <span className="stop-meta">until {stop.endAt} · {stop.estimatedVisitMinutes} min · entry {range(stop.estimatedEntryCost)}</span>
      {stop.travelFromPrevious?.durationMinutes ? (
        <span className="stop-route">From previous: {stop.travelFromPrevious.distanceKm} km · {stop.travelFromPrevious.durationMinutes} min</span>
      ) : null}
      {map ? <a href={map} target="_blank" rel="noopener noreferrer">Open mapped place ↗</a> : null}
    </div>
  );
}

function FoodStop({ stop }) {
  return (
    <div>
      <strong>{stop.label}</strong>
      <p>Nothing is reserved. Pick whichever suits your mood then.</p>
      <div className="food-options">
        {stop.options.map((option) => (
          <span key={option.id}>
            <b>{option.name}</b> · {range(option.estimatedCost)}
          </span>
        ))}
      </div>
    </div>
  );
}

function range(value) {
  if (!value) return "estimate unavailable";
  const money = (amount) => `₹${Number(amount).toLocaleString("en-IN")}`;
  return value.minimum === value.maximum ? money(value.minimum) : `${money(value.minimum)}–${money(value.maximum)}`;
}

function friendlyDate(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}
