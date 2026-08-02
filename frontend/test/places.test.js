import assert from "node:assert/strict";
import test from "node:test";

import { PLACES, resolvePlace, suggestPlaces } from "../src/lib/places.js";

test("typing B offers Bengaluru first", () => {
  const [first] = suggestPlaces("B");
  assert.equal(first.city, "Bengaluru");
});

test("prefix matches outrank substring matches", () => {
  const cities = suggestPlaces("go").map((p) => p.city);
  assert.equal(cities[0], "Goa", `expected Goa first, got ${cities.join(", ")}`);
});

test("an exact IATA code wins outright", () => {
  const [first] = suggestPlaces("GOI");
  assert.equal(first.code, "GOI");
});

test("codes are searchable in lower case", () => {
  assert.equal(suggestPlaces("blr")[0].code, "BLR");
});

test("accents are ignored so \"male\" finds Malé", () => {
  assert.ok(suggestPlaces("male").some((p) => p.code === "MLE"));
});

test("a region name finds its cities", () => {
  assert.ok(suggestPlaces("Thailand").some((p) => p.code === "BKK"));
});

test("an empty query still offers somewhere to start", () => {
  assert.ok(suggestPlaces("").length > 0);
});

test("nonsense returns nothing rather than a wrong guess", () => {
  assert.deepEqual(suggestPlaces("zzzzzz"), []);
});

test("results are capped so the dropdown stays usable", () => {
  assert.ok(suggestPlaces("a", { limit: 5 }).length <= 5);
});

test("resolvePlace only accepts an exact city or code", () => {
  assert.equal(resolvePlace("Bengaluru").code, "BLR");
  assert.equal(resolvePlace("bengaluru").code, "BLR");
  assert.equal(resolvePlace("BLR").city, "Bengaluru");
  // A partial name must NOT resolve — guessing here could send the flight
  // search to the wrong airport, which is worse than an empty field.
  assert.equal(resolvePlace("Beng"), null);
  assert.equal(resolvePlace(""), null);
  assert.equal(resolvePlace(undefined), null);
});

test("every row has a well-formed IATA code and no duplicates", () => {
  const codes = new Set();
  for (const place of PLACES) {
    assert.match(place.code, /^[A-Z]{3}$/, `${place.city} has a malformed code`);
    assert.ok(place.city.trim().length > 0);
    assert.ok(!codes.has(place.code), `duplicate code ${place.code}`);
    codes.add(place.code);
  }
});

test("the two cities the demo uses are present", () => {
  assert.equal(resolvePlace("Bengaluru").code, "BLR");
  assert.equal(resolvePlace("Goa").code, "GOI");
});
