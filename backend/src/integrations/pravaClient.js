const DEFAULT_BASE_URL = "https://sandbox.api.prava.space";
const DEFAULT_TIMEOUT_MS = 10_000;

export class PravaApiError extends Error {
  constructor(message, { status, code, responseId } = {}) {
    super(message);
    this.name = "PravaApiError";
    this.status = status;
    this.code = code;
    this.responseId = responseId;
  }
}

export class PravaClient {
  constructor({
    apiKey = process.env.PRAVA_SECRET_KEY,
    baseUrl = process.env.PRAVA_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs = Number(process.env.PRAVA_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("A fetch implementation is required");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = fetchImpl;
  }

  async chargeMandate({ mandateId, amount, reference }) {
    if (!this.apiKey) {
      throw new PravaApiError("PRAVA_SECRET_KEY is not configured", {
        code: "PRAVA_NOT_CONFIGURED",
      });
    }

    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/mandates/${encodeURIComponent(mandateId)}/charge`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount, reference }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );

    const responseId = response.headers.get("x-response-id") ?? undefined;
    const payload = await parseJson(response, responseId);

    if (!response.ok) {
      throw new PravaApiError(
        payload?.error?.message ?? `Prava request failed with status ${response.status}`,
        {
          status: response.status,
          code: payload?.error?.code,
          responseId,
        },
      );
    }

    validateChargeResponse(payload, responseId);

    return { data: payload, source: "live" };
  }
}

async function parseJson(response, responseId) {
  try {
    return await response.json();
  } catch {
    throw new PravaApiError("Prava returned a non-JSON response", {
      status: response.status,
      code: "PRAVA_INVALID_RESPONSE",
      responseId,
    });
  }
}

function validateChargeResponse(payload, responseId) {
  const credentials = payload?.credentials;
  if (
    payload?.status !== "awaiting_result" ||
    payload?.fetchStatus !== "SUCCESS" ||
    typeof payload?.instructionId !== "string" ||
    typeof credentials?.token !== "string"
  ) {
    throw new PravaApiError(
      payload?.errorMessage ?? "Prava did not return usable card credentials",
      {
        code: payload?.errorCode ?? "PRAVA_CREDENTIALS_UNAVAILABLE",
        responseId,
      },
    );
  }
}
