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
       transactionId: string | null,
       dynamicCvv: string,
       expiryMonth: string,
       expiryYear: string,
       merchant: string,       // echoed back, locked
       amountCap: number,      // echoed back, locked
       status: "issued" | "failed",
       source: "sandbox",
       errorCode?: string,
       error?: string
     }>
```

- Jeswin's orchestrator calls this once per specialist agent, after the mediator finalizes the split.
- Preethesh owns what happens inside it. The official Prava REST model allows repeated credential minting against an active mandate, but a `listed` mandate remains locked to the single merchant approved during setup. For the current API, Jeswin must therefore pass the mandate belonging to that specialist's merchant; the backend fails closed if the supplied merchant does not match the mandate registry. **The function signature above does not change.**
- `cardId` maps to Prava's `instructionId`. `cardToken`, `dynamicCvv`, and expiry are transient checkout credentials. `transactionId` is `null` when Prava does not return one; never substitute `instructionId`, because the report endpoint distinguishes them.
- Every credential field must be removed by Jeswin's `ScopedCard.safe()` before logging, events, receipts, exceptions, or traces. A failed result returns empty credential strings, `transactionId: null`, and a structured `errorCode` such as `THRESHOLD_EXCEEDED`, `MANDATE_NOT_ACTIVE`, or `SCOPED_CARD_REJECTED`.
- `source: "sandbox"` describes the payment environment. It does not mean checkout succeeded: `status: "issued"` means only that Prava issued credentials awaiting a merchant/processor result.
- If Preethesh's real implementation isn't ready yet, Jeswin should build against a stub that returns a fake `cardToken` and `status: "issued"` after a short delay, so his negotiation/orchestration logic isn't blocked.

---

## 2. Live event stream — Preethesh emits it, Deepthi consumes it

Transport: **SSE (Server-Sent Events)**. Decision: this stream is one-directional (server → dashboard); there's no need for the dashboard to push messages back over the same channel. SSE runs over plain HTTP, needs no special client library, reconnects automatically in the browser by default, and is far easier to debug mid-hackathon with `curl` than a WebSocket handshake. If a genuine two-way need shows up later (e.g. the dashboard sending a live user command back), add a separate plain POST endpoint for that rather than switching the whole stream to WebSocket.

Locked backend endpoints:

- `GET /api/events?runId=<runId>` — SSE stream for Deepthi. Events use `id:` plus one JSON `data:` line; reconnects may send `Last-Event-ID` and receive buffered events after that id. A supplied `runId` filters both replay and live delivery so one browser run cannot consume another run's events.
- `POST /api/events` — server-to-server ingestion for Jeswin's agent layer. Body is exactly one event object from the shapes below; accepted events return `202`, invalid events return `400`.
- `POST /api/scoped-cards` — server-to-server card issuance. Body: `{ mandateId: string, merchant: string, amountCap: number }`; response is the exact `mintScopedCard` result from Section 1 (`201` for `issued`, `422` for `failed`).
- `POST /api/discovery/:category` — discovery for `flights`, `stay`, `food`, or `guide`; always returns the Section 4 `{ data, source }` envelope.
- `POST /api/trust/check` — pre-purchase trust decision. Body: `{ merchant: string, rating?: number }`; response is `{ data: { merchant, score, decision, reason }, source }`. Fixture trust is labeled and does not qualify as live Senso evidence.
- `POST /api/prava/mandate-sessions` — create one merchant-specific mandate approval session.
- `POST /api/prava/mandates/sync` — refresh the active mandate-to-merchant registry for a customer after approval.
- `GET /api/prava/mandates/resolve?merchant=<name>` — internal merchant-to-mandate lookup. Returns `{ data: { mandateId, merchant }, source: "sandbox" }`, `404 MANDATE_NOT_FOUND`, or fails closed on ambiguity. Python uses this source of truth instead of copying backend state into environment variables.
- `POST /api/prava/mandates/:mandateId/charges/:transactionId/report` — report checkout success/failure to Prava.
- `POST /api/approvals/requests`, `GET /api/approvals/:approvalRequestId`, `POST /api/approvals/:approvalRequestId/decision`, and `POST /api/approvals/:approvalRequestId/consume` — the run-scoped approval protocol locked in Section 7.
- `GET /.well-known/agentfacts.json` and `POST /a2a/ping` — NANDA/AgentFacts discovery and basic A2A availability.

**How the agent layer consumes discovery and trust (Jeswin, 2026-08-01) — read if you change either route's response:**

- `POST /api/discovery/:category` responses have **no `merchant` field**, so the agent layer uses `vendor` as the merchant identifier — which is what a mandate gets registered against in `PRAVA_MANDATE_MERCHANTS_JSON`. If a distinct merchant identifier is added later, the agent layer will prefer it automatically; nothing else needs to change.
- **Live Duffel flight offers carry no `rating`.** They are treated as unrated (`0.0`), not given an invented score. Consequence: on live Duffel data the flights agent prefers the cheapest offer and the mediator will not spend surplus budget "upgrading" a flight, because we have no evidence the pricier offer is better. The explicitly labeled offline flight fixtures do carry scripted preference scores so the deterministic demo can exercise negotiation; those scores must never be copied onto a live Duffel response or presented as live ratings.
- Discovery falls back to the agent layer's local fixtures if the route is unreachable or returns an empty list, and the run prints the source each category *actually* resolved to. A fallback is never reported as live.
- `POST /api/trust/check` **materially changes the purchase**: a merchant that does not come back `allow` loses the sale to the next acceptable option inside the same slice. It is not a hard block — the current fixture heuristic labels itself as such, and an unreachable trust service is treated as advisory rather than a veto. When nothing clears, the agent proceeds and the flag is carried into `purchase_result.details` and the receipt entry.

The two POST routes accept `Authorization: Bearer <INTERNAL_API_TOKEN>` when that environment variable is configured. A non-loopback deployment must configure it. Never put Prava credentials in these request bodies.

Every event is a JSON object with a `type` field. Browser-started runs also carry
the same non-empty `runId` on **every** event, not only approval and choice
events, so the SSE hub can enforce run isolation:

```
// An agent speaks during negotiation
{ type: "agent_message", agent: "flights" | "stay" | "food" | "guide" | "mediator" | "orchestrator",
  message: string, timestamp: string }

// The proposed split updates (any round)
{ type: "split_update", allocations: { flights: number, stay: number, food: number, guide: number },
  totalBudget: number, round: number }

// User approval requested / given
{ type: "approval_requested", runId: string, approvalRequestId: string,
  digest: string, allocations: {...}, expiresAt: string }
{ type: "approval_given", runId: string, approvalRequestId: string,
  digest: string, timestamp: string }

// A scoped card was minted for an agent
{ type: "card_issued", agent: string, cardId: string, amountCap: number }

// A purchase completed or failed
{ type: "purchase_result", agent: string, status: "success" | "failed", amount: number,
  merchant: string, details: string, source: "fixture" | "sandbox" | "production",
  outcome?: "simulated" | "credential_issued" | "checkout_completed" | "checkout_failed" }

// Proof-shot events (for the two demo beats)
{ type: "blocked_attempt", agent: string, attemptedAmount: number, cap: number, reason: string }
{ type: "renegotiation_triggered", agent: string, reason: string }

// Final summary
{ type: "final_receipt", purchases: [...], totalSpent: number, budget: number }
```

Migration note: the backend event validator temporarily accepts the earlier
uncorrelated approval event shape so the already-merged demo does not stop
running while Jeswin updates his producer. New code must emit the correlated
shape above; legacy acceptance is removed after his branch lands.

**Producer-behaviour notes from the agent layer (Jeswin, 2026-08-01) — no shape changes, but Deepthi's rendering depends on them:**

- `split_update` **can be emitted more than once with the same `round` number.** After the agents converge, the mediator makes a final pass that spends leftover budget on upgrades, and that revised split is emitted against the same round. **Render the most recent `split_update`, don't key state by `round` alone.**
- `split_update.allocations` during rounds shows what the agents are *asking for*, which is deliberately allowed to exceed `totalBudget` in early rounds — that overflow is the negotiation beat and is worth showing visually. Only the final split is guaranteed to fit.
- `final_receipt` is always the **last** event of a run and is safe to use as the "run finished" signal. Nothing is emitted after it.
- Every category the goal did not use is sent as `0` rather than omitted, so all four keys are always present. Goals needing a category outside the locked four would arrive as an *extra* key alongside them; the current MVP goals never do this.
- Each entry in `final_receipt.purchases` carries `source: "fixture" | "sandbox" | "production"`, `outcome`, and a `details` string. `sandbox` says where the attempt happened, not whether it succeeded; `outcome: "credential_issued"` is authorization only and must never render as a checkout. Anything with `source: "fixture"` must be labelled as simulated — it is not a completed order.

- Deepthi builds her dashboard against a **mocked stream** matching this exact shape first — don't wait for Preethesh's real backend.
- If Preethesh needs to add a field mid-build, he edits this file, adds the field, and flags it in his progress.md — he does not silently ship a differently-shaped event.
- **Clarification (Deepthi, 2026-08-01, no shape changed):** `purchase_result` may optionally carry the Section 4 `source: "live" | "fixture"` tag. It is **optional** — the dashboard reads it tolerantly and renders a missing tag as "source unverified", never as live. Emitting it is encouraged because it is what makes the demo's honesty story concrete per purchase.
- **Unknown event types are safe to add.** The dashboard routes any unrecognised `type` straight to the audit log instead of discarding it, so a new event shows on screen the moment it is emitted — but it still needs an entry here before anyone renders it specially.
- **CORS / transport note:** `EventSource` cannot send custom headers, so `GET /api/events` must stay unauthenticated and same-origin. Deepthi's Vite dev server proxies `/api` and `/health` to `127.0.0.1:3000` rather than requiring CORS headers on the backend; a deployed build must be served from the same origin as the API.

---

## 3. Fixture data shape — offline discovery (Preethesh owns, others may read)

```
{
  category: "flights" | "stay" | "guide" | "food",
  vendor: string,
  description: string,
  price: number,
  currency: "INR",
  rating: number,        // out of 5; a scripted preference score on offline fixtures
  source: "fixture"      // ALWAYS present — never omit this, it's what makes
                          // the disclosure honest in the submission
}
```

The default Goa fixture set is also a tested demo invariant: for a ₹30,000 budget, the cheapest complete four-category plan must fit while the sum of each agent's highest-rated choice must exceed the budget. As of 2026-08-01 those totals are ₹16,100 and ₹35,600 respectively. This guarantees genuine price-option concessions instead of a round-one rubber stamp. These are synthetic demo fixtures, not market quotes; `source: "fixture"` remains mandatory on every row.

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

## 6. Human choice step — "the agent picks the budget, the user picks the taste"

Status: 🟢 **LOCKED AS AN ADDITIVE, POST-PRAVA-GATE CONTRACT.** Accepted by Preethesh 2026-08-01 with mandatory `runId` correlation. Implementation remains deferred until genuine Prava evidence exists; the current flow keeps working if the feature is cut.

### Why

Today the mediator fixes each slice and the specialist then picks the option itself. That silently assumes the agent can predict human taste, which it cannot — two rooms at the same price are not interchangeable to a person. This step keeps the *money* decision with the agents (which is the product) and hands the *taste* decision to the user (which is not).

### Where it goes in the flow

```
negotiate → mediator finalises the split → [NEW: user picks one option per category] → mint scoped cards → buy
```

It sits **after** allocation and **before** card minting, so the user never picks something the budget cannot cover, and no credential is minted for an option that is about to change.

### 6.1 `choice_requested` — Jeswin emits, Deepthi renders

One per category, after the split is final.

```
{ type: "choice_requested",
  runId: string,
  agent: "flights" | "stay" | "food" | "guide",
  slice: number,              // the agreed budget for this category, rupees
  options: [ {
    optionId: string,         // stable within a run; what the user sends back
    vendor: string,
    description: string,
    price: number,            // rupees, must be <= slice
    currency: "INR",
    rating: number | null,    // null when genuinely unrated — NEVER invent one
    ratingBasis: "star" | "fixture-score" | null,
    photos: [ { url: string, caption?: string } ],   // may be empty
    source: "live" | "fixture",
    environment: "test" | "production" | null        // see 6.5
  } ],
  ranking: "rating" | "price",   // how the list was ordered, and why (see 6.4)
  timeoutSeconds: number }        // after this, the agent picks — see 6.6
```

### 6.2 `choice_made` — emitted after the user decides, for the audit trail

```
{ type: "choice_made", runId: string, agent: string, optionId: string, vendor: string,
  price: number, chosenBy: "user" | "agent-timeout" }
```

`chosenBy` is not decoration. A timed-out auto-pick must never be presented as a human decision.

### 6.3 `POST /api/choices` — Preethesh implements, Deepthi calls

Body: `{ runId: string, agent: string, optionId: string }`. Returns `202` on accept, `400` for an option that was not offered, `404` for an unknown run/agent pair, and `409` if that category is expired, submitted, or settled.

`GET /api/choices?runId&agent` returns `{ data: { optionId } }` after a browser selection and `204` while no selection exists. The backend opens this state only after accepting the corresponding validated `choice_requested` event and settles it on `choice_made`, including an agent timeout.

Client-to-server needs its own POST because the SSE stream stays one-directional (§2). Preethesh's decision is explicit `runId` correlation rather than global single-active-run state, so a delayed click can never mutate a later run.

### 6.4 Ranking rule — this is a correctness constraint, not a preference

- Rank by `rating` **only where a real rating exists**. Duffel stays return one; **Duffel flight offers do not** (§2 producer notes). 
- Where nothing real exists, rank by price and set `ranking: "price"`. 
- The UI must say which was used. "Top rated" over a list that has no ratings is a false claim.
- **No invented ratings, ever**, and fixture preference scores must never be copied onto a live response — this is already locked in §3 and applies here unchanged.

### 6.5 `environment` — the test-inventory honesty problem

Duffel's free test mode returns **test inventory** (placeholder airlines and properties), not real bookable ones. It is a genuine live API call, so `source: "live"` is accurate — but calling it "live" alone would imply real market data.

So a live-sourced option also carries `environment`, and the UI must label test inventory distinctly from production inventory. A test-mode property is not a real hotel, and the demo must not imply otherwise.

### 6.6 Timeout, because a live demo cannot hang

If no choice arrives within `timeoutSeconds`, the agent picks the top-ranked option itself and emits `choice_made` with `chosenBy: "agent-timeout"`. The run never blocks waiting for a human who has walked away. Deepthi shows the countdown; the receipt distinguishes user-chosen from auto-chosen.

### 6.7 What is NOT possible — settled, do not spend time re-litigating

- **Embedding a real booking site in an iframe.** Booking.com, Airbnb, Expedia, MakeMyTrip and Agoda all send `X-Frame-Options` / `frame-ancestors` headers that make the browser refuse to render them inside our page. This cannot be worked around from our side. Use an in-app preview panel; optionally a real pop-up window via `window.open`.
- **Opening "the property's own website" for a Duffel stay.** Duffel *is* the booking channel; there is generally no external property page to link to. The photos and description come from Duffel itself.
- **Ranking by analysing review text.** We have no reviews API and no review text anywhere. We can rank by the rating numbers we genuinely receive. Claiming we analysed reviews would be fabricated evidence of the exact kind §3 and the handbook already prohibit.

### 6.8 Who does what

| Owner | Work |
|---|---|
| **Preethesh** | `POST /api/choices`; run/choice tracking; pass through Duffel Stays `photos`, which discovery currently parses and discards; add a stable `optionId`; carry `environment` alongside `source`; return enough options per category to make a shortlist meaningful |
| **Jeswin** | Pause after allocation; build the shortlist within each slice; apply the §6.4 ranking rule; emit `choice_requested`; block on the choice with the §6.6 timeout; emit `choice_made`; buy exactly what the user chose |
| **Deepthi** | The choice panel — option cards inside the slice, photo preview, rating with its basis, price; the `source`/`environment` labels; the countdown; POST the choice; show user-chosen vs auto-chosen on the receipt |

### 6.9 Sequencing

This is **additive and lower priority than a genuine Prava sandbox transaction.** Judging criterion 4 requires Prava to be meaningful and central, and every card is still a stub today. A richer picker on top of simulated payments scores worse than a plain UI on a real one. Build this only once the sandbox charge and its cap-rejection proof exist, and treat §6.1 plus the Deepthi column as the minimum viable slice — the photo preview is polish, the choice itself is the feature.

---

## 7. Run-scoped, expiring, one-shot approval — LOCKED

Approval is server state, not a global boolean and not an SSE event alone. The
backend computes the digest; callers never invent it.

### 7.1 Create the request

`POST /api/approvals/requests` body:

```
{ runId: string,
  allocations: { flights: number, stay: number, food: number, guide: number },
  choices?: { [agent: string]: string },
  ttlSeconds?: number }  // integer 1..600; default 120
```

Returns `201`:

```
{ approvalRequestId: string, runId: string, digest: string,
  status: "pending", createdAt: string, expiresAt: string,
  decidedAt: null, consumedAt: null }
```

The SHA-256 `digest` covers a canonical representation of exactly `runId`,
`allocations`, and `choices`. Changing a price, allocation, option, or run
requires a new approval request.

### 7.2 Read and decide

- `GET /api/approvals/:approvalRequestId?runId=<runId>` returns the same public
  record. A pending record becomes `expired` at `expiresAt`.
- `POST /api/approvals/:approvalRequestId/decision` body is
  `{ runId, digest, decision: "approved" | "declined" }`; returns `202`.
- A mismatched run returns `404 APPROVAL_NOT_FOUND`. A changed digest, repeated
  decision, or non-pending request returns `409` with a structured code.

### 7.3 Consume before minting

`POST /api/approvals/:approvalRequestId/consume` body is `{ runId, digest }`.
Only `approved` can become `consumed`; it returns `200`. Consume immediately
before the first credential mint. A second consume, expired request, decline,
or digest mismatch fails closed with `409`, so stale approval cannot authorize
a later plan.

All four approval routes use `INTERNAL_API_TOKEN` when configured. Never ship
that token in browser JavaScript; deployment must proxy the user action through
the same trusted application/session boundary. Approval records contain no
Prava credentials, card data, or raw external responses.

## 8. Provenance vocabulary — LOCKED

- Discovery: `source: "live" | "fixture"` describes whether an adapter called
  the external inventory API. Pair it with
  `environment: "test" | "production" | null` so Duffel test inventory is not
  presented as real market inventory.
- Payment/purchase: `source: "fixture" | "sandbox" | "production"` describes
  the payment environment. It never replaces `status` or `details`.
- A run containing both fixture and sandbox purchase lines is `mixed-mode`.
  The receipt keeps provenance per line and must not promote the entire run to
  the strongest source observed on one line.

---

## How to use this file
This is already 🟢 LOCKED so all three of you can start in parallel right now with zero setup meeting. Skim it once (5 minutes, not 15) so everyone's seen the same contract, then split off.

Any change to a locked interface still requires editing this file + a progress.md flag + telling the other two directly, not just committing and hoping they notice.
