export class DuffelClient {
  constructor({ token = process.env.DUFFEL_ACCESS_TOKEN, fetchImpl = globalThis.fetch } = {}) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async searchFlights({ origin, destination, departureDate, passengers = 1 }) {
    return this.request("/air/offer_requests?return_offers=true&supplier_timeout=10000", {
      slices: [{ origin, destination, departure_date: departureDate }],
      passengers: Array.from({ length: passengers }, () => ({ type: "adult" })),
      cabin_class: "economy",
    });
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
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload?.errors?.[0]?.message ?? `Duffel failed with ${response.status}`);
      error.code = payload?.errors?.[0]?.code ?? "DUFFEL_REQUEST_FAILED";
      throw error;
    }
    return payload.data;
  }
}
