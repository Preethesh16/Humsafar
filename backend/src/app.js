import express from "express";

import { validateEvent } from "./events/eventSchema.js";

export function createApp({ eventHub, scopedCardService, internalApiToken } = {}) {
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
