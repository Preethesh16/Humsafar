import assert from "node:assert/strict";
import test from "node:test";

import { distanceKm, mapPoints, questLevel, questStops, questStorageKey } from "../src/lib/journeyGame.js";

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

test("quest level shows only the active day and resets its local progress", () => {
  const multiDay = {
    ...plan,
    days: [
      plan.days[0],
      {
        ...plan.days[0],
        day: 2,
        date: "2026-08-11",
        timeline: [{ type: "place", id: "beach", name: "Beach", latitude: 15.51, longitude: 73.84 }],
      },
    ],
  };
  const stops = questStops(multiDay);
  const dayOneCount = stops.filter((stop) => stop.day === 1).length;

  assert.deepEqual(questLevel(stops, 1), {
    day: 1,
    stops: stops.slice(0, dayOneCount),
    startIndex: 0,
    completed: 1,
    total: dayOneCount,
  });

  const second = questLevel(stops, dayOneCount);
  assert.equal(second.day, 2);
  assert.equal(second.completed, 0);
  assert.equal(second.startIndex, dayOneCount);
  assert.ok(second.stops.every((stop) => stop.day === 2));

  const complete = questLevel(stops, stops.length);
  assert.equal(complete.day, 2);
  assert.equal(complete.completed, complete.total);
});

test("map points are normalised into the game board", () => {
  const points = mapPoints(questStops(plan), { latitude: 15.48, longitude: 73.81 });
  assert.equal(points.length, 3);
  assert.ok(points.every((point) => point.x >= 8 && point.x <= 92 && point.y >= 8 && point.y <= 72));
});

test("map points separate nearby stations instead of rendering marker blobs", () => {
  const points = mapPoints([
    { id: "a", latitude: 15.5, longitude: 73.8 },
    { id: "b", latitude: 15.5, longitude: 73.8 },
    { id: "c", latitude: 15.50001, longitude: 73.80001 },
  ]);
  for (let right = 0; right < points.length; right += 1) {
    for (let left = 0; left < right; left += 1) {
      assert.ok(Math.hypot(points[right].x - points[left].x, points[right].y - points[left].y) >= 9);
    }
  }
});

test("distance uses coordinates and fails closed without them", () => {
  assert.ok(distanceKm(plan.base, plan.days[0].timeline[0]) > 0);
  assert.equal(distanceKm({}, plan.base), null);
});

test("quest progress is isolated by destination and departure date", () => {
  assert.equal(questStorageKey(plan), "humsafar.quest:goa:2026-08-10");
});
