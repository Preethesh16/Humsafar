import assert from "node:assert/strict";
import test from "node:test";

import { PravaApprovalService } from "../src/services/pravaApprovalService.js";

const config = {
  customerId: "customer_1",
  customerEmail: "traveller@example.com",
  merchant: { name: "Humsafar", url: "https://github.com/Preethesh16/Humsafar", countryCode: "IN" },
  product: { description: "Humsafar sandbox trip plan" },
};
const resolvePlan = (runId) => runId === "run_1" ? { totalSpent: 13800, budget: 30000 } : undefined;

function mandateService(overrides = {}) {
  return {
    async createSetupSession() {},
    async listCustomerMandates() { return { data: { mandates: [] } }; },
    ...overrides,
  };
}

test("phone authorization is opt-in and creates nothing while disabled", async () => {
  let calls = 0;
  const service = new PravaApprovalService({
    enabled: false,
    config,
    resolvePlan,
    mandateService: mandateService({ async createSetupSession() { calls += 1; } }),
  });
  await assert.rejects(() => service.create({ runId: "run_1" }), (error) => error.code === "PRAVA_PHONE_APPROVAL_DISABLED");
  assert.equal(calls, 0);
});

test("authorization cap comes from the completed run, exposes no session secret, and reuses the link", async () => {
  let calls = 0;
  const service = new PravaApprovalService({
    enabled: true,
    config,
    resolvePlan,
    now: () => Date.parse("2026-08-03T00:00:00.000Z"),
    mandateService: mandateService({
      async createSetupSession(input) {
        calls += 1;
        assert.equal(input.amountCap, 13800);
        assert.equal(input.product.unitPrice, 13800);
        assert.equal(input.merchant.name, "Humsafar");
        return { data: {
          iframe_url: "https://sandbox.collect.prava.space/session/safe-test-token",
          expires_at: "2026-08-03T00:15:00.000Z",
          session_id: "must-not-reach-browser",
        } };
      },
    }),
  });

  const first = await service.create({ runId: "run_1" });
  const second = await service.create({ runId: "run_1" });
  assert.equal(calls, 1);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.amountCap, 13800);
  assert.equal(first.runId, "run_1");
  assert.equal(first.sessionId, undefined);
  assert.equal(first.customerId, undefined);
  assert.equal(first.stage, "waiting_for_cardholder");
  assert.equal(first.authorizeOnly, true);
});

test("an invented run cannot choose its own amount or create a session", async () => {
  let calls = 0;
  const service = new PravaApprovalService({
    enabled: true,
    config,
    resolvePlan,
    mandateService: mandateService({ async createSetupSession() { calls += 1; } }),
  });
  await assert.rejects(
    () => service.create({ runId: "attacker_run", amountCap: 1 }),
    (error) => error.code === "PRAVA_PLAN_NOT_FOUND",
  );
  assert.equal(calls, 0);
});

test("a final receipt over its own budget cannot create an authorization", async () => {
  let calls = 0;
  const service = new PravaApprovalService({
    enabled: true,
    config,
    resolvePlan: () => ({ totalSpent: 30001, budget: 30000 }),
    mandateService: mandateService({ async createSetupSession() { calls += 1; } }),
  });
  await assert.rejects(
    () => service.create({ runId: "run_1" }),
    (error) => error.code === "PRAVA_INVALID_PLAN_TOTAL",
  );
  assert.equal(calls, 0);
});

test("status polling recognizes only an exact active mandate and never claims payment", async () => {
  let mandates = [];
  const service = new PravaApprovalService({
    enabled: true,
    config,
    resolvePlan,
    now: () => Date.parse("2026-08-03T00:05:00.000Z"),
    mandateService: mandateService({
      async createSetupSession() {
        return { data: {
          iframe_url: "https://sandbox.collect.prava.space/session/safe-test-token",
          expires_at: "2026-08-03T00:15:00.000Z",
          session_id: "session_private",
        } };
      },
      async listCustomerMandates(customerId) {
        assert.equal(customerId, "customer_1");
        return { data: { mandates } };
      },
    }),
  });
  await service.create({ runId: "run_1" });

  const pending = await service.status({ runId: "run_1" });
  assert.equal(pending.stage, "waiting_for_cardholder");
  assert.equal(pending.paid, false);

  mandates = [{
    status: "active",
    state: "available",
    merchantScope: "listed",
    merchantName: "Humsafar",
    approvedAmount: "100.00",
  }];
  assert.equal((await service.status({ runId: "run_1" })).stage, "waiting_for_cardholder");

  mandates = [{
    id: "must-never-reach-browser",
    status: "active",
    state: "available",
    merchantScope: "listed",
    merchantName: " humsafar ",
    approvedAmount: "13800.00",
  }];
  const authorized = await service.status({ runId: "run_1" });
  assert.equal(authorized.stage, "authorized");
  assert.equal(authorized.paid, false);
  assert.equal(authorized.authorizeOnly, true);
  assert.equal(authorized.terminal, true);
  assert.ok(!JSON.stringify(authorized).includes("must-never-reach-browser"));
  assert.ok(!JSON.stringify(authorized).includes("session_private"));
});

test("phone authorization rejects a hosted link outside Prava", async () => {
  const service = new PravaApprovalService({
    enabled: true,
    config,
    resolvePlan,
    mandateService: mandateService({
      async createSetupSession() {
        return { data: { iframe_url: "https://attacker.example/session/1", session_id: "session_1" } };
      },
    }),
  });
  await assert.rejects(() => service.create({ runId: "run_1" }), (error) => error.code === "PRAVA_INVALID_APPROVAL_URL");
});
