/**
 * Render smoke test. Folds the entire mocked demo script through the reducer,
 * then server-renders every panel against that final state.
 *
 * This is not a substitute for looking at the screen — it is the automated
 * guard that the components actually render real data without throwing, so a
 * broken panel is caught before a demo rehearsal rather than during one.
 *
 * Run with: npm run test:render  (vite builds it for SSR, node executes it)
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AuditLog } from "../src/components/AuditLog.jsx";
import { BudgetSplit } from "../src/components/BudgetSplit.jsx";
import { DeliberationFeed } from "../src/components/DeliberationFeed.jsx";
import { FinalReceipt } from "../src/components/FinalReceipt.jsx";
import { PurchaseCards } from "../src/components/PurchaseCards.jsx";
import { MOCK_EVENTS } from "../src/lib/mockStream.js";
import { PHASES, initialState, reduce, summarize } from "../src/state/sessionReducer.js";

const state = MOCK_EVENTS.reduce(
  (acc, event, index) => reduce(acc, { id: index + 1, event }),
  initialState(),
);
const summary = summarize(state);

// The script must actually run to completion, or the render test proves little.
assert.equal(state.phase, PHASES.COMPLETE, "mock script should end in the complete phase");
assert.equal(summary.spent, 30000, "successful purchases should total the full budget");
assert.equal(state.blockedAttempts.length, 1, "demo proof shot #1 should be present");
assert.equal(state.renegotiations.length, 1, "demo proof shot #2 should be present");
assert.equal(Object.keys(state.cards).length, 4, "every specialist should hold a credential");

const html = [
  renderToStaticMarkup(<DeliberationFeed messages={state.messages} round={state.round} />),
  renderToStaticMarkup(<BudgetSplit allocations={state.allocations} summary={summary} round={state.round} />),
  renderToStaticMarkup(
    <PurchaseCards
      cards={state.cards}
      purchases={state.purchases}
      blockedAttempts={state.blockedAttempts}
      isMock
    />,
  ),
  renderToStaticMarkup(<AuditLog audit={state.audit} />),
  renderToStaticMarkup(
    <FinalReceipt
      receipt={state.receipt}
      summary={summary}
      blockedAttempts={state.blockedAttempts}
      renegotiations={state.renegotiations}
      isMock
      onDismiss={() => {}}
    />,
  ),
].join("\n");

const expectations = [
  ["Live deliberation", "feed heading"],
  ["Round 4 of 5", "round counter"],
  ["Convergence condition 1 met", "mediator's closing argument"],
  ["Budget split", "split heading"],
  ["instr_mock_guide_02", "the re-issued guide credential"],
  ["Blocked at card level", "over-cap block proof shot"],
  ["fixture data", "honest source tag"],
  ["mocked stream", "mock labelling on purchases"],
  ["Audit log", "audit heading"],
  ["renegotiation_triggered", "renegotiation in the audit log"],
  ["Every agent has settled", "final receipt"],
  ["No payment was made", "mock receipt warning"],
];

for (const [needle, description] of expectations) {
  assert.ok(html.includes(needle), `rendered markup should contain ${description}: "${needle}"`);
}

// Nothing rendered may imply a live transaction while on the mocked stream.
assert.ok(!html.includes("live transaction"), "mocked stream must never render a live-transaction tag");

console.log(
  `render smoke test passed — ${MOCK_EVENTS.length} events folded, ` +
    `${state.messages.length} messages, ${state.purchases.length} purchases, ` +
    `${html.length} chars of markup, ${expectations.length} assertions.`,
);
