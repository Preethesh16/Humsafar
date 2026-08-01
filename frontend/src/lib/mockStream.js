/**
 * ============================ MOCKED DATA — NOT REAL ============================
 *
 * A scripted replay of brainstorming.md Section 7's demo beats, emitted in the
 * exact event shapes locked in INTERFACES.md Section 2.
 *
 * This exists so the dashboard can be built and rehearsed before Jeswin's agent
 * layer emits real events. NOTHING here is a real transaction, a real Prava
 * card, or a real merchant response. The UI must render a loud "MOCKED" banner
 * whenever this source is active — per Preethesh's progress log, fixture or
 * failed card issuance must never be presented as a completed live payment,
 * and the hackathon rules make a mocked payment shown as real a disqualifier.
 *
 * Swap to the live stream with the "Live backend" toggle (or ?source=live).
 * ==============================================================================
 */

const BUDGET = 30000;

/** [delayMsBeforeThisEvent, event] */
const SCRIPT = [
  [300, { type: "agent_message", agent: "orchestrator", message: "Goal received: plan a Goa trip under ₹30,000. Spinning up four specialists to negotiate the split.", timestamp: iso(0) }],
  [500, { type: "split_update", allocations: { flights: 12000, stay: 11000, food: 6000, guide: 5000 }, totalBudget: BUDGET, round: 1 }],
  [400, { type: "agent_message", agent: "flights", message: "Return fares BLR–GOI are ₹11,800 on the dates that work. I need ₹12,000 or the trip doesn't happen at all.", timestamp: iso(2) }],
  [700, { type: "agent_message", agent: "stay", message: "Three nights near Anjuna is ₹11,000. Flights is asking for a third of the pot before anyone else has spoken.", timestamp: iso(4) }],
  [700, { type: "agent_message", agent: "food", message: "₹6,000 across three days is ₹667 a meal. That is not a Goa food budget, that is an airport food budget.", timestamp: iso(6) }],
  [700, { type: "agent_message", agent: "guide", message: "Two activities minimum — a dolphin trip and one heritage walk. ₹5,000 is my floor, not my ask.", timestamp: iso(8) }],
  [600, { type: "agent_message", agent: "mediator", message: "Round 1 sums to ₹34,000 against a ₹30,000 budget. Over by ₹4,000. Everyone restate a minimum viable ask.", timestamp: iso(10) }],
  [500, { type: "split_update", allocations: { flights: 11800, stay: 9500, food: 5200, guide: 4500 }, totalBudget: BUDGET, round: 2 }],
  [600, { type: "agent_message", agent: "stay", message: "Dropping to a guesthouse in Vagator gets me to ₹9,500. That is my floor with a private room.", timestamp: iso(12) }],
  [700, { type: "agent_message", agent: "flights", message: "₹11,800 is the actual fare. I cannot negotiate with an airline, so my number is fixed.", timestamp: iso(14) }],
  [600, { type: "agent_message", agent: "mediator", message: "Round 2 sums to ₹31,000. Still ₹1,000 over. Flights is a hard cost, so the remainder comes from the flexible three.", timestamp: iso(16) }],
  [500, { type: "split_update", allocations: { flights: 11800, stay: 9200, food: 5000, guide: 4000 }, totalBudget: BUDGET, round: 3 }],
  [600, { type: "agent_message", agent: "mediator", message: "Round 3 sums to ₹30,000 and no stated minimum is violated. Convergence condition 1 met — negotiation closed in 3 of 5 rounds.", timestamp: iso(18) }],
  [400, { type: "approval_requested", allocations: { flights: 11800, stay: 9200, food: 5000, guide: 4000 } }],
  [1600, { type: "approval_given", timestamp: iso(21) }],
  [400, { type: "agent_message", agent: "orchestrator", message: "Approved. Minting one merchant-scoped Prava credential per agent, each capped at its agreed slice.", timestamp: iso(22) }],
  [400, { type: "card_issued", agent: "flights", cardId: "instr_mock_flights_01", amountCap: 11800 }],
  [250, { type: "card_issued", agent: "stay", cardId: "instr_mock_stay_01", amountCap: 9200 }],
  [250, { type: "card_issued", agent: "food", cardId: "instr_mock_food_01", amountCap: 5000 }],
  [250, { type: "card_issued", agent: "guide", cardId: "instr_mock_guide_01", amountCap: 4000 }],
  [700, { type: "purchase_result", agent: "flights", status: "success", amount: 11800, merchant: "Duffel Test Airways", details: "BLR → GOI return, 2 pax, 12–15 Sep", source: "fixture" }],
  [800, { type: "purchase_result", agent: "stay", status: "success", amount: 9200, merchant: "Duffel Stays Sandbox", details: "Vagator guesthouse, 3 nights, private room", source: "fixture" }],
  // Demo proof shot #1 — the card network refuses an over-cap charge.
  [900, { type: "blocked_attempt", agent: "food", attemptedAmount: 6400, cap: 5000, reason: "Charge exceeds the scoped credential's amount cap and was declined at the card network." }],
  [600, { type: "agent_message", agent: "food", message: "My ₹6,400 tasting-menu attempt was declined at the card, not by me. Falling back to a plan that fits ₹5,000.", timestamp: iso(30) }],
  [700, { type: "purchase_result", agent: "food", status: "success", amount: 4850, merchant: "OpenTable-shaped fixture", details: "3 dinner reservations, Vagator + Assagao", source: "fixture" }],
  // Demo proof shot #2 — one booking fails and only that slice is redone.
  [800, { type: "purchase_result", agent: "guide", status: "failed", amount: 0, merchant: "Viator-shaped fixture", details: "Dolphin trip sold out for the selected date.", source: "fixture" }],
  [500, { type: "renegotiation_triggered", agent: "guide", reason: "Guide booking failed; re-negotiating only the guide slice, leaving three settled purchases untouched." }],
  [700, { type: "agent_message", agent: "mediator", message: "Only guide's ₹4,000 slice reopens. ₹150 unspent from food rolls in, so guide now has ₹4,150.", timestamp: iso(36) }],
  [500, { type: "split_update", allocations: { flights: 11800, stay: 9200, food: 4850, guide: 4150 }, totalBudget: BUDGET, round: 4 }],
  [400, { type: "card_issued", agent: "guide", cardId: "instr_mock_guide_02", amountCap: 4150 }],
  [800, { type: "purchase_result", agent: "guide", status: "success", amount: 4150, merchant: "Viator-shaped fixture", details: "Fort Aguada heritage walk + sunset cruise", source: "fixture" }],
  // Receipt lines carry `status` and `source` exactly as the agent core's
  // `_close()` emits them (INTERFACES.md §2 producer notes), so the mocked
  // receipt exercises the same labelling path as a real run.
  [700, { type: "final_receipt", purchases: [
    { agent: "flights", merchant: "Duffel Test Airways", amount: 11800, status: "success", source: "fixture", details: "BLR → GOI return, 2 pax" },
    { agent: "stay", merchant: "Duffel Stays Sandbox", amount: 9200, status: "success", source: "fixture", details: "Vagator guesthouse, 3 nights" },
    { agent: "food", merchant: "OpenTable-shaped fixture", amount: 4850, status: "success", source: "fixture", details: "3 dinner reservations" },
    { agent: "guide", merchant: "Viator-shaped fixture", amount: 4150, status: "success", source: "fixture", details: "Heritage walk + sunset cruise" },
  ], totalSpent: 30000, budget: BUDGET }],
];

function iso(offsetSeconds) {
  return new Date(Date.UTC(2026, 7, 1, 9, 0, offsetSeconds)).toISOString();
}

/**
 * Replays the script, calling `onFrame({ id, event })` in stream order.
 * Returns a cancel function with the same contract as the live stream.
 *
 * @param {(frame: { id: number, event: object }) => void} onFrame
 * @param {{ speed?: number }} [options] speed multiplier; 2 = twice as fast
 */
export function startMockStream(onFrame, { speed = 1 } = {}) {
  let cancelled = false;
  let timer = null;
  let index = 0;
  let id = 0;

  const step = () => {
    if (cancelled || index >= SCRIPT.length) return;
    const [delay, event] = SCRIPT[index++];
    timer = setTimeout(() => {
      if (cancelled) return;
      onFrame({ id: ++id, event });
      step();
    }, Math.max(delay / speed, 0));
  };

  step();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

/** The scripted events without their delays — used by render/reducer tests. */
export const MOCK_EVENTS = SCRIPT.map(([, event]) => event);
export const MOCK_SCRIPT_LENGTH = SCRIPT.length;
