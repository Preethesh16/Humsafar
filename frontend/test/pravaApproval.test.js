import assert from "node:assert/strict";
import test from "node:test";

import { requestPravaPhoneApproval } from "../src/lib/pravaApproval.js";

const approval = {
  environment: "sandbox",
  merchant: "Duffel",
  amountCap: 100,
  currency: "INR",
  iframeUrl: "https://sandbox.collect.prava.space/session/phone-safe-token",
  expiresAt: "2026-08-03T01:00:00.000Z",
  authorizeOnly: true,
  reused: false,
};

test("requests server-pinned terms and encodes the hosted approval URL", async () => {
  const calls = [];
  const qrCalls = [];
  const result = await requestPravaPhoneApproval({
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => approval };
    },
    toDataURL: async (...args) => {
      qrCalls.push(args);
      return "data:image/png;base64,phone-qr";
    },
  });

  assert.deepEqual(calls, [[
    "/api/prava/phone-approval",
    { method: "POST", headers: { Accept: "application/json" } },
  ]]);
  assert.equal(qrCalls[0][0], approval.iframeUrl);
  assert.equal(result.qrDataUrl, "data:image/png;base64,phone-qr");
  assert.equal(result.amountCap, 100);
  assert.ok(!JSON.stringify(calls).includes("customer"));
  assert.ok(!JSON.stringify(calls).includes("merchant"));
  assert.ok(!JSON.stringify(calls).includes("amountCap"));
});

test("rejects a non-Prava hosted URL before creating a QR", async () => {
  let qrCalled = false;
  await assert.rejects(
    requestPravaPhoneApproval({
      fetchImpl: async () => ({ ok: true, json: async () => ({ ...approval, iframeUrl: "https://attacker.example/steal" }) }),
      toDataURL: async () => { qrCalled = true; },
    }),
    { code: "PRAVA_INVALID_APPROVAL_URL" },
  );
  assert.equal(qrCalled, false);
});

test("surfaces a safe structured server error", async () => {
  await assert.rejects(
    requestPravaPhoneApproval({
      fetchImpl: async () => ({
        ok: false,
        json: async () => ({ error: { code: "PRAVA_PHONE_APPROVAL_DISABLED", message: "Phone approval is disabled on this server" } }),
      }),
    }),
    { code: "PRAVA_PHONE_APPROVAL_DISABLED", message: "Phone approval is disabled on this server" },
  );
});
