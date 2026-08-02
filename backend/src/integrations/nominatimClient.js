/**
 * Low-volume, user-triggered geocoding through OpenStreetMap Nominatim.
 *
 * The public service is free and keyless, but not an unlimited production API:
 * https://operations.osmfoundation.org/policies/nominatim/
 * This client follows the public policy by identifying Humsafar, caching every
 * result, serialising calls, and leaving at least one second between requests.
 * HUMSAFAR_NOMINATIM_URL keeps the provider switchable without a client update.
 */
export class NominatimClient {
  constructor({
    baseUrl = process.env.HUMSAFAR_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org",
    userAgent = process.env.HUMSAFAR_NOMINATIM_USER_AGENT ?? "Humsafar/0.1 (+https://github.com/Preethesh16/Humsafar)",
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {}) {
    this.baseUrl = baseUrl;
    this.userAgent = userAgent;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.sleep = sleep;
    this.cache = new Map();
    this.queue = Promise.resolve();
    this.lastRequestAt = 0;
  }

  async geocode(place) {
    const query = validQuery(place);
    const key = query.toLocaleLowerCase("en-IN");
    if (this.cache.has(key)) return this.cache.get(key);

    const request = this.queue.then(async () => {
      if (this.cache.has(key)) return this.cache.get(key);
      const wait = Math.max(0, 1_000 - (this.now() - this.lastRequestAt));
      if (wait > 0) await this.sleep(wait);

      const url = new URL("/search", this.baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      this.lastRequestAt = this.now();
      const response = await this.fetchImpl(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw geocodeError(`Nominatim failed with ${response.status}`, "NOMINATIM_FAILED");
      const payload = await response.json();
      const latitude = Number(payload?.[0]?.lat);
      const longitude = Number(payload?.[0]?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw geocodeError("No OpenStreetMap result for that destination", "NOMINATIM_EMPTY");
      }
      const coordinates = { latitude, longitude };
      this.cache.set(key, coordinates);
      return coordinates;
    });
    this.queue = request.catch(() => {});
    return request;
  }
}

function validQuery(place) {
  if (typeof place !== "string" || place.trim() === "") {
    throw geocodeError("A destination is required for geocoding", "INVALID_GEOCODE_QUERY");
  }
  return place.trim().slice(0, 160);
}

function geocodeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
