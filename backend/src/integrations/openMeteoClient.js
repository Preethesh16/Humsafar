const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** Keyless Open-Meteo forecast client. It never manufactures distant forecasts. */
export class OpenMeteoClient {
  constructor({ baseUrl = process.env.OPEN_METEO_BASE_URL ?? FORECAST_URL, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async daily({ latitude, longitude, startDate, endDate }) {
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      throw weatherError("Valid coordinates are required", "INVALID_WEATHER_COORDINATES");
    }
    const range = forecastRange(startDate, endDate);
    if (!range.available) return { source: "open-meteo", available: false, reason: range.reason, days: [] };

    const url = new URL(this.baseUrl);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("start_date", range.startDate);
    url.searchParams.set("end_date", range.endDate);

    let response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    } catch (cause) {
      throw weatherError("Open-Meteo could not be reached", "OPEN_METEO_NETWORK_ERROR", cause);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw weatherError(payload?.reason ?? `Open-Meteo failed with ${response.status}`, "OPEN_METEO_REQUEST_FAILED");
    const daily = payload?.daily ?? {};
    return {
      source: "open-meteo",
      available: true,
      timezone: payload?.timezone ?? null,
      days: (daily.time ?? []).map((date, index) => ({
        date,
        weatherCode: daily.weather_code?.[index] ?? null,
        condition: weatherLabel(daily.weather_code?.[index]),
        temperatureMaxC: daily.temperature_2m_max?.[index] ?? null,
        temperatureMinC: daily.temperature_2m_min?.[index] ?? null,
        precipitationProbability: daily.precipitation_probability_max?.[index] ?? null,
        sunrise: timeOnly(daily.sunrise?.[index]),
        sunset: timeOnly(daily.sunset?.[index]),
      })),
    };
  }
}

export function forecastRange(startDate, endDate, now = new Date()) {
  if (!startDate || !endDate) {
    return { available: false, reason: "Choose exact dates to attach a weather forecast." };
  }
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return { available: false, reason: "Trip dates are invalid." };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lastForecastDay = new Date(today);
  lastForecastDay.setUTCDate(lastForecastDay.getUTCDate() + 15);
  if (start < today || end > lastForecastDay) {
    return { available: false, reason: "Open-Meteo forecasts only cover the next 16 days; refresh closer to departure." };
  }
  return { available: true, startDate, endDate };
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timeOnly(value) {
  return typeof value === "string" && value.includes("T") ? value.split("T")[1] : null;
}

function weatherLabel(code) {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Forecast available";
}

function weatherError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}
