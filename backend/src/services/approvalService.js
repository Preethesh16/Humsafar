import { createHash, randomUUID } from "node:crypto";

const DEFAULT_TTL_SECONDS = 120;
const MAX_TTL_SECONDS = 600;
const DECISIONS = new Set(["approved", "declined"]);

export class ApprovalError extends Error {
  constructor(message, { code, status = 400 } = {}) {
    super(message);
    this.name = "ApprovalError";
    this.code = code ?? "INVALID_APPROVAL";
    this.status = status;
  }
}

export class ApprovalService {
  constructor({ clock = () => Date.now(), createId = () => randomUUID() } = {}) {
    this.clock = clock;
    this.createId = createId;
    this.records = new Map();
  }

  create({ runId, allocations, choices = {}, ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
    requireNonEmpty(runId, "runId");
    validateAllocations(allocations);
    if (!isObject(choices)) {
      throw new ApprovalError("choices must be an object", { code: "INVALID_CHOICES" });
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
      throw new ApprovalError(`ttlSeconds must be an integer from 1 to ${MAX_TTL_SECONDS}`, {
        code: "INVALID_APPROVAL_TTL",
      });
    }

    const approvalRequestId = this.createId();
    const createdAtMs = this.clock();
    const digest = approvalDigest({ runId, allocations, choices });
    const record = {
      approvalRequestId,
      runId,
      digest,
      status: "pending",
      createdAtMs,
      expiresAtMs: createdAtMs + ttlSeconds * 1000,
      decidedAtMs: undefined,
      consumedAtMs: undefined,
    };
    this.records.set(approvalRequestId, record);
    return publicRecord(record, this.clock());
  }

  get({ approvalRequestId, runId } = {}) {
    const record = this.#recordFor(approvalRequestId, runId);
    expire(record, this.clock());
    return publicRecord(record, this.clock());
  }

  decide({ approvalRequestId, runId, digest, decision } = {}) {
    const record = this.#recordFor(approvalRequestId, runId);
    expire(record, this.clock());
    if (record.status !== "pending") {
      throw conflict(`Approval is already ${record.status}`, "APPROVAL_NOT_PENDING");
    }
    if (digest !== record.digest) {
      throw conflict("Approval digest does not match the requested plan", "APPROVAL_DIGEST_MISMATCH");
    }
    if (!DECISIONS.has(decision)) {
      throw new ApprovalError("decision must be approved or declined", {
        code: "INVALID_APPROVAL_DECISION",
      });
    }

    record.status = decision;
    record.decidedAtMs = this.clock();
    return publicRecord(record, this.clock());
  }

  consume({ approvalRequestId, runId, digest } = {}) {
    const record = this.#recordFor(approvalRequestId, runId);
    expire(record, this.clock());
    if (record.digest !== digest) {
      throw conflict("Approval digest does not match the requested plan", "APPROVAL_DIGEST_MISMATCH");
    }
    if (record.status !== "approved") {
      throw conflict(`Approval cannot be consumed while ${record.status}`, "APPROVAL_NOT_APPROVED");
    }

    record.status = "consumed";
    record.consumedAtMs = this.clock();
    return publicRecord(record, this.clock());
  }

  #recordFor(approvalRequestId, runId) {
    requireNonEmpty(approvalRequestId, "approvalRequestId");
    requireNonEmpty(runId, "runId");
    const record = this.records.get(approvalRequestId);
    if (!record || record.runId !== runId) {
      throw new ApprovalError("Approval request was not found for this run", {
        code: "APPROVAL_NOT_FOUND",
        status: 404,
      });
    }
    return record;
  }
}

export function approvalDigest({ runId, allocations, choices = {} }) {
  return createHash("sha256").update(stableJson({ runId, allocations, choices })).digest("hex");
}

function expire(record, nowMs) {
  if (record.status === "pending" && nowMs >= record.expiresAtMs) {
    record.status = "expired";
  }
}

function publicRecord(record, nowMs) {
  expire(record, nowMs);
  return {
    approvalRequestId: record.approvalRequestId,
    runId: record.runId,
    digest: record.digest,
    status: record.status,
    createdAt: new Date(record.createdAtMs).toISOString(),
    expiresAt: new Date(record.expiresAtMs).toISOString(),
    decidedAt: record.decidedAtMs === undefined
      ? null
      : new Date(record.decidedAtMs).toISOString(),
    consumedAt: record.consumedAtMs === undefined
      ? null
      : new Date(record.consumedAtMs).toISOString(),
  };
}

function validateAllocations(value) {
  if (!isObject(value) || !["flights", "stay", "food", "guide"].every(
    (key) => Number.isFinite(value[key]) && value[key] >= 0,
  )) {
    throw new ApprovalError("allocations must contain four non-negative finite amounts", {
      code: "INVALID_ALLOCATIONS",
    });
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireNonEmpty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApprovalError(`${field} must be a non-empty string`, {
      code: `INVALID_${field.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`,
    });
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function conflict(message, code) {
  return new ApprovalError(message, { code, status: 409 });
}
