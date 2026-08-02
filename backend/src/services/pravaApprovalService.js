const SANDBOX_COLLECT_ORIGIN = "https://sandbox.collect.prava.space";
const SESSION_FALLBACK_MS = 15 * 60 * 1000;

/** Creates and observes one phone-completable checkout without exposing credentials. */
export class PravaApprovalService {
  constructor({ mandateService, resolvePlan, enabled = false, config = {}, now = () => Date.now() } = {}) {
    if (
      !mandateService
      || typeof mandateService.createCheckoutSession !== "function"
      || typeof mandateService.getCheckoutStatus !== "function"
    ) {
      throw new TypeError("A mandate service with checkout session support is required");
    }
    if (typeof resolvePlan !== "function") throw new TypeError("A plan resolver is required");
    this.mandateService = mandateService;
    this.resolvePlan = resolvePlan;
    this.enabled = enabled;
    // A keyless/default install must still boot. Configuration becomes
    // mandatory only when this external-state feature is explicitly enabled.
    this.config = enabled ? validateConfig(config) : config;
    this.now = now;
    this.current = null;
  }

  async create({ runId } = {}) {
    if (!this.enabled) {
      throw approvalError(
        "PRAVA_PHONE_APPROVAL_DISABLED",
        "Phone approval is disabled on this server",
      );
    }

    const plan = this.resolvePlan(runId);
    const amountCap = validatePlan(plan, runId);

    // Double-clicks and page retries reuse the same live ceremony instead of
    // consuming another scarce sandbox order/session.
    if (
      this.current
      && this.current.runId === runId
      && this.current.amountCap === amountCap
      && Date.parse(this.current.expiresAt) > this.now() + 30_000
    ) {
      return publicApproval(this.current, { reused: true });
    }

    const result = await this.mandateService.createCheckoutSession({
      userId: this.config.customerId,
      userEmail: this.config.customerEmail,
      amountCap,
      currency: "INR",
      merchant: this.config.merchant,
      product: { ...this.config.product, unitPrice: amountCap, quantity: 1 },
    });
    const iframeUrl = result?.data?.iframe_url ?? result?.data?.iframeUrl;
    const sessionId = result?.data?.session_id ?? result?.data?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw approvalError("PRAVA_INVALID_APPROVAL_SESSION", "Prava returned no usable session reference");
    }
    assertHostedUrl(iframeUrl);
    const suppliedExpiry = result?.data?.expires_at ?? result?.data?.expiresAt;
    const expiresAt = Number.isFinite(Date.parse(suppliedExpiry))
      ? new Date(suppliedExpiry).toISOString()
      : new Date(this.now() + SESSION_FALLBACK_MS).toISOString();

    this.current = {
      runId,
      sessionId,
      environment: "sandbox",
      merchant: this.config.merchant.name,
      amountCap,
      currency: "INR",
      iframeUrl,
      expiresAt,
      stage: "waiting_for_cardholder",
    };
    return publicApproval(this.current, { reused: false });
  }

  async status({ runId } = {}) {
    if (!this.enabled) {
      throw approvalError("PRAVA_PHONE_APPROVAL_DISABLED", "Phone approval is disabled on this server");
    }
    if (!this.current || this.current.runId !== runId) {
      throw approvalError("PRAVA_APPROVAL_NOT_FOUND", "No active Prava checkout exists for this trip");
    }

    const result = await this.mandateService.getCheckoutStatus(this.current.sessionId);
    const stage = stageFor(result?.data?.status);
    this.current.stage = stage;
    return {
      runId: this.current.runId,
      environment: "sandbox",
      merchant: this.current.merchant,
      amountCap: this.current.amountCap,
      currency: this.current.currency,
      stage,
      terminal: new Set(["completed", "failed", "expired"]).has(stage),
      paid: stage === "completed",
      checkedAt: new Date(this.now()).toISOString(),
    };
  }
}

function validateConfig(config) {
  const required = [
    [config.customerId, "customerId"],
    [config.customerEmail, "customerEmail"],
    [config.merchant?.name, "merchant.name"],
    [config.merchant?.url, "merchant.url"],
    [config.merchant?.countryCode, "merchant.countryCode"],
    [config.product?.description, "product.description"],
  ];
  for (const [value, label] of required) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  }
  if (!/^\S+@\S+\.\S+$/.test(config.customerEmail)) throw new TypeError("customerEmail is invalid");
  if (new URL(config.merchant.url).protocol !== "https:") throw new TypeError("merchant.url must use HTTPS");
  if (!/^[A-Z]{2}$/.test(config.merchant.countryCode)) throw new TypeError("merchant.countryCode is invalid");
  return {
    ...config,
    product: { ...config.product },
  };
}

function validatePlan(plan, runId) {
  if (typeof runId !== "string" || !runId.trim() || !plan) {
    throw approvalError("PRAVA_PLAN_NOT_FOUND", "The completed trip plan could not be verified");
  }
  const amount = Number(plan.totalSpent);
  const budget = Number(plan.budget);
  const paise = Math.round(amount * 100);
  if (
    !Number.isFinite(amount)
    || !Number.isFinite(budget)
    || amount <= 0
    || amount > budget
    || Math.abs(amount - paise / 100) > Number.EPSILON
  ) {
    throw approvalError("PRAVA_INVALID_PLAN_TOTAL", "The trip total is not payable");
  }
  return paise / 100;
}

function publicApproval(current, { reused }) {
  return {
    runId: current.runId,
    environment: current.environment,
    merchant: current.merchant,
    amountCap: current.amountCap,
    currency: current.currency,
    iframeUrl: current.iframeUrl,
    expiresAt: current.expiresAt,
    stage: current.stage,
    reused,
  };
}

function stageFor(status) {
  switch (String(status ?? "").toLowerCase()) {
    case "pending": return "waiting_for_cardholder";
    case "awaiting_result": return "checkout_ready";
    case "completed": return "completed";
    case "failed": return "failed";
    case "expired":
    case "cancelled": return "expired";
    default: return "checking";
  }
}

function assertHostedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw approvalError("PRAVA_INVALID_APPROVAL_URL", "Prava returned no usable hosted approval URL");
  }
  if (url.origin !== SANDBOX_COLLECT_ORIGIN) {
    throw approvalError("PRAVA_INVALID_APPROVAL_URL", "Prava returned an unexpected hosted approval origin");
  }
}

function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
