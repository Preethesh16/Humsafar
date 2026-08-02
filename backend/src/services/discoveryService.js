import { flightFixtures, foodFixtures, guideFixtures, stayFixtures } from "../fixtures/discovery.js";
import { withFixtureFallback } from "../integrations/withFixtureFallback.js";
import { scaleFixtures } from "./tripScope.js";

export class DiscoveryService {
  constructor({ duffelClient, googleMapsClient, fxRateClient, logger = console }) {
    this.duffelClient = duffelClient;
    this.googleMapsClient = googleMapsClient;
    this.fxRateClient = fxRateClient;
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
        live: async () => {
          const resolved = await this.#flightCodes(input);
          return normalizeFlights(await this.duffelClient.searchFlights({ ...input, ...resolved }), this.fxRateClient);
        },
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
            return normalizeStays(await this.duffelClient.searchStays(input), this.fxRateClient);
          }
          const coordinates = await this.#stayCoordinates(input);
          return normalizeStays(await this.duffelClient.searchStays({ ...input, ...coordinates }), this.fxRateClient);
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
    return this.googleMapsClient.geocode(input.destinationName ?? input.destination);
  }

  async #flightCodes(input) {
    const origin = /^[A-Z]{3}$/i.test(input.origin ?? "")
      ? input.origin.toUpperCase()
      : await this.#flightCode(input.originName);
    const destination = /^[A-Z]{3}$/i.test(input.destination ?? "")
      ? input.destination.toUpperCase()
      : await this.#flightCode(input.destinationName);
    return { origin, destination };
  }

  async #flightCode(placeName) {
    try {
      return (await this.duffelClient.suggestPlace(placeName)).code;
    } catch (error) {
      if (error.code !== "DUFFEL_PLACE_NOT_FOUND" || !this.googleMapsClient?.geocode || !this.duffelClient.suggestNearby) throw error;
      const coordinates = await this.googleMapsClient.geocode(placeName);
      return (await this.duffelClient.suggestNearby(coordinates)).code;
    }
  }
}

async function normalizeFlights(data, fxRateClient) {
  const offers = data?.offers ?? [];
  return Promise.all(offers.map(async (offer) => {
    const price = await inrPrice(offer.total_amount, offer.total_currency, "flight", fxRateClient);
    const journey = offer.slices?.map((slice) => `${slice.origin?.iata_code}-${slice.destination?.iata_code}`).join(", ") ?? "Flight";
    return {
      id: offer.id,
      category: "flights",
      vendor: offer.owner?.name ?? "Airline",
      // The airline is the inventory owner shown to the traveller; Duffel is
      // the checkout merchant whose Prava mandate is approved.
      merchant: "Duffel",
      description: price.converted
        ? `${journey}; provider total ${price.providerCurrency} ${price.providerAmount}, converted to INR using a daily reference rate`
        : journey,
      price: price.amount,
      currency: "INR",
      providerAmount: price.providerAmount,
      providerCurrency: price.providerCurrency,
      priceBasis: price.converted ? "reference-rate-conversion" : "provider-inr",
      fxDate: price.fxDate,
      source: "live",
    };
  }));
}

async function normalizeStays(data, fxRateClient) {
  const results = data?.results ?? data ?? [];
  if (!Array.isArray(results)) {
    const error = new Error("Duffel stay search returned an invalid result list");
    error.code = "DUFFEL_INVALID_RESPONSE";
    throw error;
  }
  return Promise.all(results.map(async (result) => {
    const providerAmount = result.cheapest_rate_total_amount ?? result.cheapest_rate?.total_amount;
    const providerCurrency = result.cheapest_rate_currency ?? result.cheapest_rate?.total_currency;
    const price = await inrPrice(providerAmount, providerCurrency, "stay", fxRateClient);
    return {
      id: result.id,
      category: "stay",
      vendor: result.accommodation?.name ?? "Accommodation",
      description: price.converted
        ? `${result.accommodation?.description ?? "Stay"}; provider total ${price.providerCurrency} ${price.providerAmount}, converted to INR using a daily reference rate`
        : result.accommodation?.description ?? "Stay",
      price: price.amount,
      currency: "INR",
      providerAmount: price.providerAmount,
      providerCurrency: price.providerCurrency,
      priceBasis: price.converted ? "reference-rate-conversion" : "provider-inr",
      fxDate: price.fxDate,
      rating: result.accommodation?.rating,
      source: "live",
    };
  }));
}

/**
 * Agent allocations and Prava caps are denominated in INR. Treating a GBP or
 * USD provider amount as rupees would make the budget proof meaningless, so a
 * differently configured Duffel organisation must fail closed. The fallback
 * layer will then disclose fixture data instead of relabelling the currency.
 */
function assertInr(currencies, inventory) {
  const unsupported = currencies.find((currency) => currency && currency !== "INR");
  if (!unsupported) return;
  const error = new Error(`Duffel ${inventory} inventory returned ${unsupported}; Humsafar requires INR billing`);
  error.code = "DUFFEL_CURRENCY_UNSUPPORTED";
  throw error;
}

async function inrPrice(amount, currency, inventory, fxRateClient) {
  const numeric = Number(amount);
  const providerCurrency = String(currency ?? "").toUpperCase();
  if (!Number.isFinite(numeric) || numeric <= 0 || !providerCurrency) {
    const error = new Error(`Duffel ${inventory} inventory returned an invalid price`);
    error.code = "DUFFEL_PRICE_INVALID";
    throw error;
  }
  if (providerCurrency === "INR") {
    return { amount: numeric, providerAmount: numeric, providerCurrency, converted: false, fxDate: null };
  }
  if (!fxRateClient?.convert) {
    assertInr([providerCurrency], inventory);
  }
  const converted = await fxRateClient.convert(numeric, providerCurrency, "INR");
  return {
    amount: converted.amount, providerAmount: numeric, providerCurrency,
    converted: true, fxDate: converted.date,
  };
}
