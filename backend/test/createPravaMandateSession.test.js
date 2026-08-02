import assert from "node:assert/strict";
import test from "node:test";

import {
  createPravaMandateSession,
  mandateSessionConfig,
} from "../scripts/createPravaMandateSession.js";

const env = {
  PRAVA_SECRET_KEY: "sk_test_not-a-real-secret",
  PRAVA_BASE_URL: "https://sandbox.api.prava.space",
  PRAVA_TEST_CUSTOMER_ID: "humsafar-demo-user",
  PRAVA_TEST_CUSTOMER_EMAIL: "demo@example.com",
  PRAVA_TEST_MANDATE_AMOUNT_CAP: "100",
};

test("mandate session command creates an authorize-only listed sandbox mandate", async () => {
  let request;
  const result = await createPravaMandateSession({
    env,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        session_id: "sess_1",
        session_token: "sensitive-session-token",
        iframe_url: "https://sandbox.collect.prava.space/session/sess_1",
        order_id: "ord_1",
        expires_at: "2026-08-02T00:30:00.000Z",
        authorizeOnly: true,
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(request.url, "https://sandbox.api.prava.space/v1/sessions");
  const body = JSON.parse(request.options.body);
  assert.equal(body.user_id, "humsafar-demo-user");
  assert.equal(body.user_email, "demo@example.com");
  assert.equal(body.total_amount, "100.00");
  assert.equal(body.currency, "INR");
  assert.equal(body.purchase_context[0].merchant_details.name, "Duffel");
  assert.deepEqual(body.mandate_setup, {
    intent: "mandate_setup",
    recurring_frequency: "one_time",
    merchant_scope: "listed",
    max_charges: 1,
  });
  assert.deepEqual(result, {
    environment: "sandbox",
    action: "mandate_session_created",
    customerId: "humsafar-demo-user",
    merchant: "Duffel",
    amountCap: 100,
    currency: "INR",
    authorizeOnly: true,
    sessionId: "sess_1",
    iframeUrl: "https://sandbox.collect.prava.space/session/sess_1",
    expiresAt: "2026-08-02T00:30:00.000Z",
  });
  assert.equal(JSON.stringify(result).includes("sensitive-session-token"), false);
});

test("mandate session command fails before network on unsafe configuration", () => {
  assert.throws(
    () => mandateSessionConfig({ ...env, PRAVA_SECRET_KEY: "pk_test_wrong-kind" }),
    /sandbox secret key/,
  );
  assert.throws(
    () => mandateSessionConfig({ ...env, PRAVA_TEST_CUSTOMER_EMAIL: "" }),
    /PRAVA_TEST_CUSTOMER_EMAIL is required/,
  );
  assert.throws(
    () => mandateSessionConfig({ ...env, PRAVA_BASE_URL: "https://api.prava.space" }),
    /Refusing non-sandbox/,
  );
});
