import assert from "node:assert/strict";
import test from "node:test";

import { PravaApprovalService } from "../src/services/pravaApprovalService.js";

const config = {
  customerId: "customer_1",
  customerEmail: "traveller@example.com",
  amountCap: 100,
  merchant: { name: "Duffel", url: "https://duffel.com", countryCode: "GB" },
  product: { description: "Humsafar sandbox approval" },
};

test("phone approval is opt-in and creates nothing while disabled", async () => {
  let calls = 0;
  const service = new PravaApprovalService({
    enabled: false,
    config,
    mandateService: { async createSetupSession() { calls += 1; } },
  });
  await assert.rejects(() => service.create(), (error) => error.code === "PRAVA_PHONE_APPROVAL_DISABLED");
  assert.equal(calls, 0);
});

test("phone approval exposes only the hosted ceremony and reuses it", async () => {
  let calls = 0;
  const service = new PravaApprovalService({
    enabled: true,
    config,
    now: () => Date.parse("2026-08-03T00:00:00.000Z"),
    mandateService: {
      async createSetupSession(input) {
        calls += 1;
        assert.equal(input.merchant.name, "Duffel");
        return { data: {
          iframe_url: "https://sandbox.collect.prava.space/session/safe-test-token",
          expires_at: "2026-08-03T00:15:00.000Z",
          session_id: "must-not-reach-browser",
        } };
      },
    },
  });

  const first = await service.create();
  const second = await service.create();
  assert.equal(calls, 1);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.iframeUrl, "https://sandbox.collect.prava.space/session/safe-test-token");
  assert.equal(first.sessionId, undefined);
  assert.equal(first.customerId, undefined);
  assert.equal(first.authorizeOnly, true);
});

test("phone approval rejects a hosted link outside Prava", async () => {
  const service = new PravaApprovalService({
    enabled: true,
    config,
    mandateService: { async createSetupSession() { return { data: { iframe_url: "https://attacker.example/session/1" } }; } },
  });
  await assert.rejects(() => service.create(), (error) => error.code === "PRAVA_INVALID_APPROVAL_URL");
});
