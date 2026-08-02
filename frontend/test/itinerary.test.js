import assert from "node:assert/strict";
import test from "node:test";

import { fetchPlaceSuggestions, itineraryRequest, previewItinerary, stayReplanRequest } from "../src/lib/itinerary.js";

const answers = {
  destination: "Goa",
  travelers: 3,
  placePlanningMode: "choose",
  selectedPlaceIds: ["fort", "beach"],
  placeInterests: ["heritage", "beaches"],
  pace: "balanced",
  localTransportMode: "scooter",
  dateMode: "exact",
  departureDate: "2026-08-08",
};

test("the itinerary request preserves preferences without putting provider keys in the browser", () => {
  assert.deepEqual(itineraryRequest(answers, 3), {
    destination: "Goa",
    days: 3,
    travelers: 3,
    planningMode: "choose",
    selectedPlaceIds: ["fort", "beach"],
    interests: ["heritage", "beaches"],
    pace: "balanced",
    localTransportMode: "scooter",
    departureDate: "2026-08-08",
  });
  assert.ok(!JSON.stringify(itineraryRequest(answers, 3)).includes("apiKey"));
});

test("place and preview calls use the same-origin backend and surface structured errors", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith("suggestions")) return json({ places: [{ id: "fort" }] });
    return json({ error: { code: "GEOAPIFY_NOT_CONFIGURED", message: "Geoapify is unavailable" } }, 503);
  };
  assert.deepEqual(await fetchPlaceSuggestions({ destination: "Goa" }, fetchImpl), { places: [{ id: "fort" }] });
  await assert.rejects(
    previewItinerary({ destination: "Goa" }, fetchImpl),
    (error) => error.code === "GEOAPIFY_NOT_CONFIGURED" && /unavailable/.test(error.message),
  );
  assert.deepEqual(calls.map((call) => call.url), ["/api/itineraries/suggestions", "/api/itineraries/preview"]);
});

test("a chosen stay rebuild request preserves mapped stops and moves the route base", () => {
  const request = stayReplanRequest({
    destination: { formatted: "Goa, India" }, travelers: 2, pace: "relaxed", localTransportMode: "scooter",
    days: [{ date: "2026-08-08", timeline: [{ type: "place", id: "fort" }, { type: "food", id: "cafe" }] }],
  }, "Chosen Hotel");
  assert.deepEqual(request, {
    destination: "Goa, India", days: 1, travelers: 2, planningMode: "choose",
    selectedPlaceIds: ["fort"], pace: "relaxed", localTransportMode: "scooter",
    departureDate: "2026-08-08", baseName: "Chosen Hotel", basePlace: "Chosen Hotel, Goa, India",
  });
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
