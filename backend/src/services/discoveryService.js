import { flightFixtures, foodFixtures, guideFixtures, stayFixtures } from "../fixtures/discovery.js";
import { withFixtureFallback } from "../integrations/withFixtureFallback.js";

export class DiscoveryService {
  constructor({ duffelClient, logger = console }) {
    this.duffelClient = duffelClient;
    this.logger = logger;
  }

  async search(category, input = {}) {
    if (category === "food") return { data: foodFixtures, source: "fixture" };
    if (category === "guide") return { data: guideFixtures, source: "fixture" };
    if (category === "flights") {
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
        live: async () => normalizeStays(await this.duffelClient.searchStays(input)),
        fixture: async () => stayFixtures,
      });
    }
    throw new TypeError("category must be flights, stay, food, or guide");
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
