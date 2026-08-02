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

test("MandateService drops consumed and cancelled mandates from the registry", async () => {
  // Regression: `status` and `state` are separate. A consumed or cancelled
  // mandate still reports status "active", so filtering on status alone left
  // dead mandates in the registry. Every re-approval for the same merchant then
  // added another entry and resolveMandate() failed closed with "Multiple
  // active mandates are registered for this merchant" — which blocked every
  // live run on 2026-08-02 until it was found.
  const mandateMerchants = new Map([["mdt_old", "Duffel"]]);
  const service = new MandateService({
    pravaClient: {
      listMandates: async () => ({
        data: {
          mandates: [
            { id: "mdt_old", status: "active", merchantScope: "listed", state: "consumed", merchantName: "Duffel" },
            { id: "mdt_dead", status: "active", merchantScope: "listed", state: "cancelled", merchantName: "Duffel" },
            { id: "mdt_live", status: "active", merchantScope: "listed", state: "available", merchantName: "Duffel" },
          ],
        },
      }),
    },
    mandateMerchants,
  });

  await service.syncCustomerMandates("cus_1");

  assert.deepEqual([...mandateMerchants.entries()], [["mdt_live", "Duffel"]]);
  assert.equal(service.resolveMandate("Duffel").data.mandateId, "mdt_live");
});
