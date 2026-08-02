/**
 * Folds the locked INTERFACES.md Section 2 event stream into dashboard state.
 *
 * Deliberately framework-free and pure so it can be unit-tested with
 * `node --test` without a DOM. Every event shape handled here is copied from
 * INTERFACES.md; if Preethesh adds a field there, extend this file — do not
 * start reading fields that are not in the locked contract.
 *
 * Unknown event types are NOT dropped: they still land in the audit log, so an
 * event added mid-build shows up on screen instead of silently vanishing.
 */

export const AGENTS = ["flights", "stay", "food", "guide"];

export const PHASES = {
  IDLE: "idle",
  NEGOTIATING: "negotiating",
  CHOOSING: "choosing",
  AWAITING_APPROVAL: "awaiting_approval",
  PURCHASING: "purchasing",
  COMPLETE: "complete",
};

export function initialState() {
  return {
    phase: PHASES.IDLE,
    totalBudget: null,
    round: 0,
    allocations: {},
    messages: [],
    approval: {
      requested: false,
      requestedAllocations: null,
      given: false,
      givenAt: null,
      // §7 correlation. Without all three of runId/approvalRequestId/digest the
      // UI must not offer an approve button — the backend fails closed on a
      // mismatch, so a request we cannot correlate is one we cannot answer.
      runId: null,
      approvalRequestId: null,
      digest: null,
      expiresAt: null,
      requestedChoices: {},
    },
    // INTERFACES.md §6. `requested` is keyed by agent; `made` records who
    // decided, because a timed-out auto-pick must never render as a human
    // choice.
    choice: { requested: {}, made: {} },
    cards: {},
    purchases: [],
    blockedAttempts: [],
    renegotiations: [],
    receipt: null,
    audit: [],
    /** Highest SSE id seen; used for Last-Event-ID reconnect de-duplication. */
    lastEventId: 0,
  };
}

/**
 * @param {object} state
 * @param {{ id?: number, event: object }} envelope one stream frame
 */
export function reduce(state, envelope) {
  if (envelope?.reset) return initialState();
  const { id = null, event } = envelope ?? {};
  if (!event || typeof event.type !== "string") return state;

  // Replay after reconnect can re-deliver frames we already folded in.
  if (id !== null && id <= state.lastEventId) return state;

  const next = {
    ...state,
    lastEventId: id !== null ? id : state.lastEventId,
    audit: [...state.audit, { id, event, seq: state.audit.length + 1 }],
  };

  switch (event.type) {
    case "agent_message":
      return {
        ...next,
        phase: next.phase === PHASES.IDLE ? PHASES.NEGOTIATING : next.phase,
        messages: [
          ...next.messages,
          {
            key: `${id ?? next.messages.length}-msg`,
            agent: event.agent,
            message: event.message,
            timestamp: event.timestamp,
            round: next.round,
          },
        ],
      };

    case "split_update":
      return {
        ...next,
        phase: next.phase === PHASES.IDLE ? PHASES.NEGOTIATING : next.phase,
        allocations: { ...event.allocations },
        totalBudget: event.totalBudget ?? next.totalBudget,
        round: event.round ?? next.round,
      };

    case "choice_requested":
      return {
        ...next,
        phase: next.phase === PHASES.COMPLETE ? next.phase : PHASES.CHOOSING,
        runId: event.runId ?? next.runId ?? null,
        choice: {
          ...next.choice,
          requested: {
            ...next.choice.requested,
            [event.agent]: {
              agent: event.agent,
              slice: event.slice,
              options: Array.isArray(event.options) ? event.options : [],
              // "Top rated" over a list with no ratings is a false claim, so
              // the basis travels with the list and the UI must render it.
              ranking: event.ranking === "rating" ? "rating" : "price",
              timeoutSeconds: event.timeoutSeconds ?? null,
            },
          },
        },
      };

    case "choice_made":
      return {
        ...next,
        choice: {
          ...next.choice,
          made: {
            ...next.choice.made,
            [event.agent]: {
              optionId: event.optionId,
              vendor: event.vendor,
              price: event.price,
              // "user" or "agent-timeout" — never collapse the two.
              chosenBy: event.chosenBy === "user" ? "user" : "agent-timeout",
            },
          },
        },
      };

    case "approval_requested":
      return {
        ...next,
        phase: PHASES.AWAITING_APPROVAL,
        allocations: event.allocations ? { ...event.allocations } : next.allocations,
        approval: {
          ...next.approval,
          requested: true,
          requestedAllocations: event.allocations ? { ...event.allocations } : null,
          runId: event.runId ?? null,
          approvalRequestId: event.approvalRequestId ?? null,
          digest: event.digest ?? null,
          expiresAt: event.expiresAt ?? null,
          requestedChoices: event.choices ? { ...event.choices } : {},
          // A fresh request supersedes any earlier decision for this run.
          given: false,
          givenAt: null,
        },
      };

    case "approval_given":
      return {
        ...next,
        phase: PHASES.PURCHASING,
        approval: {
          ...next.approval,
          given: true,
          givenAt: event.timestamp ?? null,
          runId: event.runId ?? next.approval.runId,
          approvalRequestId: event.approvalRequestId ?? next.approval.approvalRequestId,
          digest: event.digest ?? next.approval.digest,
        },
      };

    case "card_issued":
      return {
        ...next,
        phase: next.phase === PHASES.COMPLETE ? next.phase : PHASES.PURCHASING,
        cards: {
          ...next.cards,
          [event.agent]: {
            agent: event.agent,
            cardId: event.cardId,
            amountCap: event.amountCap,
          },
        },
      };

    case "purchase_result":
      return {
        ...next,
        purchases: [
          ...next.purchases,
          {
            key: `${id ?? next.purchases.length}-purchase`,
            agent: event.agent,
            status: event.status,
            amount: event.amount,
            merchant: event.merchant,
            details: event.details,
            // INTERFACES.md Section 4 envelope tag. Optional on this event, so
            // it is read tolerantly — absent means "not stated", never "live".
            source: event.source ?? null,
            outcome: event.outcome ?? null,
          },
        ],
      };

    case "blocked_attempt":
      return {
        ...next,
        blockedAttempts: [
          ...next.blockedAttempts,
          {
            key: `${id ?? next.blockedAttempts.length}-blocked`,
            agent: event.agent,
            attemptedAmount: event.attemptedAmount,
            cap: event.cap,
            reason: event.reason,
          },
        ],
      };

    case "renegotiation_triggered":
      return {
        ...next,
        phase: PHASES.NEGOTIATING,
        renegotiations: [
          ...next.renegotiations,
          {
            key: `${id ?? next.renegotiations.length}-reneg`,
            agent: event.agent,
            reason: event.reason,
          },
        ],
      };

    case "final_receipt":
      return {
        ...next,
        phase: PHASES.COMPLETE,
        receipt: {
          purchases: event.purchases ?? [],
          totalSpent: event.totalSpent,
          budget: event.budget,
        },
        totalBudget: event.budget ?? next.totalBudget,
      };

    default:
      // Kept in the audit log by the `next` spread above.
      return next;
  }
}

/** Derived numbers the header and split chart both need. */
export function summarize(state) {
  const allocated = AGENTS.reduce((sum, agent) => sum + (state.allocations[agent] ?? 0), 0);
  const committedCaps = Object.values(state.cards).reduce((sum, c) => sum + (c.amountCap ?? 0), 0);
  const spent = state.purchases
    .filter((p) => p.status === "success")
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const budget = state.totalBudget ?? 0;

  return {
    budget,
    allocated,
    committedCaps,
    spent,
    unallocated: Math.max(budget - allocated, 0),
    overBudget: budget > 0 && allocated > budget,
    failedPurchases: state.purchases.filter((p) => p.status === "failed").length,
  };
}
