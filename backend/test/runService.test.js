import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { RunService } from "../src/services/runService.js";

function harness(env = {}) {
  const calls = [];
  const children = [];
  const service = new RunService({
    env,
    logger: { info() {}, error() {} },
    spawnImpl(command, args, options) {
      const child = new EventEmitter();
      calls.push({ command, args, options });
      children.push(child);
      return child;
    },
  });
  return { service, calls, children };
}

const trip = {
  goal: "Plan a trip from Bengaluru to Goa",
  budget: 30000,
  days: 3,
  origin: "Bengaluru",
  destination: "Goa",
  originCode: "blr",
  destinationCode: "goi",
  departureDate: "2026-08-10",
  returnDate: "2026-08-13",
  travelers: 2,
  rooms: 1,
  travelMode: "train",
  dateFlexibility: "exact",
  includedCategories: ["flights", "stay", "food"],
  stayStyle: "home",
};

test("RunService launches provider-backed agents with structured trip context", () => {
  const { service, calls, children } = harness({ OPENAI_API_KEY: "configured" });
  const started = service.start(trip);
  const { args, options } = calls[0];

  assert.equal(started.status, "running");
  assert.equal(args.includes("--local-discovery"), false);
  assert.ok(args.includes("--trust"));
  assert.ok(args.includes("--llm"));
  assert.equal(args[args.indexOf("--destination-code") + 1], "GOI");
  assert.equal(args[args.indexOf("--travelers") + 1], "2");
  assert.equal(args[args.indexOf("--travel-mode") + 1], "train");
  assert.equal(args[args.indexOf("--categories") + 1], "flights,stay,food");
  assert.equal(args[args.indexOf("--advisory-categories") + 1], "food");
  assert.equal(args[args.indexOf("--stay-style") + 1], "home");
  assert.deepEqual(started.trip.includedCategories, ["flights", "stay", "food"]);
  assert.equal(started.trip.dateFlexibility, "exact");
  assert.deepEqual(options.stdio, ["ignore", "ignore", "ignore"]);
  assert.equal(service.get(started.runId).status, "running");

  children[0].emit("exit", 0);
  assert.equal(service.get(started.runId).status, "complete");
});

test("RunService rejects unknown travel modes", () => {
  const { service } = harness();
  assert.throws(
    () => service.start({ ...trip, travelMode: "teleport" }),
    (error) => error.code === "INVALID_TRAVELMODE",
  );
});

test("RunService rejects an empty or unknown specialist scope", () => {
  const { service } = harness();
  assert.throws(
    () => service.start({ ...trip, includedCategories: [] }),
    (error) => error.code === "INVALID_INCLUDEDCATEGORIES",
  );
  assert.throws(
    () => service.start({ ...trip, includedCategories: ["stay", "shopping"] }),
    (error) => error.code === "INVALID_INCLUDEDCATEGORIES",
  );
});

test("RunService never enables Prava or live checkout implicitly", () => {
  const { service, calls } = harness({});
  service.start(trip);
  assert.equal(calls[0].args.includes("--live-cards"), false);
  assert.equal(calls[0].args.includes("--live-checkout"), false);
  assert.equal(calls[0].args.includes("--llm"), false);
});

test("RunService keeps food and guide advisory until transactional providers exist", () => {
  const { service, calls } = harness();
  service.start({ ...trip, includedCategories: ["stay", "food", "guide"] });
  const { args } = calls[0];
  assert.equal(args[args.indexOf("--advisory-categories") + 1], "food,guide");
});

test("RunService uses the configured project Python without exposing it to the browser", () => {
  const { service, calls } = harness({ HUMSAFAR_PYTHON: ".venv/bin/python" });
  service.start(trip);
  assert.equal(calls[0].command, ".venv/bin/python");
});

test("RunService allows concurrent runs up to its capacity", () => {
  // The event hub filters by runId and each dashboard subscribes with its own,
  // so two runs never bleed into each other's stream. The old limit of one
  // meant the second judge to click Start got a 409 on a shared demo link.
  const { service } = harness();
  service.start(trip);
  assert.doesNotThrow(() => service.start(trip), "a second concurrent run was refused");
});

test("RunService still refuses runs past its capacity", () => {
  // Bounded on purpose: every run spawns a Python process, so unbounded
  // starts would exhaust memory on a small instance.
  const { service } = harness({ HUMSAFAR_MAX_CONCURRENT_RUNS: "1" });
  service.start(trip);
  assert.throws(
    () => service.start(trip),
    (error) => error.code === "RUN_CAPACITY_REACHED" && error.status === 429,
  );
});
