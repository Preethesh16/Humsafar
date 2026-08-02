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

  /**
   * The Google place id for a named venue, or `null`.
   *
   * Exists so a map link can open one location instead of a list of guesses:
   * `?api=1&query=...` is a *search*, and a generic vendor name legitimately
   * matches many places. A place id resolves to exactly one.
   *
   * Resolution happens here, on the server, because it needs the API key and a
   * key in browser JavaScript is public to every visitor.
   *
   * Returns `null` rather than throwing on every failure path — an unconfigured
   * key, no match, a rate limit or a network blip. A missing map link must
   * never take down discovery, which is the actual product.
   */
  async findPlaceId(name, near = "") {
    if (!this.apiKey) return null;
    const query = [name, near].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
    if (!query) return null;

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
      url.searchParams.set("input", query);
      url.searchParams.set("inputtype", "textquery");
      url.searchParams.set("fields", "place_id");
      url.searchParams.set("key", this.apiKey);

      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      const payload = await response.json();
      if (!response.ok) return null;

      // ZERO_RESULTS is an ordinary answer for an invented fixture venue, not a
      // fault: the link simply falls back to a search.
      if (payload?.status !== "OK") return null;

      const placeId = payload.candidates?.[0]?.place_id;
      return typeof placeId === "string" && placeId.length > 0 ? placeId : null;
    } catch {
      return null;
    }
  }
}
