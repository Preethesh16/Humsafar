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
};

test("RunService launches provider-backed agents with structured trip context", () => {
  const { service, calls, children } = harness({ OPENAI_API_KEY: "configured" });
  const started = service.start(trip);
  const { args, options } = calls[0];

  assert.equal(started.status, "running");
  assert.ok(args.includes("--live-discovery"));
  assert.ok(args.includes("--trust"));
  assert.ok(args.includes("--llm"));
  assert.equal(args[args.indexOf("--destination-code") + 1], "GOI");
  assert.equal(args[args.indexOf("--travelers") + 1], "2");
  assert.deepEqual(options.stdio, ["ignore", "ignore", "ignore"]);
  assert.equal(service.get(started.runId).status, "running");

  children[0].emit("exit", 0);
  assert.equal(service.get(started.runId).status, "complete");
});

test("RunService never enables Prava or live checkout implicitly", () => {
  const { service, calls } = harness({});
  service.start(trip);
  assert.equal(calls[0].args.includes("--live-cards"), false);
  assert.equal(calls[0].args.includes("--live-checkout"), false);
  assert.equal(calls[0].args.includes("--llm"), false);
});

test("RunService rejects a second run while the shared event stream is busy", () => {
  const { service } = harness();
  service.start(trip);
  assert.throws(
    () => service.start(trip),
    (error) => error.code === "RUN_ALREADY_ACTIVE" && error.status === 409,
  );
});
