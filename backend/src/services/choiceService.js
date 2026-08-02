/**
 * The §6 human choice step — run-scoped, one decision per category.
 *
 * Correlation is by `runId`, not by a global "current run", so a click that
 * arrives late — the user left the tab open, the run already moved on — can
 * never settle a category in a different run. That is the same failure the
 * approval protocol fails closed on, and it matters more here because a choice
 * decides what actually gets bought.
 */
export class ChoiceError extends Error {
  constructor(message, { code, status = 400 } = {}) {
    super(message);
    this.name = "ChoiceError";
    this.code = code ?? "INVALID_CHOICE";
    this.status = status;
  }
}

export class ChoiceService {
  constructor() {
    this.choices = new Map(); // `${runId}:${agent}` -> { optionId, at }
  }

  record({ runId, agent, optionId } = {}) {
    requireText(runId, "runId");
    requireText(agent, "agent");
    requireText(optionId, "optionId");

    const key = `${runId}:${agent}`;
    if (this.choices.has(key)) {
      // The agent may already have timed out and bought something. Silently
      // overwriting would mean the receipt disagreed with the purchase.
      throw new ChoiceError("This category is already settled", {
        code: "CHOICE_ALREADY_SETTLED",
        status: 409,
      });
    }

    this.choices.set(key, { optionId, at: new Date().toISOString() });
    return { runId, agent, optionId };
  }

  get({ runId, agent } = {}) {
    requireText(runId, "runId");
    requireText(agent, "agent");
    return this.choices.get(`${runId}:${agent}`) ?? null;
  }
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ChoiceError(`${field} is required`, { code: "INVALID_CHOICE" });
  }
}
