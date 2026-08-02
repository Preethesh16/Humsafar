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
  // INTERFACES.md §6. Without these the allow-list rejects them with a 400 and
  // the choice step never reaches the dashboard — "additive" holds for fields,
  // not for event types.
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
    case "choice_requested":
      if (!nonEmptyString(event.runId)) return "choice_requested.runId is required";
      if (!AGENTS.has(event.agent)) return "choice_requested.agent is invalid";
      if (!nonNegativeNumber(event.slice)) return "choice_requested.slice is invalid";
      if (!Array.isArray(event.options)) return "choice_requested.options must be an array";
      // The ranking basis is a correctness claim: "top rated" over an unrated
      // list is false, so an unknown basis is rejected rather than defaulted.
      return new Set(["rating", "price"]).has(event.ranking)
        ? undefined
        : "choice_requested.ranking must be rating or price";
    case "choice_made":
      if (!nonEmptyString(event.runId)) return "choice_made.runId is required";
      if (!AGENTS.has(event.agent)) return "choice_made.agent is invalid";
      if (!nonEmptyString(event.optionId)) return "choice_made.optionId is required";
      // A timed-out auto-pick must never be recorded as a human decision.
      return new Set(["user", "agent-timeout"]).has(event.chosenBy)
        ? undefined
        : "choice_made.chosenBy must be user or agent-timeout";
    case "final_receipt":
      if (!Array.isArray(event.purchases)) return "final_receipt.purchases must be an array";
      if (!nonNegativeNumber(event.totalSpent)) return "final_receipt.totalSpent is invalid";
      return nonNegativeNumber(event.budget) ? undefined : "final_receipt.budget is invalid";
    default:
      return "type must be a supported event type";
  }
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
