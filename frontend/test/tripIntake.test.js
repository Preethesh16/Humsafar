import assert from "node:assert/strict";
import test from "node:test";

import { buildTripGoal, suggestedRooms, tripDays, validateStep } from "../src/lib/tripIntake.js";

const answers = {
  origin: "Mangaluru",
  destination: "Goa",
  travelMode: "compare",
  dateMode: "flexible",
  flexibleDays: 4,
  travelers: 2,
  budget: 30000,
  vibes: ["food", "chill"],
  note: "Avoid red-eye travel",
};

test("a conversational intake becomes one explicit agent goal", () => {
  const goal = buildTripGoal(answers);
  assert.match(goal, /Mangaluru to Goa/);
  assert.match(goal, /compare everything/);
  assert.match(goal, /eat really well/);
  assert.match(goal, /flexible dates/);
  assert.match(goal, /Avoid red-eye travel/);
});

test("exact and flexible trip lengths are deterministic", () => {
  assert.equal(tripDays(answers), 4);
  assert.equal(tripDays({ dateMode: "exact", departureDate: "2026-08-10", returnDate: "2026-08-13" }), 3);
});

test("the wizard validates only the answer currently being requested", () => {
  assert.match(validateStep(0, { ...answers, destination: "" }), /where/);
  assert.match(validateStep(3, { ...answers, dateMode: "exact", departureDate: "2026-08-10", returnDate: "2026-08-09" }), /after/);
  assert.equal(validateStep(5, answers), "");
});

test("room suggestions stay conservative", () => {
  assert.equal(suggestedRooms(1), 1);
  assert.equal(suggestedRooms(3), 2);
});
