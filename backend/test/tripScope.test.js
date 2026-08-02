import assert from "node:assert/strict";
import test from "node:test";

import { flightFixtures, foodFixtures, guideFixtures, stayFixtures } from "../src/fixtures/discovery.js";
import { BASELINE, priceMultiplier, scaleFixtures, scopeLabel, tripScope } from "../src/services/tripScope.js";

test("the baseline trip leaves fixture prices exactly as written", () => {
  // integrations.test.js locks the raw totals to guarantee the agents have
  // something to negotiate over. Scaling must be a no-op at the baseline or
  // that invariant quietly stops meaning anything.
  for (const [category, rows] of [
    ["flights", flightFixtures],
    ["stay", stayFixtures],
    ["food", foodFixtures],
    ["guide", guideFixtures],
  ]) {
    const scaled = scaleFixtures(rows, category, { days: 3, travelers: 1, rooms: 1 });
    assert.deepEqual(
      scaled.map((row) => row.price),
      rows.map((row) => row.price),
      `${category} prices must be unchanged at the baseline`,
    );
  }
});

test("missing trip details fall back to the baseline rather than to zero", () => {
  assert.deepEqual(tripScope({}), { days: 3, nights: 2, travelers: 1, rooms: 1 });
  assert.deepEqual(tripScope({ days: 0, travelers: -2, rooms: null }), {
    days: 3,
    nights: 2,
    travelers: 1,
    rooms: 1,
  });
  assert.deepEqual(tripScope({ days: "8", travelers: "4", rooms: "2" }), {
    days: 8,
    nights: 7,
    travelers: 4,
    rooms: 2,
  });
});

test("a one-day trip still books a night rather than zero nights", () => {
  assert.equal(tripScope({ days: 1 }).nights, 1);
});

test("a hotel scales with nights and rooms, not with travellers", () => {
  const scope = tripScope({ days: 8, travelers: 4, rooms: 2 });
  // 7 nights / 2 baseline nights, times 2 rooms.
  assert.equal(priceMultiplier("stay", scope), 7);
  const scaled = scaleFixtures(stayFixtures, "stay", { days: 8, travelers: 4, rooms: 2 });
  assert.equal(scaled[2].price, stayFixtures[2].price * 7);
});

test("meals scale with days and travellers", () => {
  const scope = tripScope({ days: 6, travelers: 2 });
  assert.equal(priceMultiplier("food", scope), 4); // (6/3) * (2/1)
});

test("seats and activity tickets scale with travellers only", () => {
  const scope = tripScope({ days: 30, travelers: 3 });
  assert.equal(priceMultiplier("flights", scope), 3, "a longer trip is not a pricier seat");
  assert.equal(priceMultiplier("guide", scope), 3);
});

test("every row states the scope it covers", () => {
  const scaled = scaleFixtures(stayFixtures, "stay", { days: 8, rooms: 2 });
  assert.ok(scaled[0].description.includes("7 nights, 2 rooms"));

  const meals = scaleFixtures(foodFixtures, "food", { days: 5, travelers: 4 });
  assert.ok(meals[0].description.includes("5 days of meals for 4"));

  assert.ok(scopeLabel("stay", tripScope({ days: 2, rooms: 1 })).includes("1 night, 1 room"));
});

test("descriptions no longer contradict the requested trip", () => {
  // The original rows hard-coded "2 nights" and "for two" whatever was asked,
  // so an 8-day trip for four was described as a 3-day trip for one.
  for (const row of [...stayFixtures, ...foodFixtures, ...guideFixtures]) {
    assert.ok(
      !/\b\d+ (night|day)s?\b/.test(row.description),
      `fixture bakes in a duration: "${row.description}"`,
    );
    assert.ok(!/for two/i.test(row.description), `fixture bakes in a party size: "${row.description}"`);
  }
});

test("scaling preserves identity, rating, ordering and provenance", () => {
  const scaled = scaleFixtures(stayFixtures, "stay", { days: 9, rooms: 3 });
  assert.equal(scaled.length, stayFixtures.length);
  scaled.forEach((row, index) => {
    assert.equal(row.id, stayFixtures[index].id);
    assert.equal(row.vendor, stayFixtures[index].vendor);
    assert.equal(row.rating, stayFixtures[index].rating);
    assert.equal(row.source, "fixture", "scaling must never change provenance");
  });
});

test("prices stay whole rupees", () => {
  const scaled = scaleFixtures(foodFixtures, "food", { days: 4, travelers: 3 });
  for (const row of scaled) {
    assert.equal(row.price, Math.round(row.price), `${row.vendor} priced in fractions`);
  }
});

test("the cheaper option stays cheaper at every trip size", () => {
  // Negotiation only means something if the ordering survives scaling.
  for (const days of [1, 2, 3, 7, 14]) {
    for (const travelers of [1, 2, 5]) {
      const scaled = scaleFixtures(stayFixtures, "stay", { days, travelers, rooms: 1 });
      const prices = scaled.map((row) => row.price);
      const sorted = [...prices].sort((a, b) => a - b);
      assert.deepEqual(prices, sorted, `stay ordering broke at ${days}d/${travelers}p`);
    }
  }
});

test("BASELINE documents the trip the raw fixtures describe", () => {
  assert.equal(BASELINE.days, 3);
  assert.equal(BASELINE.nights, 2);
  assert.equal(tripScope({ days: BASELINE.days }).nights, BASELINE.nights);
});
