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

  const points = useMemo(() => mapPoints(stops, location ?? plan?.base), [stops, location, plan?.base]);
  const stopPoints = points.filter((point) => point.id !== "you");
  const originPoint = points.find((point) => point.id === "you") ?? stopPoints[0];
  const routePoints = originPoint ? [originPoint, ...stopPoints] : stopPoints;
  const next = stops[completed] ?? null;
  const previousPoint = routePoints[Math.min(completed, Math.max(routePoints.length - 1, 0))] ?? null;
  const nextPoint = routePoints[completed + 1] ?? null;
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
    }, 1_900);
  }

  if (!plan || !stops.length) return null;
  const complete = completed >= stops.length;
  const routeLink = next ? directionsUrl(location ?? previousPoint, next) : null;

  return (
    <section className="trip-quest" aria-label="Trip quest and virtual route">
      <MascotGuide
        stage
        message={complete
          ? `Route cleared! ${xp} XP earned. Your mapped plan stays here whenever you need it.`
          : `Next mission: ${next.name}${distance !== null ? ` · ${distance} km from your current marker` : ""}.`}
      />
      <div className="quest-game">
        <header className="quest-head">
          <div>
            <span className="assistant-kicker">Trip quest · day {next?.day ?? plan.days.at(-1)?.day}</span>
            <h2>{complete ? "Adventure complete" : "Your next station"}</h2>
          </div>
          <div className="quest-xp"><strong>{xp} XP</strong><span>{completed}/{stops.length} stops</span></div>
        </header>

        <div className="quest-level-progress" aria-label={`${completed} of ${stops.length} trip stations completed`}>
          <span style={{ width: `${stops.length ? (completed / stops.length) * 100 : 0}%` }} />
        </div>

        <div className="quest-map quest-map--3d" aria-label="3D game board of planned stops">
          <svg viewBox="0 0 100 80" role="img" aria-label="Raised route connecting your itinerary stops">
            <defs>
              <linearGradient id="quest-ground" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#bce6cc" /><stop offset="1" stopColor="#75b895" />
              </linearGradient>
              <filter id="quest-shadow" x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="2.4" stdDeviation="1.4" floodColor="#234d38" floodOpacity=".28" />
              </filter>
            </defs>
            <rect width="100" height="80" rx="6" fill="url(#quest-ground)" />
            <g className="quest-scenery" aria-hidden="true">
              <path className="quest-water" d="M0 55 C18 48 26 61 43 55 S76 47 100 58 V80 H0Z" />
              <path className="quest-island" d="M4 15 L19 7 L31 14 L24 27 L9 29Z" />
              <path className="quest-island" d="M76 8 L94 13 L97 28 L82 31 L71 20Z" />
              <g className="quest-tree" transform="translate(14 18)"><path d="M0 7 L4 0 L8 7Z"/><rect x="3.3" y="7" width="1.4" height="3"/></g>
              <g className="quest-tree" transform="translate(86 18) scale(.8)"><path d="M0 7 L4 0 L8 7Z"/><rect x="3.3" y="7" width="1.4" height="3"/></g>
              <g className="quest-tree" transform="translate(8 42) scale(.7)"><path d="M0 7 L4 0 L8 7Z"/><rect x="3.3" y="7" width="1.4" height="3"/></g>
              <g className="quest-tree" transform="translate(88 48) scale(.9)"><path d="M0 7 L4 0 L8 7Z"/><rect x="3.3" y="7" width="1.4" height="3"/></g>
            </g>
            <polyline className="quest-track-depth" points={routePoints.map(pointPair).join(" ")} />
            <polyline className="quest-track-top" filter="url(#quest-shadow)" points={routePoints.map(pointPair).join(" ")} />
            <polyline className="quest-track-guide" points={routePoints.map(pointPair).join(" ")} />
            {routePoints.slice(0, -1).map((point, index) => {
              const end = routePoints[index + 1];
              const state = index < completed ? "painted" : index === completed ? `active ${riding ? "painting" : ""}` : "";
              return <line key={`${point.id}:${end.id}`} className={`quest-painted-segment ${state}`} pathLength="1" x1={point.x} y1={point.y} x2={end.x} y2={end.y} />;
            })}
            {stopPoints.map((point, index) => (
              <g key={point.id} className={`quest-stop ${index < completed ? "done" : index === completed ? "next" : ""}`}>
                <ellipse className="quest-stop-shadow" cx={point.x} cy={point.y + 1.8} rx="3.3" ry="1.5" />
                <circle cx={point.x} cy={point.y} r="3" />
                <text x={point.x} y={point.y + 1} textAnchor="middle">{index < completed ? "✓" : index + 1}</text>
              </g>
            ))}
            {location && originPoint ? (
              <g className="quest-you"><circle cx={originPoint.x} cy={originPoint.y} r="2.2"/><circle cx={originPoint.x} cy={originPoint.y} r="4"/></g>
            ) : null}
          </svg>
          {previousPoint ? (
            <span
              className={`quest-vehicle quest-vehicle--${vehicleClass(plan.localTransportMode)} ${riding ? "moving" : ""}`}
              style={{
                left: `${previousPoint.x}%`, top: `${previousPoint.y / 0.8}%`,
                "--ride-x": `${nextPoint?.x ?? previousPoint.x}%`,
                "--ride-y": `${(nextPoint?.y ?? previousPoint.y) / 0.8}%`,
              }}
              aria-hidden="true"
            ><span>{vehicleFor(plan.localTransportMode)}</span></span>
          ) : null}
          <span className="quest-map-label">3D itinerary game · real stop order, playful map</span>
        </div>

        <div className="quest-current" aria-live="polite">
          {complete ? (
            <><strong>All planned stations cleared.</strong><span>You can replay this route without changing the itinerary.</span></>
          ) : (
            <><strong>{next.startAt ? `${next.startAt} · ` : ""}{next.name}</strong><span>{next.address || `Day ${next.day}`}{distance !== null ? ` · ${distance} km away` : ""}</span></>
          )}
        </div>

        <div className="quest-actions">
          {!complete ? <button type="button" className="run-btn quest-drive" onClick={ride} disabled={riding}>{riding ? "Painting the route…" : `Virtual ride to stop ${completed + 1}`}</button> : null}
          <button type="button" className="secondary-action" onClick={locate} disabled={locationState === "finding"}>
            {locationState === "finding" ? "Finding you…" : locationState === "ready" ? "Refresh my location" : "Use my location"}
          </button>
          {routeLink ? <a className="secondary-action" href={routeLink} target="_blank" rel="noopener noreferrer">Open directions ↗</a> : null}
          {complete ? <button type="button" className="secondary-action" onClick={() => setCompleted(0)}>Replay quest</button> : null}
        </div>
        {["denied", "unavailable"].includes(locationState) ? (
          <p className="quest-note">Location was not available. Virtual mode starts from the itinerary base; the plan still works.</p>
        ) : (
          <p className="quest-note">The 3D board is a progress game, not turn-by-turn navigation. Your location stays in this browser and is never sent to Humsafar; opening directions shares the route with Google Maps.</p>
        )}
      </div>
    </section>
  );
}

function pointPair(point) {
  return `${point.x},${point.y}`;
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

function vehicleClass(mode) {
  return ["walk", "bicycle", "scooter", "transit"].includes(mode) ? mode : "taxi";
}
