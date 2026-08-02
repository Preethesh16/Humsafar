import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";
import { EventHub } from "../src/events/eventHub.js";
import { ChoiceService } from "../src/services/choiceService.js";
import {
  SESSION_COOKIE,
  createSessionToken,
  readCookie,
  verifySessionToken,
} from "../src/session.js";

const SECRET = "test-session-secret";
const TOKEN = "internal-test-token";

test("session tokens verify only when intact and unexpired", () => {
  const token = createSessionToken(SECRET);

  assert.equal(verifySessionToken(token, SECRET), true);
  assert.equal(verifySessionToken(token, "a-different-secret"), false, "signed by another key");
  assert.equal(verifySessionToken(`${token}x`, SECRET), false, "tampered signature");
  assert.equal(verifySessionToken(undefined, SECRET), false);
  assert.equal(verifySessionToken(token, ""), false, "no secret configured");

  // Expiry is carried in the signed payload, so moving the clock past it
  // invalidates the cookie without the server storing anything.
  const expired = createSessionToken(SECRET, Date.now() - 24 * 60 * 60 * 1000);
  assert.equal(verifySessionToken(expired, SECRET), false);

  // The expiry is part of what is signed, so extending it breaks the signature
  // rather than buying more time.
  const forged = `${Date.now() + 999_999}.${token.slice(token.lastIndexOf(".") + 1)}`;
  assert.equal(verifySessionToken(forged, SECRET), false);
});

test("readCookie picks the right cookie out of a crowded header", () => {
  const header = `other=1; ${SESSION_COOKIE}=abc%2Fdef; trailing=2`;

  assert.equal(readCookie(header, SESSION_COOKIE), "abc/def");
  assert.equal(readCookie(header, "missing"), undefined);
  assert.equal(readCookie(undefined, SESSION_COOKIE), undefined);
  // A cookie whose name merely ends with ours must not match.
  assert.equal(readCookie(`not_${SESSION_COOKIE}=x`, SESSION_COOKIE), undefined);
});

test("a browser session opens the human routes and nothing else", async (t) => {
  const app = createApp({
    eventHub: new EventHub(),
    internalApiToken: TOKEN,
    sessionSecret: SECRET,
    choiceService: new ChoiceService(),
    scopedCardService: {
      async mintScopedCard() {
        throw new Error("a browser session must never reach card minting");
      },
    },
    runService: {
      start: () => ({ runId: "run_1", status: "started" }),
      get: () => ({ runId: "run_1", status: "running" }),
    },
    pravaApprovalService: {
      create: () => ({
        environment: "sandbox",
        iframeUrl: "https://sandbox.collect.prava.space/session/test-only",
        authorizeOnly: true,
      }),
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(SECRET))}`;

  const post = (path, headers) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ goal: "Goa trip", budget: "25000" }),
    });

  // The routes a human drives: reachable with a session cookie.
  assert.equal((await post("/api/runs", { cookie })).status, 202);
  assert.equal((await fetch(`${baseUrl}/api/runs/run_1`, { headers: { cookie } })).status, 200);
  assert.equal((await post("/api/prava/phone-approval", { cookie })).status, 201);

  // The routes that touch money or the stream's contents: bearer token only.
  // This is the whole point of splitting the authorizers — the dev proxy handed
  // the browser the internal token, so a page could have minted a card or
  // published a forged event. A session cookie cannot.
  for (const path of [
    "/api/scoped-cards",
    "/api/events",
    "/api/approvals/requests",
    "/api/prava/mandates/sync",
    "/api/trust/check",
    "/api/discovery/stay",
  ]) {
    const response = await post(path, { cookie });
    assert.equal(response.status, 401, `${path} accepted a browser session`);
  }

  // No credential at all is still refused everywhere.
  assert.equal((await post("/api/runs")).status, 401);

  // A forged cookie is refused; the bearer token still works as before.
  assert.equal((await post("/api/runs", { cookie: `${SESSION_COOKIE}=forged` })).status, 401);
  assert.equal((await post("/api/runs", { authorization: `Bearer ${TOKEN}` })).status, 202);
});

test("without a session secret the browser routes stay bearer-token-only", async (t) => {
  const app = createApp({
    eventHub: new EventHub(),
    internalApiToken: TOKEN,
    scopedCardService: { async mintScopedCard() {} },
    runService: { start: () => ({ runId: "run_1" }) },
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Local development and every pre-existing test run without a secret, so the
  // cookie path must not exist at all there.
  const response = await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(SECRET))}`,
    },
    body: JSON.stringify({ goal: "Goa trip", budget: "25000" }),
  });
  assert.equal(response.status, 401);
});

test("an unknown API route answers in JSON, not HTML", async (t) => {
  const app = createApp({
    eventHub: new EventHub(),
    scopedCardService: { async mintScopedCard() {} },
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/nope`);

  assert.equal(response.status, 404);
  // Express's default is an HTML error page, which a fetch() caller reports as
  // "unexpected token <" — making a mistyped route look like a parsing bug.
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
});
