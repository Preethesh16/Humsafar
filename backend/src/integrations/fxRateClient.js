const DEFAULT_BASE_URL = "https://api.frankfurter.dev";

/** Keyless daily reference-rate conversion for provider search amounts. */
export class FxRateClient {
  constructor({ baseUrl = process.env.FX_BASE_URL ?? DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.cache = new Map();
  }

  async convert(amount, base, quote = "INR") {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric < 0) throw fxError("A valid amount is required", "INVALID_FX_AMOUNT");
    const from = currency(base);
    const to = currency(quote);
    if (from === to) return { amount: numeric, rate: 1, date: null, base: from, quote: to };
    const row = await this.rate(from, to);
    // Round upward to paise so a display conversion never understates the
    // provider amount used by the budget engine.
    return { ...row, amount: Math.ceil(numeric * row.rate * 100) / 100 };
  }

  async rate(base, quote) {
    const key = `${currency(base)}:${currency(quote)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v2/rate/${key.replace(":", "/")}`, {
        signal: AbortSignal.timeout(8_000),
      });
    } catch (cause) {
      throw fxError("Reference exchange rate could not be reached", "FX_NETWORK_ERROR", cause);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Number.isFinite(Number(payload?.rate))) {
      throw fxError("Reference exchange rate is unavailable", "FX_RATE_UNAVAILABLE");
    }
    const row = {
      base: currency(payload.base ?? base), quote: currency(payload.quote ?? quote),
      rate: Number(payload.rate), date: payload.date ?? null, source: "frankfurter-reference-rate",
    };
    this.cache.set(key, row);
    return row;
  }
}

function currency(value) {
  const code = String(value ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw fxError("A valid ISO currency is required", "INVALID_FX_CURRENCY");
  return code;
}

function fxError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}
