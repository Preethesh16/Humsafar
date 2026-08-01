import assert from "node:assert/strict";
import test from "node:test";

import { DuffelClient } from "../src/integrations/duffelClient.js";
import { withFixtureFallback } from "../src/integrations/withFixtureFallback.js";
import { DiscoveryService } from "../src/services/discoveryService.js";
import {
  flightFixtures,
  foodFixtures,
  guideFixtures,
  stayFixtures,
} from "../src/fixtures/discovery.js";

const logger = { info() {}, warn() {} };

test("withFixtureFallback labels fallback data honestly", async () => {
  const result = await withFixtureFallback({
    integration: "test",
    logger,
    live: async () => { throw new Error("offline"); },
    fixture: async () => [{ id: "fixture" }],
  });
  assert.deepEqual(result, { data: [{ id: "fixture" }], source: "fixture" });
});

test("Duffel flight search sends the official v2 request shape", async () => {
  let request;
  const client = new DuffelClient({
    token: "duffel-token",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ data: { offers: [] } }), { status: 200 });
    },
  });
  await client.searchFlights({ origin: "BLR", destination: "GOI", departureDate: "2026-08-02", passengers: 2 });
  assert.match(request.url, /air\/offer_requests/);
  assert.equal(request.options.headers["Duffel-Version"], "v2");
  assert.deepEqual(JSON.parse(request.options.body).data.passengers, [{ type: "adult" }, { type: "adult" }]);
});

test("DiscoveryService degrades missing Duffel credentials to labeled fixtures", async () => {
  const service = new DiscoveryService({ duffelClient: new DuffelClient({ token: "" }), logger });
  const result = await service.search("flights", { origin: "BLR", destination: "GOI", departureDate: "2026-08-02" });
  assert.equal(result.source, "fixture");
  assert.equal(result.data.every((item) => item.source === "fixture"), true);
});

test("food and guide results always disclose fixture source", async () => {
  const service = new DiscoveryService({ duffelClient: {}, logger });
  for (const category of ["food", "guide"]) {
    const result = await service.search(category);
    assert.equal(result.source, "fixture");
    assert.equal(result.data.every((item) => item.source === "fixture"), true);
  }
});

test("default demo fixtures create real contention without making the plan impossible", () => {
  const categories = [flightFixtures, stayFixtures, foodFixtures, guideFixtures];
  const floor = categories.reduce(
    (total, options) => total + Math.min(...options.map((option) => option.price)),
    0,
  );
  const preferred = categories.reduce((total, options) => {
    const choice = options.reduce((best, option) => {
      if (option.rating > best.rating) return option;
      if (option.rating === best.rating && option.price < best.price) return option;
      return best;
    });
    return total + choice.price;
  }, 0);

  assert.equal(categories.every((options) => options.length >= 4), true);
  assert.equal(categories.flat().every((option) => option.source === "fixture"), true);
  assert.equal(categories.flat().every((option) => Number.isFinite(option.rating)), true);
  assert.equal(floor, 16_100);
  assert.equal(preferred, 35_600);
  assert.ok(floor <= 30_000, "the cheapest complete plan must fit the demo budget");
  assert.ok(preferred > 30_000, "preferred choices must force the agents to negotiate");
});
