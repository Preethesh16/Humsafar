import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { EventHub } from "../src/events/eventHub.js";

test("EventHub replays events after Last-Event-ID and removes closed clients", () => {
  const hub = new EventHub({ historyLimit: 2 });
  hub.publish({ type: "approval_given", timestamp: "2026-08-01T08:00:00.000Z" });
  hub.publish({ type: "approval_given", timestamp: "2026-08-01T08:01:00.000Z" });

  const request = new EventEmitter();
  request.get = (name) => name === "last-event-id" ? "1" : undefined;
  const writes = [];
  const response = {
    status() { return this; },
    set() { return this; },
    flushHeaders() {},
    write(value) { writes.push(value); },
  };

  hub.connect(request, response);
  assert.equal(hub.clients.size, 1);
  assert.equal(writes.some((value) => value.includes("id: 1")), false);
  assert.equal(writes.some((value) => value.includes("id: 2")), true);

  request.emit("close");
  assert.equal(hub.clients.size, 0);
});

test("EventHub keeps only its bounded replay history", () => {
  const hub = new EventHub({ historyLimit: 2 });
  hub.publish({ type: "approval_given", timestamp: "2026-08-01T08:00:00.000Z" });
  hub.publish({ type: "approval_given", timestamp: "2026-08-01T08:01:00.000Z" });
  hub.publish({ type: "approval_given", timestamp: "2026-08-01T08:02:00.000Z" });

  assert.deepEqual(hub.snapshot().map(({ id }) => id), [2, 3]);
});

test("EventHub isolates replay and live delivery by runId", () => {
  const hub = new EventHub();
  hub.publish({ type: "agent_message", runId: "run_a" });
  hub.publish({ type: "agent_message", runId: "run_b" });
  const request = new EventEmitter();
  request.query = { runId: "run_b" };
  request.get = () => undefined;
  const writes = [];
  const response = {
    status() { return this; }, set() { return this; }, flushHeaders() {},
    write(value) { writes.push(value); },
  };
  hub.connect(request, response);
  assert.equal(writes.some((value) => value.includes("run_a")), false);
  assert.equal(writes.some((value) => value.includes("run_b")), true);
  hub.publish({ type: "agent_message", runId: "run_a" });
  hub.publish({ type: "agent_message", runId: "run_b" });
  assert.equal(writes.filter((value) => value.includes("run_b")).length, 2);
  assert.equal(writes.some((value) => value.includes('"runId":"run_a"')), false);
});
