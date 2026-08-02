import express from "express";

import { validateEvent } from "./events/eventSchema.js";
import { ApprovalError } from "./services/approvalService.js";
import { ChoiceError } from "./services/choiceService.js";

export function createApp({ eventHub, scopedCardService, runService, discoveryService, mandateService, approvalService, choiceService, trustService, internalApiToken, publicBaseUrl = "http://127.0.0.1:3000" } = {}) {
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

    choiceService?.observe(request.body);
    const id = eventHub.publish(request.body);
    return response.status(202).json({ id });
  });

  app.post("/api/scoped-cards", authorize(internalApiToken), async (request, response) => {
    const { mandateId, merchant, amountCap } = request.body ?? {};
    const result = await scopedCardService.mintScopedCard(mandateId, merchant, amountCap);
    return response.status(result.status === "issued" ? 201 : 422).json(result);
  });

  app.post("/api/approvals/requests", authorize(internalApiToken), (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.create(request.body), 201);
  });

  app.get("/api/approvals/:approvalRequestId", authorize(internalApiToken), (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.get({
      approvalRequestId: request.params.approvalRequestId,
      runId: request.query.runId,
    }));
  });

  app.post("/api/approvals/:approvalRequestId/decision", authorize(internalApiToken), (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.decide({
      ...request.body,
      approvalRequestId: request.params.approvalRequestId,
    }), 202);
  });

  app.post("/api/approvals/:approvalRequestId/consume", authorize(internalApiToken), (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.consume({
      ...request.body,
      approvalRequestId: request.params.approvalRequestId,
    }));
  });

  app.post("/api/runs", authorize(internalApiToken), (request, response) => {
    if (!runService) return response.status(503).json({ error: { code: "RUN_UNAVAILABLE" } });
    try {
      return response.status(202).json(runService.start(request.body ?? {}));
    } catch (error) {
      return response.status(error.status ?? 400).json({
        error: { code: error.code ?? "INVALID_RUN", message: error.message },
      });
    }
  });

  app.get("/api/runs/:runId", authorize(internalApiToken), (request, response) => {
    if (!runService) return response.status(503).json({ error: { code: "RUN_UNAVAILABLE" } });
    try {
      return response.json(runService.get(request.params.runId));
    } catch (error) {
      return response.status(error.status ?? 400).json({
        error: { code: error.code ?? "INVALID_RUN", message: error.message },
      });
    }
  });

  app.post("/api/choices", authorize(internalApiToken), (request, response) => {
    if (!choiceService) return response.status(503).json({ error: { code: "CHOICE_UNAVAILABLE" } });
    return choiceResponse(response, () => choiceService.select(request.body), 202);
  });

  app.get("/api/choices", authorize(internalApiToken), (request, response) => {
    if (!choiceService) return response.status(503).json({ error: { code: "CHOICE_UNAVAILABLE" } });
    return choiceResponse(response, () => {
      const data = choiceService.get(request.query);
      if (!data) return null;
      return { data };
    });
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

  app.get("/api/prava/mandates/resolve", authorize(internalApiToken), (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    try {
      const result = mandateService.resolveMandate(request.query.merchant);
      if (!result) {
        return response.status(404).json({
          error: { code: "MANDATE_NOT_FOUND", message: "No active listed mandate for merchant" },
        });
      }
      return response.json(result);
    } catch (error) {
      return response.status(400).json({
        error: { code: "INVALID_MANDATE_LOOKUP", message: error.message },
      });
    }
  });

  app.post("/api/prava/mandates/:mandateId/charges/:transactionId/report", authorize(internalApiToken), async (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    return response.json(await mandateService.reportCharge({
      ...request.body,
      mandateId: request.params.mandateId,
      transactionId: request.params.transactionId,
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

function choiceResponse(response, operation, successStatus = 200) {
  try {
    const result = operation();
    return result === null ? response.status(204).end() : response.status(successStatus).json(result);
  } catch (error) {
    if (error instanceof ChoiceError) {
      return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    throw error;
  }
}

function approvalResponse(response, operation, successStatus = 200) {
  try {
    return response.status(successStatus).json(operation());
  } catch (error) {
    if (error instanceof ApprovalError) {
      return response.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
    }
    throw error;
  }
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
