export class DuffelClient {
  constructor({ token = process.env.DUFFEL_ACCESS_TOKEN, fetchImpl = globalThis.fetch } = {}) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async searchFlights({ origin, destination, departureDate, returnDate, passengers = 1 }) {
    const slices = [{ origin, destination, departure_date: departureDate }];
    if (returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    }
    return this.request("/air/offer_requests?return_offers=true&supplier_timeout=10000", {
      slices,
      passengers: Array.from({ length: passengers }, () => ({ type: "adult" })),
      cabin_class: "economy",
    });
  }

  async suggestPlace(query) {
    if (typeof query !== "string" || query.trim() === "") {
      const error = new Error("A city or airport name is required");
      error.code = "DUFFEL_PLACE_QUERY_REQUIRED";
      throw error;
    }
    const payload = await this.get("/places/suggestions", { query: query.trim() });
    const wanted = query.trim().toLowerCase();
    const place = chooseAirport(payload, wanted);
    if (!place) {
      const error = new Error(`Duffel found no flight origin/destination for ${query}`);
      error.code = "DUFFEL_PLACE_NOT_FOUND";
      throw error;
    }
    return { code: place.iata_code, name: place.name, type: place.type };
  }

  async suggestNearby({ latitude, longitude, radius = 150_000 }) {
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      const error = new Error("Valid coordinates are required for nearby airport search");
      error.code = "DUFFEL_PLACE_COORDINATES_REQUIRED";
      throw error;
    }
    const payload = await this.get("/places/suggestions", {
      lat: Number(latitude), lng: Number(longitude), rad: Math.min(Math.max(Number(radius), 1_000), 500_000),
    });
    const place = chooseAirport(payload);
    if (!place) {
      const error = new Error("Duffel found no airport near the requested place");
      error.code = "DUFFEL_PLACE_NOT_FOUND";
      throw error;
    }
    return { code: place.iata_code, name: place.name, type: place.type };
  }

  async searchStays({ latitude, longitude, checkInDate, checkOutDate, guests = 1, rooms = 1 }) {
    return this.request("/stays/search", {
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      rooms,
      guests: Array.from({ length: guests }, () => ({ type: "adult" })),
      location: { radius: 10, geographic_coordinates: { latitude, longitude } },
    });
  }

  async request(path, data) {
    if (!this.token) {
      const error = new Error("DUFFEL_ACCESS_TOKEN is not configured");
      error.code = "DUFFEL_NOT_CONFIGURED";
      throw error;
    }
    const response = await this.fetchImpl(`https://api.duffel.com${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
      },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(15_000),
    });
    return parseResponse(response);
  }

  async get(path, params = {}) {
    if (!this.token) {
      const error = new Error("DUFFEL_ACCESS_TOKEN is not configured");
      error.code = "DUFFEL_NOT_CONFIGURED";
      throw error;
    }
    const url = new URL(`https://api.duffel.com${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "Duffel-Version": "v2",
      },
      signal: AbortSignal.timeout(15_000),
    });
    return parseResponse(response);
  }
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Never place a provider's raw body in an exception or log. It may contain
    // internal diagnostics and, more importantly, it is not a stable contract.
  }
  if (!response.ok) {
    const error = new Error(payload?.errors?.[0]?.message ?? `Duffel failed with ${response.status}`);
    error.code = payload?.errors?.[0]?.code
      ?? (response.status === 403 ? "DUFFEL_ACCESS_REQUIRED" : `DUFFEL_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (!payload || !("data" in payload)) {
    const error = new Error("Duffel returned an invalid response");
    error.code = "DUFFEL_INVALID_RESPONSE";
    throw error;
  }
  return payload.data;
}

function chooseAirport(payload, wanted = null) {
  const ranked = [...(Array.isArray(payload) ? payload : [])]
    .sort((left, right) => wanted ? placeScore(right, wanted) - placeScore(left, wanted) : 0);
  for (const row of ranked) {
    if (/^[A-Z]{3}$/.test(row?.iata_code ?? "")) return row;
    const airport = row?.airports?.find((item) => /^[A-Z]{3}$/.test(item?.iata_code ?? ""));
    if (airport) return { ...airport, type: "airport" };
  }
  return null;
}

function placeScore(place, wanted) {
  const values = [place?.name, place?.city_name].map((value) => String(value ?? "").toLowerCase());
  return (values.includes(wanted) ? 10 : 0) + (place?.type === "city" ? 3 : 0);
}
