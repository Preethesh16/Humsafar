export class GoogleMapsClient {
  constructor({ apiKey = process.env.GOOGLE_MAPS_API_KEY, fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  /** Resolve a user-entered destination for provider APIs that require coordinates. */
  async geocode(place) {
    if (!this.apiKey) {
      const error = new Error("GOOGLE_MAPS_API_KEY is not configured");
      error.code = "GOOGLE_MAPS_NOT_CONFIGURED";
      throw error;
    }
    if (typeof place !== "string" || place.trim() === "") {
      const error = new Error("A destination is required for geocoding");
      error.code = "INVALID_GEOCODE_QUERY";
      throw error;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", place.trim());
    url.searchParams.set("key", this.apiKey);
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    const payload = await response.json();
    if (!response.ok || payload?.status !== "OK") {
      const error = new Error(payload?.error_message ?? `Google geocoding failed with ${payload?.status ?? response.status}`);
      error.code = `GOOGLE_GEOCODE_${payload?.status ?? "FAILED"}`;
      throw error;
    }

    const location = payload.results?.[0]?.geometry?.location;
    if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) {
      const error = new Error("Google geocoding returned no usable coordinates");
      error.code = "GOOGLE_GEOCODE_EMPTY";
      throw error;
    }
    return { latitude: location.lat, longitude: location.lng };
  }
}
