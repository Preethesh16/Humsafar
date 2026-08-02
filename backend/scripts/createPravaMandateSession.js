import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PravaClient } from "../src/integrations/pravaClient.js";
import { MandateService } from "../src/services/mandateService.js";

const SANDBOX_ORIGIN = "https://sandbox.api.prava.space";

export function mandateSessionConfig(env = process.env) {
  const config = {
    apiKey: env.PRAVA_SECRET_KEY,
    baseUrl: env.PRAVA_BASE_URL ?? SANDBOX_ORIGIN,
    customerId: env.PRAVA_TEST_CUSTOMER_ID,
    customerEmail: env.PRAVA_TEST_CUSTOMER_EMAIL,
    amountCap: Number(env.PRAVA_TEST_MANDATE_AMOUNT_CAP ?? "100"),
    merchant: {
      name: env.PRAVA_TEST_MERCHANT_NAME ?? "Duffel",
      url: env.PRAVA_TEST_MERCHANT_URL ?? "https://duffel.com",
      countryCode: env.PRAVA_TEST_MERCHANT_COUNTRY ?? "GB",
    },
    product: {
      description: env.PRAVA_TEST_PRODUCT_DESCRIPTION ?? "Humsafar cap enforcement proof",
      unitPrice: Number(env.PRAVA_TEST_MANDATE_AMOUNT_CAP ?? "100"),
      quantity: 1,
    },
  };
  validateConfig(config);
  return config;
}

export async function createPravaMandateSession({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = mandateSessionConfig(env);
  const pravaClient = new PravaClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl,
  });
  const service = new MandateService({ pravaClient, mandateMerchants: new Map() });
  const result = await service.createSetupSession({
    userId: config.customerId,
    userEmail: config.customerEmail,
    amountCap: config.amountCap,
    currency: "INR",
    merchant: config.merchant,
    product: config.product,
  });

  return {
    environment: "sandbox",
    action: "mandate_session_created",
    customerId: config.customerId,
    merchant: config.merchant.name,
    amountCap: config.amountCap,
    currency: "INR",
    authorizeOnly: true,
    sessionId: result.data.session_id ?? result.data.sessionId,
    iframeUrl: result.data.iframe_url,
    expiresAt: result.data.expires_at ?? result.data.expiresAt,
  };
}

function validateConfig(config) {
  if (typeof config.apiKey !== "string" || !config.apiKey.startsWith("sk_test_")) {
    throw new Error("PRAVA_SECRET_KEY must be a sandbox secret key (sk_test_...)");
  }
  if (new URL(config.baseUrl).origin !== SANDBOX_ORIGIN) {
    throw new Error(`Refusing non-sandbox Prava URL; expected ${SANDBOX_ORIGIN}`);
  }
  requireText(config.customerId, "PRAVA_TEST_CUSTOMER_ID");
  requireText(config.customerEmail, "PRAVA_TEST_CUSTOMER_EMAIL");
  if (!/^\S+@\S+\.\S+$/.test(config.customerEmail)) {
    throw new Error("PRAVA_TEST_CUSTOMER_EMAIL must be a valid email address");
  }
  if (!Number.isFinite(config.amountCap) || config.amountCap <= 0) {
    throw new Error("PRAVA_TEST_MANDATE_AMOUNT_CAP must be a positive number");
  }
  requireText(config.merchant.name, "PRAVA_TEST_MERCHANT_NAME");
  if (new URL(config.merchant.url).protocol !== "https:") {
    throw new Error("PRAVA_TEST_MERCHANT_URL must use HTTPS");
  }
  if (!/^[A-Z]{2}$/.test(config.merchant.countryCode)) {
    throw new Error("PRAVA_TEST_MERCHANT_COUNTRY must be a two-letter uppercase country code");
  }
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
}

async function main() {
  try {
    console.log(JSON.stringify(await createPravaMandateSession()));
  } catch (error) {
    console.error(JSON.stringify({
      environment: "sandbox",
      action: "mandate_session_failed",
      code: error.code ?? "PRAVA_MANDATE_SESSION_FAILED",
      responseId: error.responseId,
      message: error.message,
    }));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  await main();
}
