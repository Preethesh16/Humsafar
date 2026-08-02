import assert from "node:assert/strict";
import test from "node:test";

import { PravaApiError, PravaClient } from "../src/integrations/pravaClient.js";

test("chargeMandate calls the sandbox endpoint and returns the integration envelope", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      mandateId: "mdt_123",
      instructionId: "ins_1",
      status: "awaiting_result",
      fetchStatus: "SUCCESS",
      credentials: {
        token: "virtual-card-token",
        dynamicCvv: "123",
        expiryMonth: "12",
        expiryYear: "2030",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json", "x-response-id": "resp_1" },
    });
  };
  const client = new PravaClient({ apiKey: "test-key", fetchImpl });

  const result = await client.chargeMandate({
    mandateId: "mdt_123",
    amount: "1250.50",
    reference: "humsafar-test",
  });

  assert.equal(request.url, "https://sandbox.api.prava.space/v1/mandates/mdt_123/charge");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(request.options.body), {
    amount: "1250.50",
    reference: "humsafar-test",
  });
  assert.equal(result.source, "live");
  assert.equal(result.data.instructionId, "ins_1");
});

test("chargeMandate fails before network access when the secret key is missing", async () => {
  let called = false;
  const client = new PravaClient({
    apiKey: "",
    fetchImpl: async () => {
      called = true;
      throw new Error("should not run");
    },
  });

  await assert.rejects(
    client.chargeMandate({ mandateId: "mdt_123", amount: "10.00" }),
    (error) => error instanceof PravaApiError && error.code === "PRAVA_NOT_CONFIGURED",
  );
  assert.equal(called, false);
});

test("chargeMandate preserves safe Prava error metadata", async () => {
  const client = new PravaClient({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: "MANDATE_NOT_ACTIVE", message: "Mandate is not active" },
    }), {
      status: 409,
      headers: { "content-type": "application/json", "x-response-id": "resp_error" },
    }),
  });

  await assert.rejects(
    client.chargeMandate({ mandateId: "mdt_123", amount: "10.00" }),
    (error) =>
      error instanceof PravaApiError &&
      error.status === 409 &&
      error.code === "MANDATE_NOT_ACTIVE" &&
      error.responseId === "resp_error",
  );
});

test("createMandateSession accepts the live nested session envelope without exposing it", async () => {
  const client = new PravaClient({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({ data: {
      session_id: "sess_1",
      session_token: "sensitive-token",
      iframe_url: "https://sandbox.collect.prava.space/session/sess_1",
      expires_at: "2026-08-02T12:00:00.000Z",
    } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  });

  const result = await client.createMandateSession({ test: true });

  assert.equal(result.source, "live");
  assert.equal(result.data.session_id, "sess_1");
  assert.equal(result.data.iframe_url, "https://sandbox.collect.prava.space/session/sess_1");
});
