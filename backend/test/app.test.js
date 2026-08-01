import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";
import { EventHub } from "../src/events/eventHub.js";

test("health, event ingestion, validation, auth, and scoped card routes work", async (t) => {
  const eventHub = new EventHub();
  let scopedCardInput;
  const app = createApp({
    eventHub,
    internalApiToken: "internal-test-token",
    scopedCardService: {
      async mintScopedCard(...input) {
        scopedCardInput = input;
        return {
          cardId: "ins_1",
          cardToken: "virtual-card-token",
          merchant: input[1],
          amountCap: input[2],
          status: "issued",
        };
      },
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const unauthorized = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "approval_given", timestamp: new Date().toISOString() }),
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      authorization: "Bearer internal-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "unknown" }),
  });
  assert.equal(invalid.status, 400);

  const accepted = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      authorization: "Bearer internal-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "approval_given",
      timestamp: "2026-08-01T08:00:00.000Z",
    }),
  });
  assert.equal(accepted.status, 202);
  assert.deepEqual(await accepted.json(), { id: 1 });
  assert.equal(eventHub.snapshot().length, 1);

  const card = await fetch(`${baseUrl}/api/scoped-cards`, {
    method: "POST",
    headers: {
      authorization: "Bearer internal-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ mandateId: "mdt_123", merchant: "Duffel", amountCap: 500 }),
  });
  assert.equal(card.status, 201);
  assert.deepEqual(scopedCardInput, ["mdt_123", "Duffel", 500]);
});
