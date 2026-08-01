import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PravaClient } from "../src/integrations/pravaClient.js";

const SANDBOX_ORIGIN = "https://sandbox.api.prava.space";

export function validateSandboxConfig({ apiKey, baseUrl, customerId }) {
  if (typeof apiKey !== "string" || !apiKey.startsWith("sk_test_")) {
    throw new Error("PRAVA_SECRET_KEY must be a Prava sandbox key (sk_test_...)");
  }

  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    throw new Error("PRAVA_BASE_URL must be a valid URL");
  }
  if (origin !== SANDBOX_ORIGIN) {
    throw new Error(`Refusing non-sandbox Prava URL; expected ${SANDBOX_ORIGIN}`);
  }

  if (typeof customerId !== "string" || customerId.trim() === "") {
    throw new Error("PRAVA_TEST_CUSTOMER_ID is required");
  }
}

export async function verifyPravaAccess({
  apiKey = process.env.PRAVA_SECRET_KEY,
  baseUrl = process.env.PRAVA_BASE_URL ?? SANDBOX_ORIGIN,
  customerId = process.env.PRAVA_TEST_CUSTOMER_ID,
  fetchImpl = globalThis.fetch,
} = {}) {
  validateSandboxConfig({ apiKey, baseUrl, customerId });

  const client = new PravaClient({ apiKey, baseUrl, fetchImpl });
  const result = await client.listMandates({
    customerId: customerId.trim(),
    standingOnly: true,
  });

  return {
    environment: "sandbox",
    authentication: "ok",
    mandateCount: result.data.mandates.length,
  };
}

async function main() {
  try {
    const result = await verifyPravaAccess();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({
      environment: "sandbox",
      authentication: "failed",
      code: error.code ?? "PRAVA_ACCESS_CHECK_FAILED",
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
