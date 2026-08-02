import assert from "node:assert/strict";
import test from "node:test";

/**
 * The routing rule AutoAdvance implements, extracted so it can be tested
 * without a DOM.
 *
 * This mirrors `AutoAdvance` in src/App.jsx exactly. It exists because the
 * original version shipped an infinite navigation loop: the "send them back"
 * branch only checked for pending choices, so sitting on /approve with an
 * approval outstanding satisfied it, bounced to /deliberate, and was bounced
 * straight back. On screen that is a flickering page.
 *
 * A loop is invisible to a render test and obvious to a fixed-point test, so
 * the property asserted below is: applying the rule to its own output must not
 * move again.
 */
export function nextRoute(state, pathname) {
  if (pathname === "/") return null;
  const pending = Object.values(state.choice?.requested ?? {}).some(
    (row) => !state.choice?.made?.[row.agent],
  );
  const awaitingApproval = Boolean(state.approval?.requested && !state.approval?.given);

  // Stage precedence, each stage owning exactly one page. Expressed as "if this
  // stage is active, be on its page" rather than a chain of forward/backward
  // rules — the chain form is what allowed two different pairs of branches to
  // send each other in circles.
  if (state.receipt) return pathname === "/receipt" ? null : "/receipt";
  if (pending) return pathname === "/choose" ? null : "/choose";
  if (awaitingApproval) return pathname === "/approve" ? null : "/approve";
  if (["/choose", "/approve"].includes(pathname)) return "/deliberate";
  return null;
}

const ROUTES = ["/deliberate", "/choose", "/approve", "/receipt"];

const STATES = {
  "negotiating": {},
  "choice pending": {
    choice: { requested: { stay: { agent: "stay" } }, made: {} },
  },
  "choice made": {
    choice: { requested: { stay: { agent: "stay" } }, made: { stay: {} } },
  },
  "approval pending": { approval: { requested: true, given: false } },
  "approval given": { approval: { requested: true, given: true } },
  "approval pending with choice pending": {
    approval: { requested: true, given: false },
    choice: { requested: { stay: { agent: "stay" } }, made: {} },
  },
  "run complete": { receipt: { purchases: [] } },
  "complete after approval": {
    approval: { requested: true, given: true },
    receipt: { purchases: [] },
  },
};

test("routing settles — no state and route can navigate forever", () => {
  for (const [name, state] of Object.entries(STATES)) {
    for (const start of ROUTES) {
      let here = start;
      const seen = [here];
      for (let hop = 0; hop < 12; hop++) {
        const next = nextRoute(state, here);
        if (next === null) break;
        assert.ok(
          !seen.includes(next),
          `"${name}" loops: ${seen.join(" -> ")} -> ${next}`,
        );
        seen.push(next);
        here = next;
      }
      // Whatever route it settled on must be a fixed point.
      assert.equal(
        nextRoute(state, here),
        null,
        `"${name}" starting at ${start} never settled (ended at ${here})`,
      );
    }
  }
});

test("an outstanding approval keeps you on /approve", () => {
  const state = { approval: { requested: true, given: false } };
  assert.equal(nextRoute(state, "/approve"), null, "must not be bounced off /approve");
  assert.equal(nextRoute(state, "/deliberate"), "/approve");
});

test("a pending choice keeps you on /choose", () => {
  const state = { choice: { requested: { stay: { agent: "stay" } }, made: {} } };
  assert.equal(nextRoute(state, "/choose"), null);
  assert.equal(nextRoute(state, "/deliberate"), "/choose");
});

test("an outstanding choice outranks an outstanding approval", () => {
  const state = {
    approval: { requested: true, given: false },
    choice: { requested: { stay: { agent: "stay" } }, made: {} },
  };
  // You pick options first, then approve the plan containing them. Ranking
  // approval higher is what produced the /approve <-> /choose ping-pong.
  assert.equal(nextRoute(state, "/deliberate"), "/choose");
  assert.equal(nextRoute(state, "/approve"), "/choose");
  assert.equal(nextRoute(state, "/choose"), null, "and it stays there");
});

test("once everything settles you land back on the deliberation view", () => {
  const state = {
    approval: { requested: true, given: true },
    choice: { requested: { stay: { agent: "stay" } }, made: { stay: {} } },
  };
  assert.equal(nextRoute(state, "/approve"), "/deliberate");
  assert.equal(nextRoute(state, "/deliberate"), null);
});

test("the receipt wins over everything and is stable", () => {
  const state = { receipt: { purchases: [] }, approval: { requested: true, given: false } };
  assert.equal(nextRoute(state, "/deliberate"), "/receipt");
  assert.equal(nextRoute(state, "/receipt"), null);
});

test("the intake page is never auto-navigated away from", () => {
  for (const state of Object.values(STATES)) {
    assert.equal(nextRoute(state, "/"), null);
  }
});
