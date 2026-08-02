const AGENTS = new Set([
  "flights",
  "stay",
  "food",
  "guide",
  "mediator",
  "orchestrator",
]);

const EVENT_TYPES = new Set([
  "agent_message",
  "split_update",
  "approval_requested",
  "approval_given",
  "card_issued",
  "purchase_result",
  "blocked_attempt",
  "renegotiation_triggered",
  "final_receipt",
  "choice_requested",
  "choice_made",
]);

export function validateEvent(event) {
  if (!isObject(event) || !EVENT_TYPES.has(event.type)) {
    return "type must be a supported event type";
  }

  switch (event.type) {
    case "agent_message":
      if (!AGENTS.has(event.agent)) return "agent_message.agent is invalid";
      if (!nonEmptyString(event.message)) return "agent_message.message is required";
      return validTimestamp(event.timestamp, "agent_message.timestamp");
    case "split_update":
      if (!validAllocations(event.allocations)) return "split_update.allocations is invalid";
      if (!nonNegativeNumber(event.totalBudget)) return "split_update.totalBudget is invalid";
      return positiveInteger(event.round) ? undefined : "split_update.round is invalid";
    case "approval_requested":
      return validAllocations(event.allocations)
        ? undefined
        : "approval_requested.allocations is invalid";
    case "approval_given":
      return validTimestamp(event.timestamp, "approval_given.timestamp");
    case "choice_requested":
      if (!nonEmptyString(event.runId)) return "choice_requested.runId is required";
      if (!new Set(["flights", "stay", "food", "guide"]).has(event.agent)) {
        return "choice_requested.agent is invalid";
      }
      if (!nonNegativeNumber(event.slice)) return "choice_requested.slice is invalid";
      if (!Array.isArray(event.options) || event.options.length === 0) {
        return "choice_requested.options must be a non-empty array";
      }
      if (!event.options.every(validChoiceOption)) return "choice_requested.options is invalid";
      if (!new Set(["rating", "price"]).has(event.ranking)) {
        return "choice_requested.ranking is invalid";
      }
      return positiveInteger(event.timeoutSeconds)
        ? undefined
        : "choice_requested.timeoutSeconds is invalid";
    case "choice_made":
      if (!nonEmptyString(event.runId)) return "choice_made.runId is required";
      if (!new Set(["flights", "stay", "food", "guide"]).has(event.agent)) {
        return "choice_made.agent is invalid";
      }
      if (!nonEmptyString(event.optionId)) return "choice_made.optionId is required";
      if (!nonEmptyString(event.vendor)) return "choice_made.vendor is required";
      if (!positiveNumber(event.price)) return "choice_made.price is invalid";
      return new Set(["user", "agent-timeout"]).has(event.chosenBy)
        ? undefined
        : "choice_made.chosenBy is invalid";
    case "card_issued":
      if (!nonEmptyString(event.agent)) return "card_issued.agent is required";
      if (!nonEmptyString(event.cardId)) return "card_issued.cardId is required";
      return positiveNumber(event.amountCap) ? undefined : "card_issued.amountCap is invalid";
    case "purchase_result":
      if (!nonEmptyString(event.agent)) return "purchase_result.agent is required";
      if (!new Set(["success", "failed"]).has(event.status)) {
        return "purchase_result.status is invalid";
      }
      if (!nonNegativeNumber(event.amount)) return "purchase_result.amount is invalid";
      if (!nonEmptyString(event.merchant)) return "purchase_result.merchant is required";
      if (event.outcome !== undefined && !new Set(["simulated", "credential_issued", "checkout_completed", "checkout_failed"]).has(event.outcome)) {
        return "purchase_result.outcome is invalid";
      }
      return nonEmptyString(event.details) ? undefined : "purchase_result.details is required";
    case "blocked_attempt":
      if (!nonEmptyString(event.agent)) return "blocked_attempt.agent is required";
      if (!nonNegativeNumber(event.attemptedAmount)) {
        return "blocked_attempt.attemptedAmount is invalid";
      }
      if (!nonNegativeNumber(event.cap)) return "blocked_attempt.cap is invalid";
      return nonEmptyString(event.reason) ? undefined : "blocked_attempt.reason is required";
    case "renegotiation_triggered":
      if (!nonEmptyString(event.agent)) return "renegotiation_triggered.agent is required";
      return nonEmptyString(event.reason)
        ? undefined
        : "renegotiation_triggered.reason is required";
    case "final_receipt":
      if (!Array.isArray(event.purchases)) return "final_receipt.purchases must be an array";
      if (!nonNegativeNumber(event.totalSpent)) return "final_receipt.totalSpent is invalid";
      return nonNegativeNumber(event.budget) ? undefined : "final_receipt.budget is invalid";
    default:
      return "type must be a supported event type";
  }
}

function validChoiceOption(option) {
  return isObject(option)
    && nonEmptyString(option.optionId)
    && nonEmptyString(option.vendor)
    && nonEmptyString(option.description)
    && positiveNumber(option.price)
    && option.currency === "INR"
    && new Set(["live", "fixture"]).has(option.source);
}

function validAllocations(value) {
  return isObject(value) && ["flights", "stay", "food", "guide"].every(
    (key) => nonNegativeNumber(value[key]),
  );
}

function validTimestamp(value, field) {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value))
    ? undefined
    : `${field} must be an ISO timestamp`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function nonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}
