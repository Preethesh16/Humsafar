# INTERFACES.md — Locked Contracts Between the Three Roles

> Read this before writing code that touches another person's boundary. This file defines the exact shapes that let Jeswin, Preethesh, and Deepthi work in parallel without blocking each other. **If you need to change something here, don't just change your own code — edit this file first, flag it loudly in your progress.md, and ping the other two.** An unannounced change here is the #1 way this build gets a messy merge at hour 30.

Status: 🟢 LOCKED — decisions below were made to unblock parallel work immediately. If any of the three has a strong reason to change one, follow the rule in the paragraph above (edit this file, flag in progress.md, tell the other two) — don't just silently diverge.

---

## 1. `mintScopedCard` — Jeswin calls it, Preethesh implements it

```
mintScopedCard(mandateId: string, merchant: string, amountCap: number)
  -> Promise<{
       cardId: string,
       cardToken: string,      // what the specialist agent uses to check out
       merchant: string,       // echoed back, locked
       amountCap: number,      // echoed back, locked
       status: "issued" | "failed",
       error?: string
     }>
```

- Jeswin's orchestrator calls this once per specialist agent, after the mediator finalizes the split.
- Preethesh owns what happens inside it. The official Prava REST model allows repeated credential minting against an active mandate, but a `listed` mandate remains locked to the single merchant approved during setup. For the current API, Jeswin must therefore pass the mandate belonging to that specialist's merchant; the backend fails closed if the supplied merchant does not match the mandate registry. **The function signature above does not change.**
- `cardId` maps to Prava's `instructionId`, the stable identifier for the minted credential instruction. `cardToken` maps to `credentials.token`. Neither raw token nor dynamic CVV may be logged.
- The public function returns the exact object above. The lower-level Prava client uses the `{ data, source }` integration envelope from Section 4 internally; do not add `source` to this locked return shape without coordinating a contract change.
- If Preethesh's real implementation isn't ready yet, Jeswin should build against a stub that returns a fake `cardToken` and `status: "issued"` after a short delay, so his negotiation/orchestration logic isn't blocked.

---

## 2. Live event stream — Preethesh emits it, Deepthi consumes it

Transport: **SSE (Server-Sent Events)**. Decision: this stream is one-directional (server → dashboard); there's no need for the dashboard to push messages back over the same channel. SSE runs over plain HTTP, needs no special client library, reconnects automatically in the browser by default, and is far easier to debug mid-hackathon with `curl` than a WebSocket handshake. If a genuine two-way need shows up later (e.g. the dashboard sending a live user command back), add a separate plain POST endpoint for that rather than switching the whole stream to WebSocket.

Locked backend endpoints:

- `GET /api/events` — SSE stream for Deepthi. Events use `id:` plus one JSON `data:` line; reconnects may send `Last-Event-ID` and receive buffered events after that id.
- `POST /api/events` — server-to-server ingestion for Jeswin's agent layer. Body is exactly one event object from the shapes below; accepted events return `202`, invalid events return `400`.
- `POST /api/scoped-cards` — server-to-server card issuance. Body: `{ mandateId: string, merchant: string, amountCap: number }`; response is the exact `mintScopedCard` result from Section 1 (`201` for `issued`, `422` for `failed`).
- `POST /api/discovery/:category` — discovery for `flights`, `stay`, `food`, or `guide`; always returns the Section 4 `{ data, source }` envelope.
- `POST /api/trust/check` — pre-purchase trust decision. Body: `{ merchant: string, rating?: number }`; response is `{ data: { merchant, score, decision, reason }, source }`. Fixture trust is labeled and does not qualify as live Senso evidence.
- `POST /api/prava/mandate-sessions` — create one merchant-specific mandate approval session.
- `POST /api/prava/mandates/sync` — refresh the active mandate-to-merchant registry for a customer after approval.
- `POST /api/prava/mandates/:mandateId/charges/:transactionId/report` — report checkout success/failure to Prava.
- `GET /.well-known/agentfacts.json` and `POST /a2a/ping` — NANDA/AgentFacts discovery and basic A2A availability.

**How the agent layer consumes discovery and trust (Jeswin, 2026-08-01) — read if you change either route's response:**

- `POST /api/discovery/:category` responses have **no `merchant` field**, so the agent layer uses `vendor` as the merchant identifier — which is what a mandate gets registered against in `PRAVA_MANDATE_MERCHANTS_JSON`. If a distinct merchant identifier is added later, the agent layer will prefer it automatically; nothing else needs to change.
- **Duffel flight offers carry no `rating`.** They are treated as unrated (`0.0`), not given an invented score. Consequence: the flights agent prefers the cheapest offer and the mediator will not spend surplus budget "upgrading" a flight, because we have no evidence the pricier offer is better. This is deliberate — fabricating a rating to make the demo livelier would be fabricating data.
- Discovery falls back to the agent layer's local fixtures if the route is unreachable or returns an empty list, and the run prints the source each category *actually* resolved to. A fallback is never reported as live.
- `POST /api/trust/check` **materially changes the purchase**: a merchant that does not come back `allow` loses the sale to the next acceptable option inside the same slice. It is not a hard block — the current fixture heuristic labels itself as such, and an unreachable trust service is treated as advisory rather than a veto. When nothing clears, the agent proceeds and the flag is carried into `purchase_result.details` and the receipt entry.

The two POST routes accept `Authorization: Bearer <INTERNAL_API_TOKEN>` when that environment variable is configured. A non-loopback deployment must configure it. Never put Prava credentials in these request bodies.

Every event is a JSON object with a `type` field:

```
// An agent speaks during negotiation
{ type: "agent_message", agent: "flights" | "stay" | "food" | "guide" | "mediator" | "orchestrator",
  message: string, timestamp: string }

// The proposed split updates (any round)
{ type: "split_update", allocations: { flights: number, stay: number, food: number, guide: number },
  totalBudget: number, round: number }

// User approval requested / given
{ type: "approval_requested", allocations: {...} }
{ type: "approval_given", timestamp: string }

// A scoped card was minted for an agent
{ type: "card_issued", agent: string, cardId: string, amountCap: number }

// A purchase completed or failed
{ type: "purchase_result", agent: string, status: "success" | "failed", amount: number,
  merchant: string, details: string }

// Proof-shot events (for the two demo beats)
{ type: "blocked_attempt", agent: string, attemptedAmount: number, cap: number, reason: string }
{ type: "renegotiation_triggered", agent: string, reason: string }

// Final summary
{ type: "final_receipt", purchases: [...], totalSpent: number, budget: number }
```

**Producer-behaviour notes from the agent layer (Jeswin, 2026-08-01) — no shape changes, but Deepthi's rendering depends on them:**

- `split_update` **can be emitted more than once with the same `round` number.** After the agents converge, the mediator makes a final pass that spends leftover budget on upgrades, and that revised split is emitted against the same round. **Render the most recent `split_update`, don't key state by `round` alone.**
- `split_update.allocations` during rounds shows what the agents are *asking for*, which is deliberately allowed to exceed `totalBudget` in early rounds — that overflow is the negotiation beat and is worth showing visually. Only the final split is guaranteed to fit.
- `final_receipt` is always the **last** event of a run and is safe to use as the "run finished" signal. Nothing is emitted after it.
- Every category the goal did not use is sent as `0` rather than omitted, so all four keys are always present. Goals needing a category outside the locked four would arrive as an *extra* key alongside them; the current MVP goals never do this.
- Each entry in `final_receipt.purchases` carries `source: "live" | "fixture"` and a `details` string. Anything with `source: "fixture"` must be labelled as simulated in the UI — it is not a completed live order.

- Deepthi builds her dashboard against a **mocked stream** matching this exact shape first — don't wait for Preethesh's real backend.
- If Preethesh needs to add a field mid-build, he edits this file, adds the field, and flags it in his progress.md — he does not silently ship a differently-shaped event.

---

## 3. Fixture data shape — Guide/Activities and Food (Preethesh owns, others may read)

```
{
  category: "guide" | "food",
  vendor: string,
  description: string,
  price: number,
  currency: "INR",
  rating: number,        // out of 5, mirrors real Viator/OpenTable shape
  source: "fixture"      // ALWAYS present — never omit this, it's what makes
                          // the disclosure honest in the submission
}
```

---

## 4. Credential-degradation adapter — response envelope (Preethesh owns, others may read)

Every external call (Prava, Duffel, Senso, NANDA) returns:

```
{
  data: <actual response shape for that integration>,
  source: "live" | "fixture",   // ALWAYS present, and logged server-side too
}
```

Deepthi's dashboard should surface `source` in the UI (a small "live" / "fixture" tag per result). A fixture may support discovery/demo resilience, but it must never be presented as evidence that a payment completed.

---

## 5. Negotiation convergence rule (Jeswin owns, others may read)

**Locked rule:** negotiation ends as soon as EITHER of these is true:
1. The current proposed split sums to ≤ total budget AND no agent's stated minimum viable ask has been violated — this is the "clean" success exit.
2. **5 rounds** have passed without reaching (1) — the mediator then forces a compromise: give every agent its stated minimum viable ask first, then distribute whatever budget remains above the sum of minimums proportionally across agents by their original requested share (not equally) — so an agent that argued for a bigger slice still gets proportionally more of the leftover, it just doesn't get its full ask.

Why 5 rounds and this specific fallback: 5 is enough for a few real rounds of push-back to play out on screen during the ~45s negotiation beat in the demo without risking it running long or stalling out live in front of judges. Minimums-first-then-proportional is simple to implement, always terminates, always fits the budget by construction, and is easy to narrate out loud during the demo ("everyone got their floor, then the rest split by how hard they argued for it").

**AMENDMENT (Jeswin, 2026-08-01) — rule 2 had a hole: what if the minimums alone exceed the budget?** Rule 2 says "give every agent its stated minimum viable ask first, then distribute whatever budget remains". If the sum of the minimums is already greater than the total budget there *is* no remainder, and the rule taken literally allocates more money than the user has — the exact failure the whole product claims to make impossible. It is reachable with an ordinary input: "Goa trip under ₹9,000" when the cheapest option in each category sums to ₹16,100.

Added third exit, implemented in `Mediator.forced_compromise`:

3. **Budget below the viable floor** — if `sum(minimums) > budget`, scale every minimum down proportionally so the allocation sums to exactly the budget, and have the mediator state plainly that the budget is below what the plan needs and by how much. Exit reason `budget_below_floor`. The downstream effect is that at least one specialist reports "I can't buy anything with this slice" rather than the system silently overspending or inventing a cheaper option that does not exist.

This does not change any function signature or event shape — it is a new terminating branch of a rule that previously had undefined behaviour. Covered by `agents/tests/test_negotiation.py`, including a sweep asserting the allocation never exceeds the budget for every budget from ₹5,000 to ₹60,000.

---

## How to use this file
This is already 🟢 LOCKED so all three of you can start in parallel right now with zero setup meeting. Skim it once (5 minutes, not 15) so everyone's seen the same contract, then split off.

Any change to a locked interface still requires editing this file + a progress.md flag + telling the other two directly, not just committing and hoping they notice.
