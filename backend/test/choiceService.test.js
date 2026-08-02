import assert from "node:assert/strict";
import test from "node:test";

import { ChoiceError, ChoiceService } from "../src/services/choiceService.js";

const request = {
  type: "choice_requested",
  runId: "run_1",
  agent: "stay",
  slice: 9000,
  timeoutSeconds: 45,
  ranking: "rating",
  options: [
    { optionId: "stay:a:8000", vendor: "A", description: "Room A", price: 8000, currency: "INR", source: "fixture" },
    { optionId: "stay:b:9000", vendor: "B", description: "Room B", price: 9000, currency: "INR", source: "fixture" },
  ],
};

test("ChoiceService accepts exactly one offered option", () => {
  const service = new ChoiceService();
  service.observe(request);
  assert.equal(service.get({ runId: "run_1", agent: "stay" }), null);

  assert.equal(
    service.select({ runId: "run_1", agent: "stay", optionId: "stay:b:9000" }).optionId,
    "stay:b:9000",
  );
  assert.deepEqual(service.get({ runId: "run_1", agent: "stay" }), { optionId: "stay:b:9000" });
  assert.throws(
    () => service.select({ runId: "run_1", agent: "stay", optionId: "stay:a:8000" }),
    (error) => error instanceof ChoiceError && error.code === "CHOICE_ALREADY_SUBMITTED" && error.status === 409,
  );
});

test("ChoiceService rejects invented options and late clicks", () => {
  let now = 1_000;
  const service = new ChoiceService({ clock: () => now });
  service.observe(request);
  assert.throws(
    () => service.select({ runId: "run_1", agent: "stay", optionId: "stay:invented:1" }),
    (error) => error.code === "CHOICE_OPTION_NOT_OFFERED",
  );

  now += 45_000;
  assert.throws(
    () => service.select({ runId: "run_1", agent: "stay", optionId: "stay:a:8000" }),
    (error) => error.code === "CHOICE_SETTLED" && error.status === 409,
  );
});

test("choice_made settles a pending browser choice", () => {
  const service = new ChoiceService();
  service.observe(request);
  service.observe({ type: "choice_made", runId: "run_1", agent: "stay", optionId: "stay:a:8000" });

  assert.throws(
    () => service.select({ runId: "run_1", agent: "stay", optionId: "stay:b:9000" }),
    (error) => error.code === "CHOICE_SETTLED",
  );
});
