const VALID_AGENTS = new Set(["flights", "stay", "food", "guide"]);

export class ChoiceError extends Error {
  constructor(message, { code = "INVALID_CHOICE", status = 400 } = {}) {
    super(message);
    this.name = "ChoiceError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Server-owned rendezvous between the Python agent process and the browser.
 *
 * The event that opens a choice carries the complete affordable shortlist.
 * The browser may select exactly one of those option IDs, once.  The agent's
 * later choice_made event settles the row (including timeout auto-picks), so a
 * stale tab cannot rewrite a plan that has already moved to approval.
 */
export class ChoiceService {
  constructor({ clock = () => Date.now() } = {}) {
    this.clock = clock;
    this.records = new Map();
  }

  observe(event) {
    if (event?.type === "choice_requested") this.#open(event);
    if (event?.type === "choice_made") this.#settle(event);
  }

  select({ runId, agent, optionId } = {}) {
    const record = this.#record(runId, agent);
    this.#expire(record);
    if (record.settled) throw conflict("Choice is already settled", "CHOICE_SETTLED");
    if (record.selectedOptionId) throw conflict("Choice was already submitted", "CHOICE_ALREADY_SUBMITTED");
    if (!record.optionIds.has(optionId)) {
      throw new ChoiceError("optionId was not offered for this run and agent", {
        code: "CHOICE_OPTION_NOT_OFFERED",
      });
    }
    record.selectedOptionId = optionId;
    record.selectedAtMs = this.clock();
    return publicRecord(record);
  }

  get({ runId, agent } = {}) {
    const record = this.#record(runId, agent);
    this.#expire(record);
    if (!record.selectedOptionId) return null;
    return { optionId: record.selectedOptionId };
  }

  #open(event) {
    const key = recordKey(event.runId, event.agent);
    const optionIds = new Set((event.options ?? []).map((row) => row.optionId));
    const now = this.clock();
    this.records.set(key, {
      runId: event.runId,
      agent: event.agent,
      optionIds,
      selectedOptionId: null,
      selectedAtMs: null,
      settled: false,
      expiresAtMs: now + Number(event.timeoutSeconds) * 1000,
    });
  }

  #settle(event) {
    const record = this.records.get(recordKey(event.runId, event.agent));
    if (!record) return;
    record.settled = true;
    record.selectedOptionId ??= event.optionId;
  }

  #record(runId, agent) {
    requireString(runId, "runId");
    requireString(agent, "agent");
    if (!VALID_AGENTS.has(agent)) {
      throw new ChoiceError("agent must be flights, stay, food, or guide", { code: "INVALID_CHOICE_AGENT" });
    }
    const record = this.records.get(recordKey(runId, agent));
    if (!record) {
      throw new ChoiceError("No open choice exists for this run and agent", {
        code: "CHOICE_NOT_FOUND",
        status: 404,
      });
    }
    return record;
  }

  #expire(record) {
    if (!record.settled && this.clock() >= record.expiresAtMs) record.settled = true;
  }
}

function publicRecord(record) {
  return {
    runId: record.runId,
    agent: record.agent,
    optionId: record.selectedOptionId,
    settled: record.settled,
  };
}

function recordKey(runId, agent) {
  return `${runId}\u0000${agent}`;
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ChoiceError(`${field} must be a non-empty string`, {
      code: `INVALID_${field.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`,
    });
  }
}

function conflict(message, code) {
  return new ChoiceError(message, { code, status: 409 });
}
