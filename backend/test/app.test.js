import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";
import { EventHub } from "../src/events/eventHub.js";
import { ApprovalService } from "../src/services/approvalService.js";
import { ChoiceService } from "../src/services/choiceService.js";

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
    approvalService: new ApprovalService({ createId: () => "approval_1" }),
    choiceService: new ChoiceService(),
    mandateService: {
      resolveMandate(merchant) {
        return merchant === "Duffel"
          ? { data: { mandateId: "mdt_123", merchant }, source: "sandbox" }
          : undefined;
      },
    },
    pravaApprovalService: {
      async create({ runId }) {
        return {
          runId,
          environment: "sandbox",
          merchant: "Humsafar",
          amountCap: 13800,
          currency: "INR",
          iframeUrl: "https://sandbox.collect.prava.space/session/test-only",
          expiresAt: "2026-08-03T00:15:00.000Z",
          stage: "waiting_for_cardholder",
        };
      },
      async status({ runId }) {
        return { runId, environment: "sandbox", merchant: "Humsafar", amountCap: 13800, currency: "INR", stage: "checkout_ready", terminal: false, paid: false, checkedAt: "2026-08-03T00:05:00.000Z" };
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

  const approvalRequest = await fetch(`${baseUrl}/api/approvals/requests`, {
    method: "POST",
    headers: {
      authorization: "Bearer internal-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      runId: "run_1",
      allocations: { flights: 100, stay: 200, food: 50, guide: 25 },
    }),
  });
  assert.equal(approvalRequest.status, 201);
  const approval = await approvalRequest.json();

  const decision = await fetch(`${baseUrl}/api/approvals/approval_1/decision`, {
    method: "POST",
    headers: {
      authorization: "Bearer internal-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      approvalRequestId: "attacker-controlled-id",
      runId: "run_1",
      digest: approval.digest,
      decision: "approved",
    }),
  });
  assert.equal(decision.status, 202);
  assert.equal((await decision.json()).status, "approved");

  const consume = await fetch(`${baseUrl}/api/approvals/approval_1/consume`, {
    method: "POST",
    headers: {
      authorization: "Bearer internal-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      approvalRequestId: "attacker-controlled-id",
      runId: "run_1",
      digest: approval.digest,
    }),
  });
  assert.equal(consume.status, 200);
  assert.equal((await consume.json()).status, "consumed");

  const mandate = await fetch(`${baseUrl}/api/prava/mandates/resolve?merchant=Duffel`, {
    headers: { authorization: "Bearer internal-test-token" },
  });
  assert.equal(mandate.status, 200);
  assert.deepEqual(await mandate.json(), {
    data: { mandateId: "mdt_123", merchant: "Duffel" },
    source: "sandbox",
  });

  const phoneApproval = await fetch(`${baseUrl}/api/prava/phone-approval`, {
    method: "POST",
    headers: { authorization: "Bearer internal-test-token", "content-type": "application/json" },
    body: JSON.stringify({ runId: "run_1" }),
  });
  assert.equal(phoneApproval.status, 201);
  assert.equal((await phoneApproval.json()).amountCap, 13800);
  const phoneStatus = await fetch(`${baseUrl}/api/prava/phone-approval?runId=run_1`, {
    headers: { authorization: "Bearer internal-test-token" },
  });
  assert.equal(phoneStatus.status, 200);
  assert.equal((await phoneStatus.json()).stage, "checkout_ready");

  const choiceEvent = {
    type: "choice_requested",
    runId: "run_1",
    agent: "stay",
    slice: 9000,
    ranking: "rating",
    timeoutSeconds: 45,
    options: [{ optionId: "stay:a:8000", vendor: "A", description: "Room", price: 8000, currency: "INR", source: "fixture" }],
  };
  assert.equal((await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { authorization: "Bearer internal-test-token", "content-type": "application/json" },
    body: JSON.stringify(choiceEvent),
  })).status, 202);

  assert.equal((await fetch(`${baseUrl}/api/choices`, {
    method: "POST",
    headers: { authorization: "Bearer internal-test-token", "content-type": "application/json" },
    body: JSON.stringify({ runId: "run_1", agent: "stay", optionId: "stay:a:8000" }),
  })).status, 202);
  const selected = await fetch(`${baseUrl}/api/choices?runId=run_1&agent=stay`, {
    headers: { authorization: "Bearer internal-test-token" },
  });
  assert.deepEqual(await selected.json(), { data: { optionId: "stay:a:8000" } });
});
