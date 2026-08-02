import assert from "node:assert/strict";
import test from "node:test";

import { distanceKm, mapPoints, questStops, questStorageKey } from "../src/lib/journeyGame.js";

const plan = {
  destination: { name: "Goa", placeId: "goa" },
  base: { name: "Goa centre", latitude: 15.49, longitude: 73.82 },
  baseAssumption: "centre",
  days: [{
    day: 1,
    date: "2026-08-10",
    timeline: [
      { type: "place", id: "church", name: "Church", latitude: 15.5, longitude: 73.83, startAt: "09:00" },
      { type: "food", id: "lunch", label: "Lunch" },
    ],
    returnToBase: { arriveAt: "18:00" },
  }],
};

test("quest stops include mapped places and the daily return, never meal suggestions", () => {
  const stops = questStops(plan);
  assert.deepEqual(stops.map((stop) => stop.name), ["Church", "Return to Goa centre"]);
  assert.equal(stops[0].day, 1);
});

test("map points are normalised into the game board", () => {
  const points = mapPoints(questStops(plan), { latitude: 15.48, longitude: 73.81 });
  assert.equal(points.length, 3);
  assert.ok(points.every((point) => point.x >= 8 && point.x <= 92 && point.y >= 8 && point.y <= 72));
});

test("distance uses coordinates and fails closed without them", () => {
  assert.ok(distanceKm(plan.base, plan.days[0].timeline[0]) > 0);
  assert.equal(distanceKm({}, plan.base), null);
});

test("quest progress is isolated by destination and departure date", () => {
  assert.equal(questStorageKey(plan), "humsafar.quest:goa:2026-08-10");
});
