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

import { Dashboard } from "../src/App.jsx";
import { ApprovalPanel } from "../src/components/ApprovalPanel.jsx";
import { AuditLog } from "../src/components/AuditLog.jsx";
import { BudgetSplit } from "../src/components/BudgetSplit.jsx";
import { DeliberationFeed } from "../src/components/DeliberationFeed.jsx";
import { FinalReceipt } from "../src/components/FinalReceipt.jsx";
import { ProofPanel } from "../src/components/ProofPanel.jsx";
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
  renderToStaticMarkup(
    <ProofPanel blockedAttempts={state.blockedAttempts} renegotiations={state.renegotiations} />,
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
  ["Deliberation room", "feed heading"],
  ["Round 4 of 5", "round counter"],
  ["Convergence condition 1 met", "mediator's closing argument"],
  ["Budget split", "split heading"],
  ["Scoped credentials", "credential rail heading"],
  ["instr_mock_guide_02", "the re-issued guide credential"],
  ["Blocked at card level", "over-cap block on the credential card"],
  ["Overspend blocked at the card", "proof shot #1 panel"],
  ["Single slice re-negotiated", "proof shot #2 panel"],
  ["fixture / simulated; no payment attempted", "exact precaution.md fixture label"],
  ["mocked stream", "mock labelling on purchases"],
  ["Audit log", "audit heading"],
  ["renegotiation_triggered", "renegotiation in the audit log"],
  ["Every agent has settled", "final receipt"],
  ["No payment was made", "mock receipt warning"],
  ["Fixture-only run — no payment was attempted", "run-level provenance banner"],
];

for (const [needle, description] of expectations) {
  assert.ok(html.includes(needle), `rendered markup should contain ${description}: "${needle}"`);
}

// A receipt line shaped exactly like the agent core's `_close()` output, which
// carries per-line `status` and `source` (INTERFACES.md §2 producer notes).
// A fixture line must not read as a live order, and a failed line must not read
// as a completed purchase.
// The exact scenario precaution.md warns about: ONE category genuinely
// exercises Prava sandbox, the other three are fixtures. The receipt must not
// let that one real line stand for the whole run.
const liveReceipt = renderToStaticMarkup(
  <FinalReceipt
    receipt={{
      budget: 30000,
      totalSpent: 21000,
      purchases: [
        { agent: "flights", merchant: "Sandbox merchant", amount: 11800, status: "success", source: "sandbox", details: "x" },
        { agent: "food", merchant: "OpenTable-shaped fixture", amount: 4850, status: "success", source: "fixture", details: "y" },
        { agent: "guide", merchant: "Viator-shaped fixture", amount: 0, status: "failed", source: "fixture", details: "sold out" },
        { agent: "stay", merchant: "Untagged merchant", amount: 4350, status: "success", details: "no source tag" },
      ],
    }}
    summary={{ failedPurchases: 1 }}
    blockedAttempts={[]}
    renegotiations={[]}
    isMock={false}
    onDismiss={() => {}}
  />,
);

assert.ok(liveReceipt.includes("Mixed-mode run"), "a mixed run must be labelled mixed-mode");
assert.ok(
  liveReceipt.includes("1 of 4 purchases exercised a payment path"),
  "the receipt must state how many lines genuinely exercised a payment path",
);
assert.ok(liveReceipt.includes("completed sandbox checkout"), "the sandbox line keeps its real label");
assert.ok(
  liveReceipt.includes("fixture / simulated; no payment attempted"),
  "fixture lines keep the exact precaution.md wording",
);
assert.ok(
  liveReceipt.includes("source unverified; not evidence of a payment"),
  "an untagged line stays pessimistic",
);
assert.ok(liveReceipt.includes("not charged"), "a failed line must not show a charged amount");
assert.ok(!liveReceipt.includes("₹0"), "a failed line must not render a zero-rupee charge");
assert.equal(
  (liveReceipt.match(/completed sandbox checkout/g) ?? []).length,
  1,
  "only the sandbox line may claim a completed checkout — no line inherits it",
);
for (const banned of ["order placed", "real money", "production"]) {
  assert.ok(!liveReceipt.includes(banned), `receipt must never say "${banned}"`);
}

// The approval gate. A pending request must offer a decision; an expired or
// uncorrelated one must explain itself and offer nothing.
const pending = {
  requested: true,
  runId: "run_1",
  approvalRequestId: "apr_1",
  digest: "sha256:abc",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
  given: false,
  requestedAllocations: { flights: 11800, stay: 9200, food: 5000, guide: 4000 },
};

const pendingHtml = renderToStaticMarkup(<ApprovalPanel approval={pending} isMock={false} />);
assert.ok(pendingHtml.includes("Authorise this exact split"), "pending request asks for a decision");
assert.ok(pendingHtml.includes("Approve this plan"), "approve action is offered");
assert.ok(pendingHtml.includes("Decline"), "decline action is offered");
assert.ok(pendingHtml.includes("apr_1"), "the request reference is shown");
assert.ok(pendingHtml.includes("₹30,000"), "the exact total being authorised is shown");
assert.ok(!pendingHtml.includes("sha256:abc"), "the digest is not surfaced as UI noise");

const expiredHtml = renderToStaticMarkup(
  <ApprovalPanel approval={{ ...pending, expiresAt: new Date(Date.now() - 1000).toISOString() }} isMock={false} />,
);
assert.ok(expiredHtml.includes("Approval expired"), "an expired request says so");
assert.ok(!expiredHtml.includes("Approve this plan"), "an expired request offers no approve button");

const uncorrelatedHtml = renderToStaticMarkup(
  <ApprovalPanel approval={{ ...pending, digest: null }} isMock={false} />,
);
assert.ok(uncorrelatedHtml.includes("Cannot be answered here"), "an uncorrelated request says so");
assert.ok(!uncorrelatedHtml.includes("Approve this plan"), "an uncorrelated request offers no approve button");

assert.equal(
  renderToStaticMarkup(<ApprovalPanel approval={{ requested: false }} isMock={false} />),
  "",
  "no panel before an approval is requested",
);

// Accessibility guards. These are cheap to assert and expensive to notice by
// eye, and the plan's acceptance criteria list an accessibility check.
const a11y = [
  [liveReceipt, 'role="dialog"', "the receipt is announced as a dialog"],
  [liveReceipt, 'aria-modal="true"', "the receipt traps assistive focus"],
  [liveReceipt, 'aria-label="Close receipt"', "the icon-only close button is labelled"],
  [pendingHtml, 'aria-live="polite"', "the approval countdown is announced as it changes"],
];
for (const [html, needle, description] of a11y) {
  assert.ok(html.includes(needle), `a11y: ${description} — expected ${needle}`);
}

// Decorative SVGs must never be announced; every icon in the app is decorative
// because its meaning is always carried by adjacent text.
for (const [name, html] of [["receipt", liveReceipt], ["approval", pendingHtml]]) {
  const svgs = (html.match(/<svg/g) ?? []).length;
  const hidden = (html.match(/aria-hidden="true"/g) ?? []).length;
  assert.ok(hidden >= svgs, `a11y: every ${name} icon must be aria-hidden (${svgs} svg, ${hidden} hidden)`);
}

// The app shell itself must render — it carries the hero, the journey stepper
// and the simulated-stream notice, none of which the panel renders above cover.
// Dashboard rather than App: App now wraps everything in a BrowserRouter,
// which needs a DOM history and cannot be server-rendered. The shell markup
// under test is identical either way.
const shell = renderToStaticMarkup(
  <Dashboard
    state={initialState()}
    connection={{ status: "idle" }}
    source={"mock"}
    setSource={() => {}}
  />,
);
for (const [needle, description] of [
  ["One goal. One budget.", "hero headline"],
  ["Zero overspend.", "hero headline accent"],
  ["Agentic commerce, with a seatbelt", "eyebrow"],
  ["Simulated stream", "mock notice heading"],
  ["No real agents, no real Prava", "mock notice body"],
  ["Negotiate", "journey step 1"],
  ["Lock spend", "journey step 3"],
  ["Truth layer", "footer disclosure"],
]) {
  assert.ok(shell.includes(needle), `app shell should contain ${description}: "${needle}"`);
}

// Nothing rendered may imply a live transaction while on the mocked stream.
assert.ok(!html.includes("live transaction"), "mocked stream must never render a live-transaction tag");

console.log(
  `render smoke test passed — ${MOCK_EVENTS.length} events folded, ` +
    `${state.messages.length} messages, ${state.purchases.length} purchases, ` +
    `${html.length} chars of panel markup + ${shell.length} of app shell, ` +
    `${expectations.length + 8} content assertions.`,
);
