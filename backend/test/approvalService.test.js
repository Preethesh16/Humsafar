import assert from "node:assert/strict";
import test from "node:test";

import { ApprovalError, ApprovalService, approvalDigest } from "../src/services/approvalService.js";

const allocations = { flights: 100, stay: 200, food: 50, guide: 25 };

test("ApprovalService binds an approval to its run and canonical plan digest", () => {
  const service = new ApprovalService({
    clock: () => Date.parse("2026-08-01T18:00:00.000Z"),
    createId: () => "approval_1",
  });

  const created = service.create({
    runId: "run_1",
    allocations,
    choices: { stay: "hotel_2", flights: "flight_1" },
    ttlSeconds: 90,
  });

  assert.equal(created.approvalRequestId, "approval_1");
  assert.equal(created.status, "pending");
  assert.equal(created.expiresAt, "2026-08-01T18:01:30.000Z");
  assert.equal(created.digest, approvalDigest({
    runId: "run_1",
    allocations,
    choices: { flights: "flight_1", stay: "hotel_2" },
  }));
});

test("ApprovalService approves once and consumes once", () => {
  let now = Date.parse("2026-08-01T18:00:00.000Z");
  const service = new ApprovalService({ clock: () => now, createId: () => "approval_1" });
  const created = service.create({ runId: "run_1", allocations });

  now += 1000;
  const approved = service.decide({
    approvalRequestId: created.approvalRequestId,
    runId: "run_1",
    digest: created.digest,
    decision: "approved",
  });
  assert.equal(approved.status, "approved");

  now += 1000;
  const consumed = service.consume({
    approvalRequestId: created.approvalRequestId,
    runId: "run_1",
    digest: created.digest,
  });
  assert.equal(consumed.status, "consumed");

  assert.throws(
    () => service.consume({
      approvalRequestId: created.approvalRequestId,
      runId: "run_1",
      digest: created.digest,
    }),
    (error) => error instanceof ApprovalError && error.code === "APPROVAL_NOT_APPROVED",
  );
});

test("ApprovalService rejects stale run and changed allocation digests", () => {
  const service = new ApprovalService({ createId: () => "approval_1" });
  const created = service.create({ runId: "run_1", allocations });

  assert.throws(
    () => service.get({ approvalRequestId: created.approvalRequestId, runId: "run_2" }),
    (error) => error.code === "APPROVAL_NOT_FOUND" && error.status === 404,
  );
  assert.throws(
    () => service.decide({
      approvalRequestId: created.approvalRequestId,
      runId: "run_1",
      digest: "changed-plan",
      decision: "approved",
    }),
    (error) => error.code === "APPROVAL_DIGEST_MISMATCH" && error.status === 409,
  );
});

test("ApprovalService expires pending approvals and refuses consumption", () => {
  let now = Date.parse("2026-08-01T18:00:00.000Z");
  const service = new ApprovalService({ clock: () => now, createId: () => "approval_1" });
  const created = service.create({ runId: "run_1", allocations, ttlSeconds: 1 });
  now += 1000;

  assert.equal(service.get({ approvalRequestId: "approval_1", runId: "run_1" }).status, "expired");
  assert.throws(
    () => service.consume({
      approvalRequestId: "approval_1",
      runId: "run_1",
      digest: created.digest,
    }),
    (error) => error.code === "APPROVAL_NOT_APPROVED",
  );
});
