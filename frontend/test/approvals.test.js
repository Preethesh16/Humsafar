import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVAL_STATE,
  deriveState,
  isCorrelated,
  isExpired,
  msUntilExpiry,
  submitDecision,
} from "../src/lib/approvals.js";

const CORRELATED = {
  requested: true,
  runId: "run_1",
  approvalRequestId: "apr_1",
  digest: "sha256:abc",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  given: false,
};

test("all three correlation fields are required", () => {
  assert.equal(isCorrelated(CORRELATED), true);
  for (const missing of ["runId", "approvalRequestId", "digest"]) {
    assert.equal(isCorrelated({ ...CORRELATED, [missing]: null }), false, `${missing} must be required`);
  }
  assert.equal(isCorrelated(undefined), false);
});

test("expiry is computed from expiresAt and never goes negative", () => {
  const past = { ...CORRELATED, expiresAt: new Date(Date.now() - 5_000).toISOString() };
  assert.equal(msUntilExpiry(past), 0);
  assert.equal(isExpired(past), true);
  assert.equal(isExpired(CORRELATED), false);
});

test("an unparseable or absent expiry is treated as no deadline, not as expired", () => {
  assert.equal(msUntilExpiry({ ...CORRELATED, expiresAt: "not-a-date" }), null);
  assert.equal(isExpired({ ...CORRELATED, expiresAt: "not-a-date" }), false);
  assert.equal(isExpired({ ...CORRELATED, expiresAt: null }), false);
});

test("state machine covers every branch the panel renders", () => {
  assert.equal(deriveState({ requested: false }), APPROVAL_STATE.IDLE);
  assert.equal(deriveState(CORRELATED), APPROVAL_STATE.READY);
  assert.equal(deriveState({ ...CORRELATED, given: true }), APPROVAL_STATE.APPROVED);
  assert.equal(deriveState(CORRELATED, { localDecision: "declined" }), APPROVAL_STATE.DECLINED);
  assert.equal(deriveState(CORRELATED, { submitting: true }), APPROVAL_STATE.SUBMITTING);
  assert.equal(deriveState(CORRELATED, { error: { code: "X" } }), APPROVAL_STATE.ERROR);
  assert.equal(deriveState({ ...CORRELATED, digest: null }), APPROVAL_STATE.UNCORRELATED);
  assert.equal(
    deriveState({ ...CORRELATED, expiresAt: new Date(Date.now() - 1).toISOString() }),
    APPROVAL_STATE.EXPIRED,
  );
});

test("an already-approved request stays approved even after it expires", () => {
  const state = deriveState({
    ...CORRELATED,
    given: true,
    expiresAt: new Date(Date.now() - 10_000).toISOString(),
  });
  assert.equal(state, APPROVAL_STATE.APPROVED);
});

test("submitDecision refuses to send an uncorrelated request", async () => {
  let called = false;
  const result = await submitDecision({ ...CORRELATED, digest: null }, "approved", {
    fetchImpl: async () => {
      called = true;
      return { ok: true };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "NOT_CORRELATED");
  assert.equal(called, false, "must not hit the network without correlation");
});

test("submitDecision rejects any decision outside the locked pair", async () => {
  for (const bad of ["yes", "APPROVED", "", null]) {
    const result = await submitDecision(CORRELATED, bad, { fetchImpl: async () => ({ ok: true }) });
    assert.equal(result.ok, false);
    assert.equal(result.code, "BAD_DECISION");
  }
});

test("submitDecision echoes the server's digest and never invents one", async () => {
  let seen = null;
  await submitDecision(CORRELATED, "approved", {
    fetchImpl: async (url, init) => {
      seen = { url, body: JSON.parse(init.body), method: init.method };
      return { ok: true };
    },
  });

  assert.equal(seen.method, "POST");
  assert.equal(seen.url, "/api/approvals/apr_1/decision");
  assert.deepEqual(seen.body, { runId: "run_1", digest: "sha256:abc", decision: "approved" });
});

test("the request carries no Authorization header — the token must not reach the browser", async () => {
  let headers = null;
  await submitDecision(CORRELATED, "approved", {
    fetchImpl: async (_url, init) => {
      headers = init.headers;
      return { ok: true };
    },
  });

  const keys = Object.keys(headers).map((k) => k.toLowerCase());
  assert.ok(!keys.includes("authorization"), "client must never attach the internal token");
});

test("a structured backend error is surfaced verbatim", async () => {
  const result = await submitDecision(CORRELATED, "approved", {
    fetchImpl: async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "DIGEST_MISMATCH", message: "The plan changed." } }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "DIGEST_MISMATCH");
  assert.equal(result.message, "The plan changed.");
});

test("a non-JSON error body still yields a usable code and explanation", async () => {
  const result = await submitDecision(CORRELATED, "approved", {
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error("not json");
      },
    }),
  });

  assert.equal(result.code, "HTTP_404");
  assert.match(result.message, /does not belong to the current run/);
});

test("a network failure is reported rather than thrown", async () => {
  const result = await submitDecision(CORRELATED, "approved", {
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "NETWORK");
  assert.match(result.message, /connection refused/);
});
