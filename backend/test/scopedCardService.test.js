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
            transactionId: "txn_1",
            credentials: {
              token: "virtual-card-token",
              dynamicCvv: "123",
              expiryMonth: "12",
              expiryYear: "2030",
            },
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
    transactionId: "txn_1",
    dynamicCvv: "123",
    expiryMonth: "12",
    expiryYear: "2030",
    merchant: "Duffel",
    amountCap: 1250.5,
    status: "issued",
    source: "sandbox",
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
    transactionId: null,
    dynamicCvv: "",
    expiryMonth: "",
    expiryYear: "",
    merchant: "Duffel",
    amountCap: 500,
    status: "failed",
    source: "sandbox",
    errorCode: "MANDATE_NOT_ACTIVE",
    error: "Mandate is not active",
  });
});

test("mintScopedCard preserves THRESHOLD_EXCEEDED as structured safe metadata", async () => {
  const logEntries = [];
  const service = new ScopedCardService({
    pravaClient: {
      async chargeMandate() {
        const error = new Error("Charge exceeds mandate cap");
        error.code = "THRESHOLD_EXCEEDED";
        error.responseId = "resp_safe_1";
        throw error;
      },
    },
    mandateMerchants: new Map([["mdt_123", "Duffel"]]),
    logger: { info() {}, error(entry) { logEntries.push(entry); } },
  });

  const result = await service.mintScopedCard("mdt_123", "Duffel", 501);

  assert.equal(result.errorCode, "THRESHOLD_EXCEEDED");
  assert.equal(result.cardToken, "");
  assert.deepEqual(logEntries, [{
    integration: "prava",
    code: "THRESHOLD_EXCEEDED",
    responseId: "resp_safe_1",
  }]);
});
