import { flightFixtures, foodFixtures, guideFixtures, stayFixtures } from "../fixtures/discovery.js";
import { withFixtureFallback } from "../integrations/withFixtureFallback.js";

export class DiscoveryService {
  constructor({ duffelClient, googleMapsClient, logger = console }) {
    this.duffelClient = duffelClient;
    this.googleMapsClient = googleMapsClient;
    this.logger = logger;
  }

  async search(category, input = {}) {
    if (category === "food") return { data: foodFixtures, source: "fixture" };
    if (category === "guide") return { data: guideFixtures, source: "fixture" };
    if (category === "flights") {
      // Duffel only searches air inventory. A train/bus/road/compare request
      // must fall through to the mode-aware local provider rather than quietly
      // returning flights for a different user choice.
      if (input.travelMode && input.travelMode !== "flight") {
        return { data: flightFixtures, source: "fixture" };
      }
      return withFixtureFallback({
        integration: "duffel-flights",
        logger: this.logger,
        live: async () => normalizeFlights(await this.duffelClient.searchFlights(input)),
        fixture: async () => flightFixtures,
      });
    }
    if (category === "stay") {
      return withFixtureFallback({
        integration: "duffel-stays",
        logger: this.logger,
        live: async () => {
          // Do not spend a public Nominatim request merely to discover that
          // Duffel itself is not configured. DuffelClient owns `token`; test
          // doubles without that property are treated as configured.
          if (Object.hasOwn(this.duffelClient, "token") && !this.duffelClient.token) {
            return normalizeStays(await this.duffelClient.searchStays(input));
          }
          const coordinates = await this.#stayCoordinates(input);
          return normalizeStays(await this.duffelClient.searchStays({ ...input, ...coordinates }));
        },
        fixture: async () => stayFixtures,
      });
    }
    throw new TypeError("category must be flights, stay, food, or guide");
  }

  async #stayCoordinates(input) {
    if (Number.isFinite(input.latitude) && Number.isFinite(input.longitude)) {
      return { latitude: input.latitude, longitude: input.longitude };
    }
    if (!this.googleMapsClient) {
      const error = new Error("A geocoder or explicit coordinates are required for live stay search");
      error.code = "STAY_COORDINATES_UNAVAILABLE";
      throw error;
    }
    return this.googleMapsClient.geocode(input.destination);
  }
}

function normalizeFlights(data) {
  const offers = data?.offers ?? [];
  return offers.map((offer) => ({
    id: offer.id,
    category: "flights",
    vendor: offer.owner?.name ?? "Airline",
    description: offer.slices?.map((slice) => `${slice.origin?.iata_code}-${slice.destination?.iata_code}`).join(", ") ?? "Flight",
    price: Number(offer.total_amount),
    currency: offer.total_currency,
    source: "live",
  }));
}

function normalizeStays(data) {
  return (data?.results ?? data ?? []).map((result) => ({
    id: result.id,
    category: "stay",
    vendor: result.accommodation?.name ?? "Accommodation",
    description: result.accommodation?.description ?? "Stay",
    price: Number(result.cheapest_rate_total_amount ?? result.cheapest_rate?.total_amount),
    currency: result.cheapest_rate_currency ?? result.cheapest_rate?.total_currency,
    rating: result.accommodation?.rating,
    source: "live",
  }));
}
