import assert from "node:assert/strict";
import test from "node:test";

import {
  validateSandboxConfig,
  verifyPravaAccess,
} from "../scripts/verifyPravaAccess.js";

test("sandbox access check validates authentication without creating a transaction", async () => {
  let request;
  const result = await verifyPravaAccess({
    apiKey: "sk_test_not-a-real-secret",
    baseUrl: "https://sandbox.api.prava.space",
    customerId: "humsafar-demo-user",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ mandates: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(
    request.url,
    "https://sandbox.api.prava.space/v1/mandates?customer_id=humsafar-demo-user&standing_only=true",
  );
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers.Authorization, "Bearer sk_test_not-a-real-secret");
  assert.deepEqual(result, {
    environment: "sandbox",
    authentication: "ok",
    customer: "found",
    mandateCount: 0,
  });
});

test("sandbox access check treats CUSTOMER_NOT_FOUND as authenticated setup state", async () => {
  const result = await verifyPravaAccess({
    apiKey: "sk_test_not-a-real-secret",
    baseUrl: "https://sandbox.api.prava.space",
    customerId: "new-humsafar-user",
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: "CUSTOMER_NOT_FOUND", message: "No such customer for this merchant" },
    }), {
      status: 404,
      headers: {
        "content-type": "application/json",
        "x-response-id": "resp_customer_missing",
      },
    }),
  });

  assert.deepEqual(result, {
    environment: "sandbox",
    authentication: "ok",
    customer: "not_created",
    mandateCount: 0,
    responseId: "resp_customer_missing",
  });
});

test("sandbox access check refuses production configuration before network access", async () => {
  let called = false;

  await assert.rejects(
    verifyPravaAccess({
      apiKey: "sk_live_not-a-real-secret",
      baseUrl: "https://api.prava.space",
      customerId: "humsafar-demo-user",
      fetchImpl: async () => {
        called = true;
        throw new Error("should not run");
      },
    }),
    /sandbox key/,
  );
  assert.equal(called, false);
});

test("sandbox config requires the official sandbox origin and a customer ID", () => {
  assert.throws(
    () => validateSandboxConfig({
      apiKey: "sk_test_not-a-real-secret",
      baseUrl: "https://example.com",
      customerId: "humsafar-demo-user",
    }),
    /Refusing non-sandbox/,
  );
  assert.throws(
    () => validateSandboxConfig({
      apiKey: "sk_test_not-a-real-secret",
      baseUrl: "https://sandbox.api.prava.space",
      customerId: "",
    }),
    /PRAVA_TEST_CUSTOMER_ID is required/,
  );
});
