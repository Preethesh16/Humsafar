import assert from "node:assert/strict";
import test from "node:test";

import { MandateService } from "../src/services/mandateService.js";

test("MandateService creates a one-time listed merchant setup session", async () => {
  let body;
  const service = new MandateService({
    pravaClient: { async createMandateSession(input) { body = input; return { data: {}, source: "live" }; } },
    mandateMerchants: new Map(),
  });
  await service.createSetupSession({
    userId: "user_1", userEmail: "user@example.com", amountCap: 500,
    merchant: { name: "Duffel", url: "https://duffel.com", countryCode: "GB" },
    product: { description: "Flight", unitPrice: 500 },
  });
  assert.equal(body.total_amount, "500.00");
  assert.equal(body.mandate_setup.merchant_scope, "listed");
  assert.equal(body.mandate_setup.recurring_frequency, "one_time");
});

test("MandateService syncs only active listed mandates into the registry", async () => {
  const registry = new Map();
  const service = new MandateService({
    pravaClient: { async listMandates() { return { source: "live", data: { mandates: [
      { id: "mdt_1", status: "active", merchantScope: "listed", merchantName: "Duffel" },
      { id: "mdt_2", status: "paused", merchantScope: "listed", merchantName: "Other" },
    ] } }; } },
    mandateMerchants: registry,
  });
  await service.syncCustomerMandates("user_1");
  assert.deepEqual([...registry], [["mdt_1", "Duffel"]]);
});

test("MandateService resolves a merchant without sharing environment state", () => {
  const service = new MandateService({
    pravaClient: {},
    mandateMerchants: new Map([["mdt_1", "Duffel Travel"]]),
  });

  assert.deepEqual(service.resolveMandate("  duffel   travel "), {
    data: { mandateId: "mdt_1", merchant: "Duffel Travel" },
    source: "sandbox",
  });
  assert.equal(service.resolveMandate("Unknown"), undefined);
});

test("MandateService refuses an ambiguous merchant resolution", () => {
  const service = new MandateService({
    pravaClient: {},
    mandateMerchants: new Map([["mdt_1", "Duffel"], ["mdt_2", "duffel"]]),
  });

  assert.throws(() => service.resolveMandate("Duffel"), /Multiple active mandates/);
});
