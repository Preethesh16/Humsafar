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
    const payload = await this.request(`/v1/mandates/${encodeURIComponent(mandateId)}/charge`, {
      method: "POST",
      body: { amount, reference },
    });

    validateChargeResponse(payload.data, payload.responseId);
    return { data: payload.data, source: "live" };
  }

  async createMandateSession(input) {
    const payload = await this.request("/v1/sessions", {
      method: "POST",
      body: input,
    });
    const session = normalizeSessionResponse(payload.data);
    if (!session) {
      throw new PravaApiError("Prava did not return a mandate approval session", {
        code: "PRAVA_INVALID_MANDATE_SESSION",
        responseId: payload.responseId,
      });
    }
    return { data: session, source: "live" };
  }

  /**
   * Whether a hosted authorisation session has been completed yet.
   *
   * Prava exposes no redirect-back for mandate setup, so the page cannot be
   * told "the user finished". Polling this is how our UI notices and moves on,
   * and it works no matter which surface the user completed it on — the frame,
   * a new tab, or their phone.
   */
  async sessionStatus(sessionId) {
    const payload = await this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/payment-result`,
    );
    const data = payload.data ?? {};
    return {
      data: { sessionId, status: data.status ?? "pending", orderId: data.order_id ?? null },
      source: "live",
    };
  }

  async listMandates({ customerId, standingOnly = true }) {
    const query = new URLSearchParams({
      customer_id: customerId,
      standing_only: String(standingOnly),
    });
    const payload = await this.request(`/v1/mandates?${query}`);
    if (!Array.isArray(payload.data?.mandates)) {
      throw new PravaApiError("Prava returned an invalid mandate list", {
        code: "PRAVA_INVALID_RESPONSE",
        responseId: payload.responseId,
      });
    }
    return { data: payload.data, source: "live" };
  }

  async reportMandateCharge({ mandateId, transactionId, ...body }) {
    const payload = await this.request(
      `/v1/mandates/${encodeURIComponent(mandateId)}/charges/${encodeURIComponent(transactionId)}/report`,
      { method: "POST", body },
    );
    return { data: payload.data, source: "live" };
  }

  async request(path, { method = "GET", body } = {}) {
    if (!this.apiKey) {
      throw new PravaApiError("PRAVA_SECRET_KEY is not configured", {
        code: "PRAVA_NOT_CONFIGURED",
      });
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

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

    return { data: payload, responseId };
  }
}

function normalizeSessionResponse(payload) {
  const candidate = payload?.iframe_url ? payload : payload?.data;
  if (
    typeof candidate?.session_id !== "string" ||
    typeof candidate?.iframe_url !== "string"
  ) {
    return undefined;
  }
  return candidate;
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
    typeof credentials?.token !== "string" ||
    typeof credentials?.dynamicCvv !== "string" ||
    typeof credentials?.expiryMonth !== "string" ||
    typeof credentials?.expiryYear !== "string"
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
