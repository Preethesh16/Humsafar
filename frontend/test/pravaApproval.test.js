import assert from "node:assert/strict";
import test from "node:test";

import { checkPravaPhoneApproval, requestPravaPhoneApproval } from "../src/lib/pravaApproval.js";

const approval = {
  runId: "run_1",
  environment: "sandbox",
  merchant: "Humsafar",
  amountCap: 13800,
  currency: "INR",
  iframeUrl: "https://sandbox.collect.prava.space/session/phone-safe-token",
  expiresAt: "2026-08-03T01:00:00.000Z",
  stage: "waiting_for_cardholder",
  reused: false,
};

test("sends only the run reference and encodes the server-verified hosted URL", async () => {
  const calls = [];
  const qrCalls = [];
  const result = await requestPravaPhoneApproval("run_1", {
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => approval };
    },
    toDataURL: async (...args) => {
      qrCalls.push(args);
      return "data:image/png;base64,phone-qr";
    },
  });

  assert.equal(calls[0][0], "/api/prava/phone-approval");
  assert.equal(calls[0][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[0][1].body), { runId: "run_1" });
  assert.equal(qrCalls[0][0], approval.iframeUrl);
  assert.equal(result.qrDataUrl, "data:image/png;base64,phone-qr");
  assert.equal(result.amountCap, 13800);
  for (const forbidden of ["customer", "merchant", "amountCap", "card"]) {
    assert.ok(!calls[0][1].body.includes(forbidden));
  }
});

test("rejects a non-Prava hosted URL before creating a QR", async () => {
  let qrCalled = false;
  await assert.rejects(
    requestPravaPhoneApproval("run_1", {
      fetchImpl: async () => ({ ok: true, json: async () => ({ ...approval, iframeUrl: "https://attacker.example/steal" }) }),
      toDataURL: async () => { qrCalled = true; },
    }),
    { code: "PRAVA_INVALID_APPROVAL_URL" },
  );
  assert.equal(qrCalled, false);
});

test("rejects the right hostname on a nonstandard origin", async () => {
  await assert.rejects(
    requestPravaPhoneApproval("run_1", {
      fetchImpl: async () => ({ ok: true, json: async () => ({ ...approval, iframeUrl: "https://sandbox.collect.prava.space:444/session/steal" }) }),
      toDataURL: async () => "should-not-render",
    }),
    { code: "PRAVA_INVALID_APPROVAL_URL" },
  );
});

test("checks sanitized Prava status without receiving credentials", async () => {
  const calls = [];
  const result = await checkPravaPhoneApproval("run_1", {
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => ({
        runId: "run_1",
        environment: "sandbox",
        merchant: "Humsafar",
        amountCap: 13800,
        currency: "INR",
        stage: "checkout_ready",
        terminal: false,
        paid: false,
        checkedAt: "2026-08-03T00:55:00.000Z",
      }) };
    },
  });
  assert.equal(calls[0][0], "/api/prava/phone-approval?runId=run_1");
  assert.equal(result.stage, "checkout_ready");
  assert.equal(result.paid, false);
});

test("surfaces a safe structured server error", async () => {
  await assert.rejects(
    requestPravaPhoneApproval("run_1", {
      fetchImpl: async () => ({
        ok: false,
        json: async () => ({ error: { code: "PRAVA_PHONE_APPROVAL_DISABLED", message: "Phone approval is disabled on this server" } }),
      }),
    }),
    { code: "PRAVA_PHONE_APPROVAL_DISABLED", message: "Phone approval is disabled on this server" },
  );
});
