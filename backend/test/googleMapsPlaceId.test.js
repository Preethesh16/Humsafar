import assert from "node:assert/strict";
import test from "node:test";

import { GoogleMapsClient } from "../src/integrations/googleMapsClient.js";

const ok = (payload) => async () => ({ ok: true, json: async () => payload });

test("returns the place id for a resolved venue", async () => {
  let seen = null;
  const client = new GoogleMapsClient({
    apiKey: "test-key",
    fetchImpl: async (url) => {
      seen = url;
      return { ok: true, json: async () => ({ status: "OK", candidates: [{ place_id: "ChIJxyz" }] }) };
    },
  });

  assert.equal(await client.findPlaceId("Gunpowder Assagao", "Goa"), "ChIJxyz");
  assert.equal(seen.searchParams.get("input"), "Gunpowder Assagao Goa");
  assert.equal(seen.searchParams.get("fields"), "place_id");
});

test("no key means no lookup and no throw", async () => {
  let called = false;
  const client = new GoogleMapsClient({
    apiKey: "",
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({}) };
    },
  });

  assert.equal(await client.findPlaceId("Anywhere", "Goa"), null);
  assert.equal(called, false, "must not call Google without a key");
});

test("an invented fixture venue resolves to null rather than a wrong pin", async () => {
  const client = new GoogleMapsClient({
    apiKey: "test-key",
    fetchImpl: ok({ status: "ZERO_RESULTS", candidates: [] }),
  });
  assert.equal(await client.findPlaceId("Local shacks", "Goa"), null);
});

test("every failure path degrades to null instead of breaking discovery", async () => {
  const cases = [
    ["http error", async () => ({ ok: false, status: 500, json: async () => ({}) })],
    ["quota", ok({ status: "OVER_QUERY_LIMIT" })],
    ["denied", ok({ status: "REQUEST_DENIED" })],
    ["empty candidates", ok({ status: "OK", candidates: [] })],
    ["missing place_id", ok({ status: "OK", candidates: [{}] })],
    ["network throw", async () => { throw new Error("connection refused"); }],
    ["bad json", async () => ({ ok: true, json: async () => { throw new Error("not json"); } })],
  ];

  for (const [name, fetchImpl] of cases) {
    const client = new GoogleMapsClient({ apiKey: "test-key", fetchImpl });
    assert.equal(await client.findPlaceId("Somewhere", "Goa"), null, `${name} should yield null`);
  }
});

test("an empty venue name is not looked up", async () => {
  let called = false;
  const client = new GoogleMapsClient({
    apiKey: "test-key",
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({}) };
    },
  });

  assert.equal(await client.findPlaceId("", ""), null);
  assert.equal(await client.findPlaceId(null, undefined), null);
  assert.equal(called, false);
});

test("the key is sent to Google and never returned to a caller", async () => {
  const client = new GoogleMapsClient({
    apiKey: "secret-key",
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("key"), "secret-key");
      return { ok: true, json: async () => ({ status: "OK", candidates: [{ place_id: "ChIJ1" }] }) };
    },
  });

  const result = await client.findPlaceId("Taj Holiday Village", "Goa");
  assert.equal(result, "ChIJ1");
  assert.ok(!String(result).includes("secret-key"));
});
