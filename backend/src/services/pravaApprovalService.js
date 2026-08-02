const SANDBOX_COLLECT_HOST = "sandbox.collect.prava.space";
const SESSION_FALLBACK_MS = 15 * 60 * 1000;

/** Creates one phone-completable mandate ceremony without exposing server keys. */
export class PravaApprovalService {
  constructor({ mandateService, enabled = false, config = {}, now = () => Date.now() } = {}) {
    if (!mandateService || typeof mandateService.createSetupSession !== "function") {
      throw new TypeError("A mandate service with createSetupSession() is required");
    }
    this.mandateService = mandateService;
    this.enabled = enabled;
    // A keyless/default install must still boot. Configuration becomes
    // mandatory only when this external-state feature is explicitly enabled.
    this.config = enabled ? validateConfig(config) : config;
    this.now = now;
    this.current = null;
  }

  async create() {
    if (!this.enabled) {
      throw approvalError(
        "PRAVA_PHONE_APPROVAL_DISABLED",
        "Phone approval is disabled on this server",
      );
    }

    // Double-clicks and page retries reuse the same live ceremony instead of
    // consuming another scarce sandbox order/session.
    if (this.current && Date.parse(this.current.expiresAt) > this.now() + 30_000) {
      return { ...this.current, reused: true };
    }

    const result = await this.mandateService.createSetupSession({
      userId: this.config.customerId,
      userEmail: this.config.customerEmail,
      amountCap: this.config.amountCap,
      currency: "INR",
      merchant: this.config.merchant,
      product: this.config.product,
    });
    const iframeUrl = result?.data?.iframe_url ?? result?.data?.iframeUrl;
    assertHostedUrl(iframeUrl);
    const suppliedExpiry = result?.data?.expires_at ?? result?.data?.expiresAt;
    const expiresAt = Number.isFinite(Date.parse(suppliedExpiry))
      ? new Date(suppliedExpiry).toISOString()
      : new Date(this.now() + SESSION_FALLBACK_MS).toISOString();

    this.current = {
      environment: "sandbox",
      merchant: this.config.merchant.name,
      amountCap: this.config.amountCap,
      currency: "INR",
      iframeUrl,
      expiresAt,
      authorizeOnly: true,
    };
    return { ...this.current, reused: false };
  }
}

function validateConfig(config) {
  const amountCap = Number(config.amountCap);
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
  if (!Number.isFinite(amountCap) || amountCap <= 0) throw new TypeError("amountCap must be positive");
  if (new URL(config.merchant.url).protocol !== "https:") throw new TypeError("merchant.url must use HTTPS");
  if (!/^[A-Z]{2}$/.test(config.merchant.countryCode)) throw new TypeError("merchant.countryCode is invalid");
  return {
    ...config,
    amountCap,
    product: { ...config.product, unitPrice: amountCap, quantity: 1 },
  };
}

function assertHostedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw approvalError("PRAVA_INVALID_APPROVAL_URL", "Prava returned no usable hosted approval URL");
  }
  if (url.protocol !== "https:" || url.hostname !== SANDBOX_COLLECT_HOST) {
    throw approvalError("PRAVA_INVALID_APPROVAL_URL", "Prava returned an unexpected hosted approval origin");
  }
}

function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
