import { useEffect, useMemo, useState } from "react";

import { distanceKm, mapPoints, questStops, questStorageKey } from "../lib/journeyGame.js";
import { MascotGuide } from "./MascotGuide.jsx";

export function TripQuest({ plan }) {
  const stops = useMemo(() => questStops(plan), [plan]);
  const storageKey = useMemo(() => questStorageKey(plan), [plan]);
  const [completed, setCompleted] = useState(() => readProgress(storageKey, stops.length));
  const [location, setLocation] = useState(null);
  const [locationState, setLocationState] = useState("idle");
  const [riding, setRiding] = useState(false);

  useEffect(() => {
    setCompleted(readProgress(storageKey, stops.length));
  }, [storageKey, stops.length]);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKey, String(completed));
  }, [completed, storageKey]);

  const points = useMemo(() => mapPoints(stops, location), [stops, location]);
  const stopPoints = points.filter((point) => point.id !== "you");
  const userPoint = points.find((point) => point.id === "you");
  const next = stops[completed] ?? null;
  const nextPoint = stopPoints[completed] ?? null;
  const previousPoint = completed > 0 ? stopPoints[completed - 1] : (userPoint ?? stopPoints[0]);
  const vehiclePoint = riding && nextPoint ? nextPoint : previousPoint;
  const distance = next ? distanceKm(location ?? previousPoint, next) : null;
  const xp = Math.min(completed, stops.length) * 120;

  function locate() {
    if (!globalThis.navigator?.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("finding");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationState("ready");
      },
      () => setLocationState("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function ride() {
    if (!next || riding) return;
    setRiding(true);
    window.setTimeout(() => {
      setCompleted((value) => Math.min(value + 1, stops.length));
      setRiding(false);
    }, 1_300);
  }

  if (!plan || !stops.length) return null;
  const complete = completed >= stops.length;
  const routeLink = next ? directionsUrl(location ?? previousPoint, next) : null;

  return (
    <section className="trip-quest" aria-label="Trip quest and virtual route">
      <MascotGuide
        compact
        message={complete
          ? `Route cleared! ${xp} XP earned. Your mapped plan stays here whenever you need it.`
          : `Next mission: ${next.name}${distance !== null ? ` · ${distance} km from your current marker` : ""}.`}
      />

      <header className="quest-head">
        <div>
          <span className="assistant-kicker">Trip quest · day {next?.day ?? plan.days.at(-1)?.day}</span>
          <h2>{complete ? "Adventure complete" : "Your next station"}</h2>
        </div>
        <div className="quest-xp"><strong>{xp} XP</strong><span>{completed}/{stops.length} stops</span></div>
      </header>

      <div className="quest-map" aria-label="Schematic map of planned stops">
        <svg viewBox="0 0 100 80" role="img" aria-label="Route connecting your itinerary stops">
          <polyline points={stopPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
          {stopPoints.map((point, index) => (
            <g key={point.id} className={index < completed ? "done" : index === completed ? "next" : ""}>
              <circle cx={point.x} cy={point.y} r="2.6" />
              <text x={point.x} y={point.y + 0.9} textAnchor="middle">{index < completed ? "✓" : index + 1}</text>
            </g>
          ))}
          {userPoint ? <circle className="you-dot" cx={userPoint.x} cy={userPoint.y} r="2.2" /> : null}
        </svg>
        {vehiclePoint ? (
          <span
            className={`quest-vehicle ${riding ? "moving" : ""}`}
            style={{ left: `${vehiclePoint.x}%`, top: `${vehiclePoint.y / 0.8}%` }}
            aria-hidden="true"
          >{vehicleFor(plan.localTransportMode)}</span>
        ) : null}
        <span className="quest-map-label">schematic route · use the map link for navigation</span>
      </div>

      <div className="quest-current" aria-live="polite">
        {complete ? (
          <><strong>All planned stations cleared.</strong><span>You can reset this demo without changing the itinerary.</span></>
        ) : (
          <><strong>{next.startAt ? `${next.startAt} · ` : ""}{next.name}</strong><span>{next.address || `Day ${next.day}`}</span></>
        )}
      </div>

      <div className="quest-actions">
        {!complete ? <button type="button" className="run-btn" onClick={ride} disabled={riding}>{riding ? "Travelling…" : `Virtual ride to stop ${completed + 1}`}</button> : null}
        <button type="button" className="secondary-action" onClick={locate} disabled={locationState === "finding"}>
          {locationState === "finding" ? "Finding you…" : locationState === "ready" ? "Refresh my location" : "Use my location"}
        </button>
        {routeLink ? <a className="secondary-action" href={routeLink} target="_blank" rel="noopener noreferrer">Open directions ↗</a> : null}
        {complete ? <button type="button" className="secondary-action" onClick={() => setCompleted(0)}>Replay quest</button> : null}
      </div>
      {["denied", "unavailable"].includes(locationState) ? (
        <p className="quest-note">Location was not available. Virtual mode starts from the previous planned stop; the itinerary still works.</p>
      ) : (
        <p className="quest-note">The animated vehicle is a progress game, not turn-by-turn navigation. Your location stays in this browser and is never sent to Humsafar; opening directions shares the route with Google Maps.</p>
      )}
    </section>
  );
}

function readProgress(key, maximum) {
  if (typeof sessionStorage === "undefined") return 0;
  const value = Number(sessionStorage.getItem(key));
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), maximum) : 0;
}

function directionsUrl(origin, destination) {
  if (!origin || !destination) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  url.searchParams.set("destination", `${destination.latitude},${destination.longitude}`);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

function vehicleFor(mode) {
  if (mode === "walk") return "🚶";
  if (mode === "bicycle") return "🚲";
  if (mode === "scooter") return "🛵";
  if (mode === "transit") return "🚌";
  return "🚕";
}
