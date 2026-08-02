import express from "express";
import fs from "node:fs";
import path from "node:path";

import { validateEvent } from "./events/eventSchema.js";
import { ApprovalError } from "./services/approvalService.js";
import { ChoiceError } from "./services/choiceService.js";
import {
  SESSION_COOKIE,
  createSessionToken,
  isSecureRequest,
  readCookie,
  sessionCookieHeader,
  verifySessionToken,
} from "./session.js";

export function createApp({ eventHub, scopedCardService, runService, discoveryService, itineraryService, mandateService, pravaApprovalService, approvalService, choiceService, trustService, internalApiToken, publicBaseUrl = "http://127.0.0.1:3000", frontendDist, sessionSecret } = {}) {
  if (!eventHub || typeof eventHub.publish !== "function") {
    throw new TypeError("An event hub is required");
  }
  if (!scopedCardService || typeof scopedCardService.mintScopedCard !== "function") {
    throw new TypeError("A scoped card service is required");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  // Two authorizers, because the browser and the agent process need different
  // amounts of power. `agentOnly` is the original bearer-token check and still
  // guards everything that touches money or the event stream's contents.
  // `browserOrAgent` additionally accepts a signed session cookie, and is used
  // only on the routes a human actually drives. See session.js.
  const agentOnly = authorize(internalApiToken);
  const browserOrAgent = authorizeBrowser(internalApiToken, sessionSecret);

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

  app.post("/api/events", agentOnly, (request, response) => {
    const error = validateEvent(request.body);
    if (error) {
      return response.status(400).json({ error: { code: "INVALID_EVENT", message: error } });
    }

    choiceService?.observe(request.body);
    const id = eventHub.publish(request.body);
    return response.status(202).json({ id });
  });

  app.post("/api/scoped-cards", agentOnly, async (request, response) => {
    const { mandateId, merchant, amountCap } = request.body ?? {};
    const result = await scopedCardService.mintScopedCard(mandateId, merchant, amountCap);
    return response.status(result.status === "issued" ? 201 : 422).json(result);
  });

  app.post("/api/approvals/requests", agentOnly, (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.create(request.body), 201);
  });

  app.get("/api/approvals/:approvalRequestId", browserOrAgent, (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.get({
      approvalRequestId: request.params.approvalRequestId,
      runId: request.query.runId,
    }));
  });

  app.post("/api/approvals/:approvalRequestId/decision", browserOrAgent, (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.decide({
      ...request.body,
      approvalRequestId: request.params.approvalRequestId,
    }), 202);
  });

  app.post("/api/approvals/:approvalRequestId/consume", agentOnly, (request, response) => {
    if (!approvalService) return response.status(503).json({ error: { code: "APPROVAL_UNAVAILABLE" } });
    return approvalResponse(response, () => approvalService.consume({
      ...request.body,
      approvalRequestId: request.params.approvalRequestId,
    }));
  });

  app.post("/api/runs", browserOrAgent, (request, response) => {
    if (!runService) return response.status(503).json({ error: { code: "RUN_UNAVAILABLE" } });
    try {
      return response.status(202).json(runService.start(request.body ?? {}));
    } catch (error) {
      return response.status(error.status ?? 400).json({
        error: { code: error.code ?? "INVALID_RUN", message: error.message },
      });
    }
  });

  app.get("/api/runs/:runId", browserOrAgent, (request, response) => {
    if (!runService) return response.status(503).json({ error: { code: "RUN_UNAVAILABLE" } });
    try {
      return response.json(runService.get(request.params.runId));
    } catch (error) {
      return response.status(error.status ?? 400).json({
        error: { code: error.code ?? "INVALID_RUN", message: error.message },
      });
    }
  });

  app.post("/api/choices", browserOrAgent, (request, response) => {
    if (!choiceService) return response.status(503).json({ error: { code: "CHOICE_UNAVAILABLE" } });
    return choiceResponse(response, () => choiceService.select(request.body), 202);
  });

  app.get("/api/choices", browserOrAgent, (request, response) => {
    if (!choiceService) return response.status(503).json({ error: { code: "CHOICE_UNAVAILABLE" } });
    return choiceResponse(response, () => {
      const data = choiceService.get(request.query);
      if (!data) return null;
      return { data };
    });
  });

  app.post("/api/discovery/:category", agentOnly, async (request, response) => {
    if (!discoveryService) return response.status(503).json({ error: { code: "DISCOVERY_UNAVAILABLE" } });
    try {
      return response.json(await discoveryService.search(request.params.category, request.body));
    } catch (error) {
      return response.status(400).json({ error: { code: "INVALID_DISCOVERY", message: error.message } });
    }
  });

  // Browser-reachable: `frontend/src/lib/itinerary.js` calls both of these
  // directly from the intake page. Left on the agent-only token they would 401
  // for every real visitor once deployed, which is the same failure the session
  // layer exists to prevent — it just would not show up in development, where
  // the Vite proxy supplies the token.
  app.post("/api/itineraries/suggestions", browserOrAgent, async (request, response) => {
    if (!itineraryService) return response.status(503).json({ error: { code: "ITINERARY_UNAVAILABLE" } });
    return itineraryResponse(response, () => itineraryService.suggestions(request.body ?? {}));
  });

  app.post("/api/itineraries/preview", browserOrAgent, async (request, response) => {
    if (!itineraryService) return response.status(503).json({ error: { code: "ITINERARY_UNAVAILABLE" } });
    return itineraryResponse(response, () => itineraryService.plan(request.body ?? {}));
  });

  app.post("/api/trust/check", agentOnly, async (request, response) => {
    if (!trustService) return response.status(503).json({ error: { code: "TRUST_UNAVAILABLE" } });
    try {
      return response.json(await trustService.check(request.body));
    } catch (error) {
      return response.status(400).json({ error: { code: "INVALID_TRUST_REQUEST", message: error.message } });
    }
  });

  app.post("/api/prava/mandate-sessions", agentOnly, async (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    return response.status(201).json(await mandateService.createSetupSession(request.body));
  });

  // Human-driven and explicitly opt-in. The browser supplies only a run id;
  // the amount comes from that run's final receipt and the remaining terms are
  // server configuration. It receives only Prava's short-lived hosted URL so
  // card entry and passkey approval stay entirely on Prava's origin.
  app.post("/api/prava/phone-approval", browserOrAgent, async (request, response) => {
    if (!pravaApprovalService) {
      return response.status(503).json({
        error: { code: "PRAVA_PHONE_APPROVAL_UNAVAILABLE", message: "Phone approval is unavailable" },
      });
    }
    try {
      return response.status(201).json(await pravaApprovalService.create({ runId: request.body?.runId }));
    } catch (error) {
      const disabled = error?.code === "PRAVA_PHONE_APPROVAL_DISABLED";
      const invalidPlan = new Set(["PRAVA_PLAN_NOT_FOUND", "PRAVA_INVALID_PLAN_TOTAL"]).has(error?.code);
      return response.status(disabled ? 503 : invalidPlan ? 422 : 502).json({
        error: {
          code: error?.code ?? "PRAVA_PHONE_APPROVAL_FAILED",
          message: error instanceof Error ? error.message : "Prava phone approval failed",
          responseId: error?.responseId,
        },
      });
    }
  });

  app.get("/api/prava/phone-approval", browserOrAgent, async (request, response) => {
    if (!pravaApprovalService) {
      return response.status(503).json({
        error: { code: "PRAVA_PHONE_APPROVAL_UNAVAILABLE", message: "Phone approval is unavailable" },
      });
    }
    try {
      return response.json(await pravaApprovalService.status({ runId: request.query.runId }));
    } catch (error) {
      const missing = error?.code === "PRAVA_APPROVAL_NOT_FOUND";
      const disabled = error?.code === "PRAVA_PHONE_APPROVAL_DISABLED";
      return response.status(missing ? 404 : disabled ? 503 : 502).json({
        error: {
          code: error?.code ?? "PRAVA_PHONE_STATUS_FAILED",
          message: error instanceof Error ? error.message : "Prava phone status check failed",
          responseId: error?.responseId,
        },
      });
    }
  });

  app.post("/api/prava/mandates/sync", agentOnly, async (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    return response.json(await mandateService.syncCustomerMandates(request.body.customerId));
  });

  app.get("/api/prava/mandates/resolve", agentOnly, (request, response) => {
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

  app.post("/api/prava/mandates/:mandateId/charges/:transactionId/report", agentOnly, async (request, response) => {
    if (!mandateService) return response.status(503).json({ error: { code: "PRAVA_UNAVAILABLE" } });
    return response.json(await mandateService.reportCharge({
      ...request.body,
      mandateId: request.params.mandateId,
      transactionId: request.params.transactionId,
    }));
  });

  // The built frontend, when there is one. Registered after every API route so
  // it can never shadow them, and skipped entirely in development where Vite
  // serves the app itself.
  if (frontendDist && fs.existsSync(path.join(frontendDist, "index.html"))) {
    const indexHtml = path.join(frontendDist, "index.html");

    const serveApp = (request, response) => {
      // The session cookie is issued with the app shell, so any browser that
      // loaded the page can drive the run. Re-issued on every shell request,
      // which doubles as the refresh for a long demo.
      if (sessionSecret) {
        response.setHeader(
          "Set-Cookie",
          sessionCookieHeader(createSessionToken(sessionSecret), {
            secure: isSecureRequest(request),
          }),
        );
      }
      response.sendFile(indexHtml);
    };

    // Hashed asset filenames, so these are safe to cache hard. index.html is
    // served by hand below and never cached, or a redeploy would leave judges
    // on a stale bundle pointing at assets that no longer exist.
    app.use(express.static(frontendDist, { index: false, maxAge: "1y" }));

    app.get("/", serveApp);
    // SPA fallback. Express 5 dropped string `*` patterns, hence the RegExp.
    // An unmatched `/api` path must still 404 as JSON rather than silently
    // returning the app shell, which would turn a typo into a confusing
    // "unexpected token <" in the client.
    app.get(/^\/(?!api\/|health$|a2a\/|\.well-known\/).*/, serveApp);
  }

  // An unmatched API path must answer in JSON. Express's default is an HTML
  // error page, which a fetch() caller parses as JSON and reports as
  // "unexpected token <" — a mistyped route then looks like a serialisation bug
  // rather than a 404. Registered after every route and after the static
  // handler, so it only catches genuine misses.
  app.use("/api", (_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "No such API route" },
    });
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

async function itineraryResponse(response, operation) {
  try {
    return response.json(await operation());
  } catch (error) {
    const providerUnavailable = [
      "GEOAPIFY_NOT_CONFIGURED", "GEOAPIFY_NETWORK_ERROR", "GEOAPIFY_REQUEST_FAILED",
      "OPEN_METEO_NETWORK_ERROR", "OPEN_METEO_REQUEST_FAILED",
    ].includes(error.code);
    return response.status(providerUnavailable ? 503 : 400).json({
      error: { code: error.code ?? "INVALID_ITINERARY", message: error.message },
    });
  }
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

/**
 * Accepts the internal bearer token OR a valid browser session cookie.
 *
 * Used only on the routes a human drives. The token path is unchanged, so the
 * agent process and every existing test keep working exactly as before; the
 * cookie path is what makes the deployed frontend function without the token
 * ever reaching client code.
 *
 * With no `sessionSecret` configured this degrades to plain `authorize`, which
 * is what keeps local development and the test suite on the original behaviour.
 */
function authorizeBrowser(expectedToken, sessionSecret) {
  const tokenOnly = authorize(expectedToken);

  return (request, response, next) => {
    if (!expectedToken) return next();
    if (!sessionSecret) return tokenOnly(request, response, next);

    if (request.get("authorization") === `Bearer ${expectedToken}`) return next();

    const cookie = readCookie(request.get("cookie"), SESSION_COOKIE);
    if (verifySessionToken(cookie, sessionSecret)) return next();

    return response.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Valid internal API token or browser session required",
      },
    });
  };
}
