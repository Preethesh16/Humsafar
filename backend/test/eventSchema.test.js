import assert from "node:assert/strict";
import test from "node:test";

import { validateEvent } from "../src/events/eventSchema.js";

test("validateEvent accepts the locked agent_message shape", () => {
  assert.equal(validateEvent({
    type: "agent_message",
    agent: "flights",
    message: "I need more budget for the direct flight",
    timestamp: "2026-08-01T08:00:00.000Z",
  }), undefined);
});

test("validateEvent rejects unknown event types", () => {
  assert.match(validateEvent({ type: "made_up" }), /supported event type/);
});

test("validateEvent validates every allocation category", () => {
  assert.match(validateEvent({
    type: "split_update",
    allocations: { flights: 100, stay: 100, food: 100 },
    totalBudget: 300,
    round: 1,
  }), /allocations/);
});
