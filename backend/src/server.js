import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { EventHub } from "./events/eventHub.js";
import { DuffelClient } from "./integrations/duffelClient.js";
import { FxRateClient } from "./integrations/fxRateClient.js";
import { GoogleMapsClient } from "./integrations/googleMapsClient.js";
import { GeoapifyClient } from "./integrations/geoapifyClient.js";
import { NominatimClient } from "./integrations/nominatimClient.js";
import { OpenMeteoClient } from "./integrations/openMeteoClient.js";
import { PravaClient } from "./integrations/pravaClient.js";
import { DiscoveryService } from "./services/discoveryService.js";
import { ApprovalService } from "./services/approvalService.js";
import { ChoiceService } from "./services/choiceService.js";
import { MandateService } from "./services/mandateService.js";
import { PravaApprovalService } from "./services/pravaApprovalService.js";
import { RunService } from "./services/runService.js";
import { ScopedCardService } from "./services/scopedCardService.js";
import { TrustService } from "./services/trustService.js";
import { ItineraryService } from "./services/itineraryService.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = parsePort(process.env.PORT ?? "3000");
const internalApiToken = process.env.INTERNAL_API_TOKEN;

if (!isLoopback(host) && !internalApiToken) {
  throw new Error("INTERNAL_API_TOKEN is required when binding to a non-loopback host");
}

// Signs browser session cookies. Generated per boot when unset, which is fine
// for a single-instance demo — the only cost is that a restart logs everyone
// out, and the alternative (a checked-in default) would let anyone mint a valid
// session against a deployed instance. Set SESSION_SECRET to survive restarts
// or to run more than one instance behind a load balancer.
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Where `npm --prefix frontend run build` puts the app. Serving it from this
// process is what makes the deployed frontend same-origin with the API, which
// is what lets a cookie authenticate it at all.
const frontendDist =
  process.env.FRONTEND_DIST ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");

const eventHub = new EventHub();
const mandateMerchants = parseMandateMerchants(
  process.env.PRAVA_MANDATE_MERCHANTS_JSON ?? "{}",
);
const scopedCardService = new ScopedCardService({
  pravaClient: new PravaClient(),
  mandateMerchants,
});
const pravaClient = scopedCardService.pravaClient;
const mandateService = new MandateService({ pravaClient, mandateMerchants });
const pravaApprovalService = new PravaApprovalService({
  mandateService,
  resolvePlan: (runId) => [...eventHub.snapshot()]
    .reverse()
    .find(({ event }) => event.type === "final_receipt" && event.runId === runId)
    ?.event,
  enabled: process.env.HUMSAFAR_ENABLE_PRAVA_PHONE_APPROVAL === "true",
  config: {
    customerId: process.env.PRAVA_TEST_CUSTOMER_ID,
    customerEmail: process.env.PRAVA_TEST_CUSTOMER_EMAIL,
    merchant: {
      name: process.env.PRAVA_PHONE_MERCHANT_NAME ?? "Humsafar",
      url: process.env.PRAVA_PHONE_MERCHANT_URL ?? "https://github.com/Preethesh16/Humsafar",
      countryCode: process.env.PRAVA_PHONE_MERCHANT_COUNTRY ?? "IN",
    },
    product: {
      description: process.env.PRAVA_PHONE_PRODUCT_DESCRIPTION ?? "Humsafar sandbox trip plan",
    },
  },
});
const geocoder = process.env.GOOGLE_MAPS_API_KEY
  ? new GoogleMapsClient()
  : new NominatimClient();
const app = createApp({
  eventHub,
  scopedCardService,
  discoveryService: new DiscoveryService({
    duffelClient: new DuffelClient(),
    googleMapsClient: geocoder,
    fxRateClient: new FxRateClient(),
  }),
  itineraryService: new ItineraryService({
    geoapifyClient: new GeoapifyClient(),
    weatherClient: new OpenMeteoClient(),
  }),
  mandateService,
  pravaApprovalService,
  approvalService: new ApprovalService(),
  choiceService: new ChoiceService(),
  trustService: new TrustService(),
  // The agent process reaches the API over loopback inside the container, so
  // this is the bound port, never PUBLIC_BASE_URL — routing agent traffic out
  // through the public hostname and back would be slower and would break
  // whenever the host terminates TLS in front of us.
  runService: new RunService({ backendUrl: `http://127.0.0.1:${port}` }),
  internalApiToken,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  frontendDist,
  sessionSecret,
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
