import { createApp } from "./app.js";
import { EventHub } from "./events/eventHub.js";
import { DuffelClient } from "./integrations/duffelClient.js";
import { GoogleMapsClient } from "./integrations/googleMapsClient.js";
import { GeoapifyClient } from "./integrations/geoapifyClient.js";
import { NominatimClient } from "./integrations/nominatimClient.js";
import { OpenMeteoClient } from "./integrations/openMeteoClient.js";
import { PravaClient } from "./integrations/pravaClient.js";
import { DiscoveryService } from "./services/discoveryService.js";
import { ApprovalService } from "./services/approvalService.js";
import { ChoiceService } from "./services/choiceService.js";
import { MandateService } from "./services/mandateService.js";
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

const mandateMerchants = parseMandateMerchants(
  process.env.PRAVA_MANDATE_MERCHANTS_JSON ?? "{}",
);
const scopedCardService = new ScopedCardService({
  pravaClient: new PravaClient(),
  mandateMerchants,
});
const pravaClient = scopedCardService.pravaClient;
const geocoder = process.env.GOOGLE_MAPS_API_KEY
  ? new GoogleMapsClient()
  : new NominatimClient();
const app = createApp({
  eventHub: new EventHub(),
  scopedCardService,
  discoveryService: new DiscoveryService({
    duffelClient: new DuffelClient(),
    googleMapsClient: geocoder,
  }),
  itineraryService: new ItineraryService({
    geoapifyClient: new GeoapifyClient(),
    weatherClient: new OpenMeteoClient(),
  }),
  mandateService: new MandateService({ pravaClient, mandateMerchants }),
  approvalService: new ApprovalService(),
  choiceService: new ChoiceService(),
  trustService: new TrustService(),
  runService: new RunService(),
  internalApiToken,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
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
