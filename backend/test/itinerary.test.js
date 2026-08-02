import assert from "node:assert/strict";
import test from "node:test";

import { GeoapifyClient } from "../src/integrations/geoapifyClient.js";
import { OpenMeteoClient, forecastRange } from "../src/integrations/openMeteoClient.js";
import { ItineraryService } from "../src/services/itineraryService.js";

const placeRows = [
  place("church", "Old Church", 15.500, 73.820, ["tourism.sights.place_of_worship.church"], true),
  place("beach", "Sunset Beach", 15.505, 73.815, ["beach"], false),
  place("museum", "Local Museum", 15.510, 73.810, ["entertainment.museum"], false),
  place("park", "Green Park", 15.515, 73.805, ["leisure.park"], false),
  place("fort", "Hill Fort", 15.520, 73.800, ["tourism.sights.fort"], true),
  place("market", "Town Market", 15.525, 73.795, ["commercial.marketplace"], false),
];

test("Geoapify client keeps its key server-side and uses documented coordinate order", async () => {
  const urls = [];
  const client = new GeoapifyClient({
    apiKey: "private-test-key",
    fetchImpl: async (url) => {
      urls.push(new URL(url));
      if (url.pathname.includes("geocode")) return json({ results: [{ name: "Goa", lat: 15.49, lon: 73.82, place_id: "goa" }] });
      if (url.pathname.includes("places")) return json({ features: [placeRows[0]] });
      return json({ results: [{ distance: 1200, time: 300, legs: [{ distance: 1200, time: 300 }] }] });
    },
  });

  const destination = await client.geocode("Goa");
  await client.places({ ...destination, categories: ["tourism.sights"], radius: 5_000, limit: 4 });
  await client.route({ waypoints: [destination, { latitude: 15.5, longitude: 73.8 }], mode: "drive" });

  assert.equal(urls[0].pathname, "/v1/geocode/search");
  assert.equal(urls[1].searchParams.get("filter"), "circle:73.82,15.49,5000");
  assert.equal(urls[1].searchParams.get("bias"), "proximity:73.82,15.49");
  assert.equal(urls[2].searchParams.get("waypoints"), "15.49,73.82|15.5,73.8");
  assert.ok(urls.every((url) => url.searchParams.get("apiKey") === "private-test-key"));
});

test("weather is refused outside the real forecast window instead of invented", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  assert.equal(forecastRange(null, null, now).available, false);
  assert.equal(forecastRange("2026-09-01", "2026-09-04", now).available, false);
  assert.deepEqual(forecastRange("2026-08-04", "2026-08-07", now), {
    available: true,
    startDate: "2026-08-04",
    endDate: "2026-08-07",
  });
});

test("Open-Meteo normalises an exact-date daily forecast", async () => {
  const client = new OpenMeteoClient({
    fetchImpl: async () => json({
      timezone: "Asia/Kolkata",
      daily: {
        time: ["2026-08-04"], weather_code: [61],
        temperature_2m_max: [29], temperature_2m_min: [24],
        precipitation_probability_max: [70],
        sunrise: ["2026-08-04T06:15"], sunset: ["2026-08-04T19:01"],
      },
    }),
  });
  const result = await client.daily({ latitude: 15.49, longitude: 73.82, startDate: "2026-08-04", endDate: "2026-08-04" });
  assert.equal(result.days[0].condition, "Rain");
  assert.equal(result.days[0].precipitationProbability, 70);
  assert.equal(result.days[0].sunrise, "06:15");
});

test("planner uses real place rows, clusters days, returns to base, and never books food", async () => {
  const calls = { routes: [], places: [] };
  const geoapifyClient = {
    async geocode() {
      return { name: "Goa", formatted: "Goa, India", latitude: 15.49, longitude: 73.82, placeId: "goa" };
    },
    async places(input) {
      calls.places.push(input);
      if (input.categories.includes("catering.restaurant")) {
        return [
          { id: `meal-${calls.places.length}`, name: "Nearby Cafe", address: "Goa", latitude: input.latitude, longitude: input.longitude, categories: ["catering.cafe"], source: "geoapify" },
        ];
      }
      return placeRows.map(normalizeFeature);
    },
    async route({ waypoints, mode }) {
      calls.routes.push({ waypoints, mode });
      return {
        distanceMeters: (waypoints.length - 1) * 1_000,
        durationSeconds: (waypoints.length - 1) * 600,
        legs: waypoints.slice(1).map(() => ({ distanceMeters: 1_000, durationSeconds: 600 })),
      };
    },
  };
  const service = new ItineraryService({
    geoapifyClient,
    weatherClient: { async daily() { return { source: "open-meteo", available: false, reason: "Distant dates", days: [] }; } },
    logger: { warn() {} },
  });

  const suggestions = await service.suggestions({ destination: "Goa", days: 2, interests: ["heritage"], travelers: 2 });
  assert.equal(suggestions.places[0].name, "Old Church", "a Wikipedia-linked interest match is prioritised");
  assert.equal(suggestions.places[0].booking, "suggestion-only");

  const plan = await service.plan({
    destination: "Goa", days: 2, travelers: 2, pace: "balanced",
    planningMode: "choose", selectedPlaceIds: ["church", "beach", "museum", "park"],
    interests: ["heritage", "beaches"], localTransportMode: "drive",
  });
  assert.equal(plan.days.length, 2);
  assert.equal(plan.source.costs, "planning-estimate");
  assert.match(plan.baseAssumption, /destination centre/);
  assert.ok(plan.days.every((day) => day.returnToBase.to === "Goa centre"));
  assert.ok(calls.routes.every(({ waypoints }) => waypoints[0].name === "Goa centre" && waypoints.at(-1).name === "Goa centre"));
  const foodStops = plan.days.flatMap((day) => day.timeline).filter((stop) => stop.type === "food");
  assert.ok(foodStops.length >= 1);
  assert.ok(foodStops.every((stop) => stop.options.every((option) => option.booking === "suggestion-only")));
  assert.ok(plan.truth.some((line) => /never booked/.test(line)));
});

test("route provider failure degrades to a labelled estimate, not a fixture route", async () => {
  const service = new ItineraryService({
    geoapifyClient: {
      async geocode() { return { name: "X", latitude: 10, longitude: 20 }; },
      async places(input) {
        if (input.categories.includes("catering.restaurant")) return [];
        return [normalizeFeature(placeRows[0]), normalizeFeature(placeRows[1])];
      },
      async route() { const error = new Error("down"); error.code = "GEOAPIFY_NETWORK_ERROR"; throw error; },
    },
    weatherClient: { async daily() { return { available: false, days: [] }; } },
    logger: { warn() {} },
  });
  const plan = await service.plan({ destination: "X", days: 1 });
  assert.equal(plan.days[0].route.source, "straight-line-estimate");
});

test("a selected stay is geocoded and becomes every day's start and return", async () => {
  const routeBases = [];
  const service = new ItineraryService({
    geoapifyClient: {
      async geocode(query) {
        return query.startsWith("Chosen Hotel")
          ? { name: "Chosen Hotel", latitude: 15.55, longitude: 73.75 }
          : { name: "Goa", latitude: 15.49, longitude: 73.82 };
      },
      async places(input) {
        if (input.categories.includes("catering.restaurant")) return [];
        return [normalizeFeature(placeRows[0]), normalizeFeature(placeRows[1])];
      },
      async route({ waypoints }) {
        routeBases.push([waypoints[0], waypoints.at(-1)]);
        return { distanceMeters: 2_000, durationSeconds: 1_200, legs: waypoints.slice(1).map(() => ({ distanceMeters: 500, durationSeconds: 300 })) };
      },
    },
    weatherClient: { async daily() { return { available: false, days: [] }; } },
    logger: { warn() {} },
  });
  const plan = await service.plan({ destination: "Goa", days: 1, baseName: "Chosen Hotel", basePlace: "Chosen Hotel, Goa" });
  assert.equal(plan.base.name, "Chosen Hotel");
  assert.match(plan.baseAssumption, /selected stay/);
  assert.ok(routeBases.every(([first, last]) => first.name === "Chosen Hotel" && last.name === "Chosen Hotel"));
  assert.equal(plan.days[0].returnToBase.to, "Chosen Hotel");
});

function place(id, name, lat, lon, categories, hasWikipedia) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      place_id: id, name, lat, lon, categories, formatted: `${name}, Goa`, distance: 500,
      ...(hasWikipedia ? { wiki_and_media: { wikipedia: `en:${name}` } } : {}),
    },
  };
}

function normalizeFeature(feature) {
  const { properties, geometry } = feature;
  return {
    id: properties.place_id,
    name: properties.name,
    address: properties.formatted,
    area: "Goa",
    latitude: geometry.coordinates[1],
    longitude: geometry.coordinates[0],
    categories: properties.categories,
    distanceMeters: properties.distance,
    website: null,
    hasWikipedia: Boolean(properties.wiki_and_media),
    source: "geoapify",
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
