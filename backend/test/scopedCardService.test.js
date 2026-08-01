import assert from "node:assert/strict";
import test from "node:test";

import { ScopedCardService } from "../src/services/scopedCardService.js";

const silentLogger = { info() {}, error() {} };

test("mintScopedCard maps a live mandate charge to the locked contract", async () => {
  let received;
  const service = new ScopedCardService({
    pravaClient: {
      async chargeMandate(input) {
        received = input;
        return {
          source: "live",
          data: {
            instructionId: "ins_1",
            credentials: { token: "virtual-card-token" },
          },
        };
      },
    },
    mandateMerchants: new Map([["mdt_123", "Duffel"]]),
    createReference: () => "humsafar-test-reference",
    logger: silentLogger,
  });

  const result = await service.mintScopedCard("mdt_123", "Duffel", 1250.5);

  assert.deepEqual(received, {
    mandateId: "mdt_123",
    amount: "1250.50",
    reference: "humsafar-test-reference",
  });
  assert.deepEqual(result, {
    cardId: "ins_1",
    cardToken: "virtual-card-token",
    merchant: "Duffel",
    amountCap: 1250.5,
    status: "issued",
  });
});

test("mintScopedCard fails closed when mandate and merchant do not match", async () => {
  let called = false;
  const service = new ScopedCardService({
    pravaClient: {
      async chargeMandate() {
        called = true;
      },
    },
    mandateMerchants: new Map([["mdt_123", "Duffel"]]),
    logger: silentLogger,
  });

  const result = await service.mintScopedCard("mdt_123", "OpenTable", 500);

  assert.equal(result.status, "failed");
  assert.match(result.error, /scoped to Duffel/);
  assert.equal(called, false);
});

test("mintScopedCard fails closed for an unregistered mandate", async () => {
  const service = new ScopedCardService({
    pravaClient: { async chargeMandate() {} },
    mandateMerchants: new Map(),
    logger: silentLogger,
  });

  const result = await service.mintScopedCard("mdt_unknown", "Duffel", 500);

  assert.equal(result.status, "failed");
  assert.match(result.error, /not registered/);
});

test("mintScopedCard rejects invalid amount precision without calling Prava", async () => {
  let called = false;
  const service = new ScopedCardService({
    pravaClient: {
      async chargeMandate() {
        called = true;
      },
    },
    mandateMerchants: new Map([["mdt_123", "Duffel"]]),
    logger: silentLogger,
  });

  const result = await service.mintScopedCard("mdt_123", "Duffel", 10.001);

  assert.equal(result.status, "failed");
  assert.match(result.error, /two decimal/);
  assert.equal(called, false);
});

test("mintScopedCard returns a failed contract without leaking credentials on API failure", async () => {
  const service = new ScopedCardService({
    pravaClient: {
      async chargeMandate() {
        const error = new Error("Mandate is not active");
        error.code = "MANDATE_NOT_ACTIVE";
        throw error;
      },
    },
    mandateMerchants: new Map([["mdt_123", "Duffel"]]),
    logger: silentLogger,
  });

  const result = await service.mintScopedCard("mdt_123", "Duffel", 500);

  assert.deepEqual(result, {
    cardId: "",
    cardToken: "",
    merchant: "Duffel",
    amountCap: 500,
    status: "failed",
    error: "Mandate is not active",
  });
});
