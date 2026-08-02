import assert from "node:assert/strict";
import test from "node:test";

import { DuffelClient } from "../src/integrations/duffelClient.js";
import { GoogleMapsClient } from "../src/integrations/googleMapsClient.js";
import { NominatimClient } from "../src/integrations/nominatimClient.js";
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

test("Google geocoding keeps its key server-side and returns coordinates", async () => {
  let requestUrl;
  const client = new GoogleMapsClient({
    apiKey: "server-only-key",
    fetchImpl: async (url) => {
      requestUrl = url;
      return new Response(JSON.stringify({
        status: "OK",
        results: [{ geometry: { location: { lat: 15.2993, lng: 74.124 } } }],
      }), { status: 200 });
    },
  });
  assert.deepEqual(await client.geocode("Goa, India"), { latitude: 15.2993, longitude: 74.124 });
  assert.equal(requestUrl.searchParams.get("address"), "Goa, India");
  assert.equal(requestUrl.searchParams.get("key"), "server-only-key");
});

test("stay discovery geocodes the destination before calling Duffel", async () => {
  let duffelInput;
  const service = new DiscoveryService({
    googleMapsClient: { geocode: async (place) => {
      assert.equal(place, "Goa");
      return { latitude: 15.2993, longitude: 74.124 };
    } },
    duffelClient: { searchStays: async (input) => {
      duffelInput = input;
      return { results: [{
        id: "stay_1",
        accommodation: { name: "Test Stay", description: "Two nights", rating: 4.4 },
        cheapest_rate_total_amount: "8000.00",
        cheapest_rate_currency: "INR",
      }] };
    } },
    logger,
  });
  const result = await service.search("stay", { destination: "Goa", checkInDate: "2026-08-10", checkOutDate: "2026-08-12" });
  assert.equal(result.source, "live");
  assert.equal(duffelInput.latitude, 15.2993);
  assert.equal(duffelInput.longitude, 74.124);
});

test("Nominatim provides cached, identified, keyless geocoding", async () => {
  let calls = 0;
  let request;
  const client = new NominatimClient({
    userAgent: "Humsafar test suite",
    fetchImpl: async (url, options) => {
      calls += 1;
      request = { url, options };
      return new Response(JSON.stringify([{ lat: "15.2993", lon: "74.1240" }]), { status: 200 });
    },
  });
  assert.deepEqual(await client.geocode("Goa"), { latitude: 15.2993, longitude: 74.124 });
  assert.deepEqual(await client.geocode("goa"), { latitude: 15.2993, longitude: 74.124 });
  assert.equal(calls, 1);
  assert.equal(request.options.headers["User-Agent"], "Humsafar test suite");
  assert.equal(request.url.searchParams.has("countrycodes"), false);
  assert.equal(request.url.searchParams.has("key"), false);
});

test("non-flight journey requests never call an air-only provider", async () => {
  let called = false;
  const service = new DiscoveryService({
    duffelClient: { searchFlights: async () => { called = true; } },
    logger,
  });
  const result = await service.search("flights", { travelMode: "train" });
  assert.equal(result.source, "fixture");
  assert.equal(called, false);
});

test("missing Duffel access falls back before consuming public geocoding", async () => {
  let geocoded = false;
  const service = new DiscoveryService({
    duffelClient: new DuffelClient({ token: "" }),
    googleMapsClient: { geocode: async () => { geocoded = true; } },
    logger,
  });
  const result = await service.search("stay", { destination: "Goa" });
  assert.equal(result.source, "fixture");
  assert.equal(geocoded, false);
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
