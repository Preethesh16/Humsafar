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

Deepthi's dashboard can optionally surface `source` in the UI (a small "live" / "simulated" tag per purchase) — good for the demo's honesty story, not required.

---

## 5. Negotiation convergence rule (Jeswin owns, others may read)

**Locked rule:** negotiation ends as soon as EITHER of these is true:
1. The current proposed split sums to ≤ total budget AND no agent's stated minimum viable ask has been violated — this is the "clean" success exit.
2. **5 rounds** have passed without reaching (1) — the mediator then forces a compromise: give every agent its stated minimum viable ask first, then distribute whatever budget remains above the sum of minimums proportionally across agents by their original requested share (not equally) — so an agent that argued for a bigger slice still gets proportionally more of the leftover, it just doesn't get its full ask.

Why 5 rounds and this specific fallback: 5 is enough for a few real rounds of push-back to play out on screen during the ~45s negotiation beat in the demo without risking it running long or stalling out live in front of judges. Minimums-first-then-proportional is simple to implement, always terminates, always fits the budget by construction, and is easy to narrate out loud during the demo ("everyone got their floor, then the rest split by how hard they argued for it").

---

## How to use this file
This is already 🟢 LOCKED so all three of you can start in parallel right now with zero setup meeting. Skim it once (5 minutes, not 15) so everyone's seen the same contract, then split off.

Any change to a locked interface still requires editing this file + a progress.md flag + telling the other two directly, not just committing and hoping they notice.
