import assert from "node:assert/strict";
import test from "node:test";

import { PHASES, initialState, reduce, summarize } from "../src/state/sessionReducer.js";

/** Folds a list of raw events, auto-numbering ids like the SSE stream does. */
function fold(events, start = initialState()) {
  return events.reduce((state, event, index) => reduce(state, { id: index + 1, event }), start);
}

test("ignores frames without a usable event type", () => {
  const state = initialState();
  assert.equal(reduce(state, { id: 1, event: null }), state);
  assert.equal(reduce(state, { id: 1, event: { nope: true } }), state);
  assert.equal(reduce(state, undefined), state);
});

test("agent_message enters the negotiating phase and appends to the feed", () => {
  const state = fold([
    { type: "agent_message", agent: "flights", message: "I need 12000", timestamp: "2026-08-01T09:00:00.000Z" },
  ]);

  assert.equal(state.phase, PHASES.NEGOTIATING);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].agent, "flights");
  assert.equal(state.messages[0].message, "I need 12000");
});

test("split_update replaces allocations rather than merging stale agents", () => {
  const state = fold([
    { type: "split_update", allocations: { flights: 12000, stay: 11000, food: 6000, guide: 5000 }, totalBudget: 30000, round: 1 },
    { type: "split_update", allocations: { flights: 11800, stay: 9200, food: 5000, guide: 4000 }, totalBudget: 30000, round: 3 },
  ]);

  assert.deepEqual(state.allocations, { flights: 11800, stay: 9200, food: 5000, guide: 4000 });
  assert.equal(state.round, 3);
  assert.equal(state.totalBudget, 30000);
});

test("summarize flags an over-budget split during contention", () => {
  const state = fold([
    { type: "split_update", allocations: { flights: 12000, stay: 11000, food: 6000, guide: 5000 }, totalBudget: 30000, round: 1 },
  ]);
  const summary = summarize(state);

  assert.equal(summary.allocated, 34000);
  assert.equal(summary.overBudget, true);
  assert.equal(summary.unallocated, 0);
});

test("summarize reports headroom once the split converges", () => {
  const state = fold([
    { type: "split_update", allocations: { flights: 11800, stay: 9200, food: 5000, guide: 3000 }, totalBudget: 30000, round: 3 },
  ]);
  const summary = summarize(state);

  assert.equal(summary.allocated, 29000);
  assert.equal(summary.overBudget, false);
  assert.equal(summary.unallocated, 1000);
});

test("approval flow moves idle -> awaiting approval -> purchasing", () => {
  const allocations = { flights: 11800, stay: 9200, food: 5000, guide: 4000 };
  const requested = fold([{ type: "approval_requested", allocations }]);
  assert.equal(requested.phase, PHASES.AWAITING_APPROVAL);
  assert.deepEqual(requested.approval.requestedAllocations, allocations);
  assert.equal(requested.approval.given, false);

  const given = reduce(requested, { id: 2, event: { type: "approval_given", timestamp: "2026-08-01T09:00:21.000Z" } });
  assert.equal(given.phase, PHASES.PURCHASING);
  assert.equal(given.approval.given, true);
  assert.equal(given.approval.givenAt, "2026-08-01T09:00:21.000Z");
});

test("a re-issued card for the same agent replaces the previous credential", () => {
  const state = fold([
    { type: "card_issued", agent: "guide", cardId: "instr_a", amountCap: 4000 },
    { type: "card_issued", agent: "guide", cardId: "instr_b", amountCap: 4150 },
  ]);

  assert.equal(Object.keys(state.cards).length, 1);
  assert.deepEqual(state.cards.guide, { agent: "guide", cardId: "instr_b", amountCap: 4150 });
});

test("only successful purchases count toward spend", () => {
  const state = fold([
    { type: "purchase_result", agent: "flights", status: "success", amount: 11800, merchant: "Duffel", details: "BLR-GOI" },
    { type: "purchase_result", agent: "guide", status: "failed", amount: 0, merchant: "Viator", details: "sold out" },
  ]);
  const summary = summarize(state);

  assert.equal(summary.spent, 11800);
  assert.equal(summary.failedPurchases, 1);
  assert.equal(state.purchases.length, 2);
});

test("an absent source tag is preserved as null, never inferred as live", () => {
  const state = fold([
    { type: "purchase_result", agent: "food", status: "success", amount: 4850, merchant: "X", details: "y" },
  ]);

  assert.equal(state.purchases[0].source, null);
});

test("blocked_attempt is recorded without affecting spend", () => {
  const state = fold([
    { type: "blocked_attempt", agent: "food", attemptedAmount: 6400, cap: 5000, reason: "over cap" },
  ]);

  assert.equal(state.blockedAttempts.length, 1);
  assert.equal(state.blockedAttempts[0].attemptedAmount, 6400);
  assert.equal(summarize(state).spent, 0);
});

test("renegotiation_triggered reopens negotiation after purchasing began", () => {
  const state = fold([
    { type: "approval_given", timestamp: "2026-08-01T09:00:21.000Z" },
    { type: "purchase_result", agent: "guide", status: "failed", amount: 0, merchant: "Viator", details: "sold out" },
    { type: "renegotiation_triggered", agent: "guide", reason: "booking failed" },
  ]);

  assert.equal(state.phase, PHASES.NEGOTIATING);
  assert.equal(state.renegotiations.length, 1);
});

test("final_receipt completes the session and records the totals", () => {
  const state = fold([
    { type: "final_receipt", purchases: [{ agent: "flights", merchant: "Duffel", amount: 11800 }], totalSpent: 30000, budget: 30000 },
  ]);

  assert.equal(state.phase, PHASES.COMPLETE);
  assert.equal(state.receipt.totalSpent, 30000);
  assert.equal(state.totalBudget, 30000);
});

test("replayed frames after a reconnect are not double-counted", () => {
  const events = [
    { type: "split_update", allocations: { flights: 11800, stay: 9200, food: 5000, guide: 4000 }, totalBudget: 30000, round: 3 },
    { type: "purchase_result", agent: "flights", status: "success", amount: 11800, merchant: "Duffel", details: "BLR-GOI" },
  ];
  const first = fold(events);

  // Backend replays frames 1 and 2 after a Last-Event-ID reconnect.
  const replayed = fold(events, first);

  assert.equal(replayed.purchases.length, 1);
  assert.equal(replayed.audit.length, 2);
  assert.equal(summarize(replayed).spent, 11800);
});

test("an unrecognised event type still reaches the audit log", () => {
  const state = fold([{ type: "senso_trust_check", agent: "stay", score: 0.92 }]);

  assert.equal(state.audit.length, 1);
  assert.equal(state.audit[0].event.type, "senso_trust_check");
});

test("the audit log preserves every event in arrival order", () => {
  const state = fold([
    { type: "agent_message", agent: "mediator", message: "one", timestamp: "2026-08-01T09:00:00.000Z" },
    { type: "split_update", allocations: { flights: 1, stay: 1, food: 1, guide: 1 }, totalBudget: 4, round: 1 },
    { type: "approval_requested", allocations: { flights: 1, stay: 1, food: 1, guide: 1 } },
  ]);

  assert.deepEqual(
    state.audit.map((entry) => entry.event.type),
    ["agent_message", "split_update", "approval_requested"],
  );
  assert.deepEqual(state.audit.map((entry) => entry.seq), [1, 2, 3]);
});
