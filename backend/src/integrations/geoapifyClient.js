const DEFAULT_BASE_URL = "https://api.geoapify.com";

/** Server-side client for Geoapify geocoding, POI search, and routing. */
export class GeoapifyClient {
  constructor({
    apiKey = process.env.GEOAPIFY_API_KEY,
    baseUrl = process.env.GEOAPIFY_BASE_URL ?? DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
  }

  async geocode(place) {
    if (typeof place !== "string" || place.trim() === "") {
      throw providerError("A destination is required", "INVALID_GEOAPIFY_QUERY");
    }
    const payload = await this.#get("/v1/geocode/search", {
      text: place.trim(), format: "json", limit: 1, lang: "en",
    });
    const result = payload?.results?.[0];
    if (!Number.isFinite(result?.lat) || !Number.isFinite(result?.lon)) {
      throw providerError(`Could not locate ${place}`, "GEOAPIFY_GEOCODE_EMPTY");
    }
    return {
      name: result.name ?? result.city ?? place.trim(),
      formatted: result.formatted ?? place.trim(),
      latitude: result.lat,
      longitude: result.lon,
      placeId: result.place_id ?? null,
      timezone: result.timezone?.name ?? null,
    };
  }

  async places({ latitude, longitude, categories, radius = 30_000, limit = 40 }) {
    coordinates(latitude, longitude);
    if (!Array.isArray(categories) || categories.length === 0) {
      throw providerError("At least one place category is required", "INVALID_GEOAPIFY_CATEGORIES");
    }
    const lon = Number(longitude);
    const lat = Number(latitude);
    const payload = await this.#get("/v2/places", {
      categories: categories.join(","),
      filter: `circle:${lon},${lat},${Math.min(Math.max(Number(radius), 100), 100_000)}`,
      bias: `proximity:${lon},${lat}`,
      limit: Math.min(Math.max(Number(limit), 1), 100),
      lang: "en",
    });
    return (payload?.features ?? []).map(normalizePlace).filter(Boolean);
  }

  async route({ waypoints, mode = "drive" }) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw providerError("A route needs at least two waypoints", "INVALID_GEOAPIFY_ROUTE");
    }
    waypoints.forEach((point) => coordinates(point.latitude, point.longitude));
    const payload = await this.#get("/v1/routing", {
      waypoints: waypoints.map((point) => `${point.latitude},${point.longitude}`).join("|"),
      mode,
      format: "json",
      units: "metric",
      intermediate_waypoint_mode: "stopover",
      traffic: mode === "drive" ? "approximated" : undefined,
    });
    const route = payload?.results?.[0];
    if (!route) throw providerError("No route was returned", "GEOAPIFY_ROUTE_EMPTY");
    return {
      distanceMeters: Number(route.distance ?? 0),
      durationSeconds: Number(route.time ?? 0),
      legs: (route.legs ?? []).map((leg) => ({
        distanceMeters: Number(leg.distance ?? 0),
        durationSeconds: Number(leg.time ?? 0),
      })),
    };
  }

  async #get(path, params) {
    if (!this.apiKey) throw providerError("GEOAPIFY_API_KEY is not configured", "GEOAPIFY_NOT_CONFIGURED");
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries({ ...params, apiKey: this.apiKey })) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(12_000) });
    } catch (cause) {
      throw providerError("Geoapify could not be reached", "GEOAPIFY_NETWORK_ERROR", cause);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw providerError(
        payload?.message ?? `Geoapify failed with ${response.status}`,
        "GEOAPIFY_REQUEST_FAILED",
      );
    }
    return payload;
  }
}

function normalizePlace(feature) {
  const properties = feature?.properties ?? {};
  const coordinatesValue = feature?.geometry?.coordinates ?? [];
  const longitude = Number(properties.lon ?? coordinatesValue[0]);
  const latitude = Number(properties.lat ?? coordinatesValue[1]);
  const name = String(properties.name ?? properties.address_line1 ?? "").trim();
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: properties.place_id ?? `${latitude}:${longitude}:${name}`,
    name,
    address: properties.formatted ?? properties.address_line2 ?? "",
    area: properties.city ?? properties.county ?? properties.state ?? "",
    latitude,
    longitude,
    categories: Array.isArray(properties.categories) ? properties.categories : [],
    distanceMeters: Number.isFinite(properties.distance) ? properties.distance : null,
    website: safeHttpUrl(properties.website),
    hasWikipedia: Boolean(properties.wiki_and_media?.wikipedia || properties.datasource?.raw?.wikidata),
    source: "geoapify",
  };
}

function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function coordinates(latitude, longitude) {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw providerError("Valid latitude and longitude are required", "INVALID_GEOAPIFY_COORDINATES");
  }
}

function providerError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}
