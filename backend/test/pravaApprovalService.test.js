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

function concurrentHarness(overrides = {}) {
  let calls = 0;
  const service = new PravaApprovalService({
    enabled: true,
    config,
    resolvePlan: (runId) => ({ totalSpent: runId === "run_1" ? 13800 : 15000, budget: 30000 }),
    now: () => Date.parse("2026-08-03T00:00:00.000Z"),
    mandateService: mandateService({
      async createSetupSession() {
        calls += 1;
        return { data: {
          iframe_url: `https://sandbox.collect.prava.space/session/mock-${calls}`,
          session_id: `private-${calls}`,
          expires_at: "2026-08-03T00:15:00.000Z",
        } };
      },
      ...overrides,
    }),
  });
  return { service, callCount: () => calls };
}

test("two trips retain independent phone approval sessions", async () => {
  const { service, callCount } = concurrentHarness();
  const first = await service.create({ runId: "run_1" });
  const second = await service.create({ runId: "run_2" });
  assert.notEqual(first.iframeUrl, second.iframeUrl);
  const firstStatus = await service.status({ runId: "run_1" });
  const secondStatus = await service.status({ runId: "run_2" });
  assert.equal(firstStatus.runId, "run_1");
  assert.equal(firstStatus.amountCap, 13800);
  assert.equal(secondStatus.runId, "run_2");
  assert.equal(secondStatus.amountCap, 15000);
  assert.equal((await service.create({ runId: "run_1" })).reused, true);
  assert.equal(callCount(), 2);
});

test("simultaneous retries share one provider session request", async () => {
  const { service, callCount } = concurrentHarness();
  const results = await Promise.all([
    service.create({ runId: "run_1" }),
    service.create({ runId: "run_1" }),
  ]);
  assert.equal(callCount(), 1);
  assert.equal(results[0].iframeUrl, results[1].iframeUrl);
});

test("a status request keeps its own run while another session is created", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { service } = concurrentHarness({ listCustomerMandates: () => pending });
  await service.create({ runId: "run_1" });
  const status = service.status({ runId: "run_1" });
  await service.create({ runId: "run_2" });
  release({ data: { mandates: [] } });
  const result = await status;
  assert.equal(result.runId, "run_1");
  assert.equal(result.amountCap, 13800);
});

test("a failed provider request releases the same-run retry slot", async () => {
  let attempts = 0;
  const { service } = concurrentHarness({
    async createSetupSession() {
      attempts += 1;
      if (attempts === 1) throw new Error("mock provider unavailable");
      return { data: {
        iframe_url: "https://sandbox.collect.prava.space/session/retried",
        session_id: "private-retry",
        expires_at: "2026-08-03T00:15:00.000Z",
      } };
    },
  });
  await assert.rejects(service.create({ runId: "run_1" }), /mock provider unavailable/);
  const result = await service.create({ runId: "run_1" });
  assert.equal(result.runId, "run_1");
  assert.equal(attempts, 2);
});

test("a changing plan cannot reuse an in-flight authorization for another amount", async () => {
  let total = 13800;
  let release;
  const service = new PravaApprovalService({
    enabled: true, config,
    resolvePlan: () => ({ totalSpent: total, budget: 30000 }),
    mandateService: mandateService({
      createSetupSession: () => new Promise((resolve) => { release = resolve; }),
    }),
  });
  const first = service.create({ runId: "run_1" });
  total = 15000;
  await assert.rejects(
    service.create({ runId: "run_1" }),
    (error) => error.code === "PRAVA_APPROVAL_IN_PROGRESS",
  );
  release({ data: {
    iframe_url: "https://sandbox.collect.prava.space/session/first",
    session_id: "private-first",
  } });
  assert.equal((await first).amountCap, 13800);
});
