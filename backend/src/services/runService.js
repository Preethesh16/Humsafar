import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Starts an agent run from the browser.
 *
 * Until now a run could only be launched from the CLI, which meant no amount of
 * frontend work could make the product dynamic — the intake page had nothing to
 * call. This spawns the existing Python entry point and returns immediately.
 *
 * Deliberately fire-and-forget: a run waits for human approval and a human
 * choice, so it can last minutes. Holding the HTTP response open would time out
 * and tell the user nothing. Events already stream to the SSE hub, so progress
 * is reported over the channel the dashboard is already reading.
 */
export class RunService {
  constructor({ cwd = "agents", python, spawnImpl = spawn, logger = console, env = process.env, backendUrl } = {}) {
    this.cwd = cwd;
    // A project venv is preferable on PEP 668 distributions such as Arch.
    // Keep python3 as the portable fallback so the deterministic path still
    // runs in a fresh clone with no optional SDK dependencies installed.
    this.python = python ?? env.HUMSAFAR_PYTHON ?? "python3";
    this.spawnImpl = spawnImpl;
    this.logger = logger;
    this.active = new Map();
    this.runs = new Map();

    // The agent posts its events back over HTTP, and its own default is
    // `http://127.0.0.1:3000`. Every managed host assigns the port instead of
    // letting us pick it — Render and Railway both inject `PORT` — so that
    // default silently points at nothing the moment this is deployed, and a run
    // completes having published zero events to a dashboard waiting for them.
    //
    // Found by actually running the production build rather than by reading it.
    // An explicit HUMSAFAR_BACKEND_URL still wins, for a split deployment.
    this.env = backendUrl && !env.HUMSAFAR_BACKEND_URL
      ? { ...env, HUMSAFAR_BACKEND_URL: backendUrl }
      : env;
  }

  start({
    goal,
    budget,
    days,
    origin,
    destination,
    originCode,
    destinationCode,
    departureDate,
    returnDate,
    latitude,
    longitude,
    travelers = 1,
    rooms = 1,
    travelMode = "compare",
    dateFlexibility = "flexible",
    includedCategories = ["flights", "stay", "food", "guide"],
    stayStyle = "compare",
    awaitApproval = true,
    awaitChoice = true,
  } = {}) {
    if (typeof goal !== "string" || goal.trim() === "") {
      throw new RunError("goal must be a non-empty string", "INVALID_GOAL");
    }
    const amount = Number(budget);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RunError("budget must be a positive number", "INVALID_BUDGET");
    }
    if (this.active.size > 0) {
      throw new RunError("Another browser run is active; wait for it to settle", "RUN_ALREADY_ACTIVE", 409);
    }

    const trip = validateTrip({
      days, origin, destination, originCode, destinationCode,
      departureDate, returnDate, travelers, rooms,
      latitude, longitude, travelMode, dateFlexibility,
      includedCategories, stayStyle,
    });

    const runId = `run-${randomUUID().slice(0, 12)}`;
    const args = [
      "-m", "humsafar",
      "--goal", goal.trim(),
      "--budget", String(amount),
      "--run-id", runId,
      "--trust",
    ];
    // Backend discovery is the CLI default, so configured Duffel/Google
    // credentials are used without an opt-in flag. Structured trip context is
    // still passed explicitly so no provider has to re-parse the goal.
    pushArg(args, "--days", trip.days);
    pushArg(args, "--origin", trip.origin);
    pushArg(args, "--destination", trip.destination);
    pushArg(args, "--origin-code", trip.originCode);
    pushArg(args, "--destination-code", trip.destinationCode);
    pushArg(args, "--departure-date", trip.departureDate);
    pushArg(args, "--return-date", trip.returnDate);
    pushArg(args, "--latitude", trip.latitude);
    pushArg(args, "--longitude", trip.longitude);
    pushArg(args, "--travelers", trip.travelers);
    pushArg(args, "--rooms", trip.rooms);
    pushArg(args, "--travel-mode", trip.travelMode);
    pushArg(args, "--categories", trip.includedCategories.join(","));
    pushArg(args, "--stay-style", trip.stayStyle);
    if (awaitApproval) args.push("--await-approval");
    if (awaitChoice) args.push("--await-choice");
    if (this.env.OPENAI_API_KEY) args.push("--llm");
    if (this.env.HUMSAFAR_LIVE_CARDS === "true") args.push("--live-cards");
    if (this.env.HUMSAFAR_LIVE_CHECKOUT === "true") args.push("--live-checkout");

    const child = this.spawnImpl(this.python, args, {
      cwd: this.cwd,
      env: this.env,
      detached: false,
      // The run is observed through typed events. Ignoring process output
      // avoids both pipe backpressure deadlocks and accidental provider detail
      // leakage into backend logs.
      stdio: ["ignore", "ignore", "ignore"],
    });

    const record = { runId, status: "running", startedAt: new Date().toISOString(), trip };
    this.runs.set(runId, record);
    this.active.set(runId, child);
    child.on("exit", (code) => {
      this.active.delete(runId);
      record.status = code === 0 ? "complete" : "failed";
      record.exitCode = code;
      record.finishedAt = new Date().toISOString();
      this.logger.info?.({ service: "run", runId, exit: code });
    });
    child.on("error", (error) => {
      this.active.delete(runId);
      record.status = "failed";
      record.errorCode = error?.code ?? "SPAWN_FAILED";
      record.finishedAt = new Date().toISOString();
      this.logger.error?.({ service: "run", runId, code: error?.code ?? "SPAWN_FAILED" });
    });

    return { runId, status: record.status, trip, modes: this.#modes() };
  }

  get(runId) {
    const record = this.runs.get(runId);
    if (!record) throw new RunError("Run was not found", "RUN_NOT_FOUND", 404);
    return { ...record, modes: this.#modes() };
  }

  #modes() {
    return {
      discovery: "provider-with-disclosed-fixture-fallback",
      reasoning: this.env.OPENAI_API_KEY ? "openai" : "deterministic",
      cards: this.env.HUMSAFAR_LIVE_CARDS === "true" ? "prava-sandbox" : "simulated",
      checkout: this.env.HUMSAFAR_LIVE_CHECKOUT === "true" ? "merchant-integration" : "simulated",
    };
  }
}

export class RunError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "RunError";
    this.code = code ?? "INVALID_RUN";
    this.status = status;
  }
}

function validateTrip(input) {
  const days = integer(input.days, "days", 1, 30, 3);
  const travelers = integer(input.travelers, "travelers", 1, 9, 1);
  const rooms = integer(input.rooms, "rooms", 1, 9, 1);
  const originCode = airportCode(input.originCode, "originCode");
  const destinationCode = airportCode(input.destinationCode, "destinationCode");
  const departureDate = isoDate(input.departureDate, "departureDate");
  const returnDate = isoDate(input.returnDate, "returnDate");
  const latitude = coordinate(input.latitude, "latitude", -90, 90);
  const longitude = coordinate(input.longitude, "longitude", -180, 180);
  const travelMode = oneOf(input.travelMode, "travelMode", ["compare", "flight", "train", "bus", "drive"], "compare");
  const dateFlexibility = oneOf(input.dateFlexibility, "dateFlexibility", ["exact", "flexible"], "flexible");
  const includedCategories = categoryList(input.includedCategories);
  const stayStyle = oneOf(input.stayStyle, "stayStyle", ["compare", "hotel", "hostel", "home", "homestay"], "compare");
  if ((latitude === null) !== (longitude === null)) {
    throw new RunError("latitude and longitude must be supplied together", "INCOMPLETE_COORDINATES");
  }
  if (departureDate && returnDate && returnDate <= departureDate) {
    throw new RunError("returnDate must be after departureDate", "INVALID_RETURN_DATE");
  }
  return {
    days,
    travelers,
    rooms,
    origin: optionalText(input.origin),
    destination: optionalText(input.destination),
    originCode,
    destinationCode,
    departureDate,
    returnDate,
    latitude,
    longitude,
    travelMode,
    dateFlexibility,
    includedCategories,
    stayStyle,
  };
}

function categoryList(value) {
  const allowed = ["flights", "stay", "food", "guide"];
  if (value === undefined || value === null) return allowed;
  if (!Array.isArray(value) || value.length === 0) {
    throw new RunError("includedCategories must contain at least one trip category", "INVALID_INCLUDEDCATEGORIES");
  }
  const normalized = [...new Set(value.map((item) => String(item).trim().toLowerCase()))];
  if (normalized.some((item) => !allowed.includes(item))) {
    throw new RunError(`includedCategories may only contain: ${allowed.join(", ")}`, "INVALID_INCLUDEDCATEGORIES");
  }
  return allowed.filter((item) => normalized.includes(item));
}

function integer(value, field, min, max, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RunError(`${field} must be an integer from ${min} to ${max}`, `INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function airportCode(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new RunError(`${field} must be a three-letter IATA code`, `INVALID_${field.toUpperCase()}`);
  }
  return code;
}

function isoDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new RunError(`${field} must be YYYY-MM-DD`, `INVALID_${field.toUpperCase()}`);
  }
  return date;
}

function optionalText(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim().slice(0, 120) || null;
}

function oneOf(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new RunError(`${field} must be one of: ${allowed.join(", ")}`, `INVALID_${field.toUpperCase()}`);
  }
  return normalized;
}

function coordinate(value, field, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new RunError(`${field} must be between ${min} and ${max}`, `INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function pushArg(args, flag, value) {
  if (value !== null && value !== undefined) args.push(flag, String(value));
}
