import { createApp } from "./app.js";
import { EventHub } from "./events/eventHub.js";
import { PravaClient } from "./integrations/pravaClient.js";
import { ScopedCardService } from "./services/scopedCardService.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = parsePort(process.env.PORT ?? "3000");
const internalApiToken = process.env.INTERNAL_API_TOKEN;

if (!isLoopback(host) && !internalApiToken) {
  throw new Error("INTERNAL_API_TOKEN is required when binding to a non-loopback host");
}

const mandateMerchants = parseMandateMerchants(
  process.env.PRAVA_MANDATE_MERCHANTS_JSON ?? "{}",
);
const scopedCardService = new ScopedCardService({
  pravaClient: new PravaClient(),
  mandateMerchants,
});
const app = createApp({
  eventHub: new EventHub(),
  scopedCardService,
  internalApiToken,
});

app.listen(port, host, () => {
  console.info({ service: "humsafar-backend", host, port });
});

function parsePort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return parsed;
}

function parseMandateMerchants(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PRAVA_MANDATE_MERCHANTS_JSON must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PRAVA_MANDATE_MERCHANTS_JSON must be a JSON object");
  }

  return new Map(Object.entries(parsed));
}

function isLoopback(value) {
  return new Set(["127.0.0.1", "::1", "localhost"]).has(value);
}
