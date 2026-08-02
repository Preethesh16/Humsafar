import { flightFixtures, foodFixtures, guideFixtures, stayFixtures } from "../fixtures/discovery.js";
import { withFixtureFallback } from "../integrations/withFixtureFallback.js";
import { scaleFixtures } from "./tripScope.js";

export class DiscoveryService {
  constructor({ duffelClient, googleMapsClient, logger = console }) {
    this.duffelClient = duffelClient;
    this.googleMapsClient = googleMapsClient;
    this.logger = logger;
  }

  /**
   * Attaches a Google place id to each row so the UI can link to one location
   * instead of a search that returns a list.
   *
   * Best-effort by construction: without a key, or for an invented fixture
   * venue, `findPlaceId` returns null and the link degrades to a search that
   * the UI then labels honestly. Lookups run in parallel and never reject, so
   * discovery cannot be slowed or broken by a maps failure.
   */
  async #withPlaceIds(rows, input) {
    if (!this.googleMapsClient?.findPlaceId) return rows;
    const near = String(input.destination ?? "").trim();
    return Promise.all(
      rows.map(async (row) => {
        const placeId = await this.googleMapsClient.findPlaceId(row.vendor, near);
        return placeId ? { ...row, placeId } : row;
      }),
    );
  }

  async search(category, input = {}) {
    // Offline rows are written for a baseline 3-day, one-traveller, one-room
    // trip. Scale them to what was actually asked, or an 8-day trip for four is
    // quoted the price of a 3-day trip for one. Live provider responses are
    // already priced for the real request and must never be scaled again.
    if (category === "food") return { data: await this.#withPlaceIds(scaleFixtures(foodFixtures, "food", input), input), source: "fixture" };
    if (category === "guide") return { data: await this.#withPlaceIds(scaleFixtures(guideFixtures, "guide", input), input), source: "fixture" };
    if (category === "flights") {
      // Duffel only searches air inventory. A train/bus/road/compare request
      // must fall through to the mode-aware local provider rather than quietly
      // returning flights for a different user choice.
      if (input.travelMode && input.travelMode !== "flight") {
        return { data: scaleFixtures(flightFixtures, "flights", input), source: "fixture" };
      }
      return withFixtureFallback({
        integration: "duffel-flights",
        logger: this.logger,
        live: async () => normalizeFlights(await this.duffelClient.searchFlights(input)),
        fixture: async () => scaleFixtures(flightFixtures, "flights", input),
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
        fixture: async () => this.#withPlaceIds(scaleFixtures(stayFixtures, "stay", input), input),
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
