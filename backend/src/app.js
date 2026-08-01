import express from "express";

import { validateEvent } from "./events/eventSchema.js";

export function createApp({ eventHub, scopedCardService, discoveryService, mandateService, trustService, internalApiToken, publicBaseUrl = "http://127.0.0.1:3000" } = {}) {
  if (!eventHub || typeof eventHub.publish !== "function") {
    throw new TypeError("An event hub is required");
  }
  if (!scopedCardService || typeof scopedCardService.mintScopedCard !== "function") {
    throw new TypeError("A scoped card service is required");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/.well-known/agentfacts.json", (_request, response) => {
    response.json({
      name: "Humsafar",
      description: "Multi-agent shared-budget travel commerce orchestrator",
      version: "0.1.0",
      url: publicBaseUrl,
      capabilities: ["travel.discovery", "budget.negotiation", "scoped-payment"],
      protocols: { a2a: `${publicBaseUrl}/a2a/ping`, sse: `${publicBaseUrl}/api/events` },
    });
  });

  app.post("/a2a/ping", (_request, response) => {
    response.json({ status: "ok", agent: "humsafar", timestamp: new Date().toISOString() });
  });

  app.get("/api/events", (request, response) => {
    eventHub.connect(request, response);
  });

  app.post("/api/events", authorize(internalApiToken), (request, response) => {
    const error = validateEvent(request.body);
    if (error) {
      return response.status(400).json({ error: { code: "INVALID_EVENT", message: error } });
    }

    const id = eventHub.publish(request.body);
    return response.status(202).json({ id });
  });

  app.post("/api/scoped-cards", authorize(internalApiToken), async (request, response) => {
    const { mandateId, merchant, amountCap } = request.body ?? {};
    const result = await scopedCardService.mintScopedCard(mandateId, merchant, amountCap);
    return response.status(result.status === "issued" ? 201 : 422).json(result);
  });

  app.post("/api/discovery/:category", authorize(internalApiToken), async (request, response) => {
    if (!discoveryService) return response.status(503).json({ error: { code: "DISCOVERY_UNAVAILABLE" } });
    try {
      return response.json(await discoveryService.search(request.params.category, request.body));
    } catch (error) {
      return response.status(400).json({ error: { code: "INVALID_DISCOVERY", message: error.message } });
    }
  });

  app.post("/api/trust/check", authorize(internalApiToken), async (request, response) => {
    if (!trustService) return response.status(503).json({ error: { code: "TRUST_UNAVAILABLE" } });
    try {
      return response.json(await trustService.check(request.body));
    } catch (error) {
      return response.status(400).json({ error: { code: "INVALID_TRUST_REQUEST", message: error.message } });
    }
  });

  app.post("/api/prava/mandate-sessions", authorize(internalApiToken), async (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    return response.status(201).json(await mandateService.createSetupSession(request.body));
  });

  app.post("/api/prava/mandates/sync", authorize(internalApiToken), async (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    return response.json(await mandateService.syncCustomerMandates(request.body.customerId));
  });

  app.post("/api/prava/mandates/:mandateId/charges/:transactionId/report", authorize(internalApiToken), async (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    return response.json(await mandateService.reportCharge({
      mandateId: request.params.mandateId,
      transactionId: request.params.transactionId,
      ...request.body,
    }));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return response.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON" },
      });
    }

    return response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  });

  return app;
}

function authorize(expectedToken) {
  return (request, response, next) => {
    if (!expectedToken) return next();

    const supplied = request.get("authorization");
    if (supplied !== `Bearer ${expectedToken}`) {
      return response.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Valid internal API token required" },
      });
    }

    return next();
  };
}
