# Humsafar — submission pack

Everything needed to fill in Devfolio and record the video. Written to be copied
from, not paraphrased: the claims here are the ones we can defend.

**Deadline: 3 Aug, 07:30 IST.** A draft is not a submission — the project must
show **Submitted**, and only the team admin can publish.

---

## 1. Devfolio fields

**Name:** Humsafar

**Tagline:** Four AI agents argue over one travel budget, then spend it with
merchant-scoped Visa credentials that cannot overspend.

**Problem.** Ask any assistant to plan a trip and it returns a list. The moment
money is involved it stops, because handing an agent a card means handing it
your whole balance. The real problem is not "which hotel" — it is that a budget
has to be *divided*, and every category thinks it deserves more. Nobody wants to
give software one card and hope.

**What it does.** You give Humsafar a destination and one number. Four
specialist agents — Journey, Stay, Food, Guide — each look at real options and
argue for their share of that single budget. They concede, they trade, they
settle. You pick the taste (which room, which restaurant); the agents already
settled the money, so nothing you pick can overspend. You approve the plan once.
Then each agent gets its **own** payment credential: scoped to one merchant,
capped at its own slice, useless anywhere else.

**Why it is different.** The budget split is the product, not a checkout button
bolted to a chatbot. And the safety is structural rather than promised: an agent
cannot overspend because Visa refuses the charge, not because our code has an
`if` statement. We have the decline to prove it.

**Technologies used** *(list these exactly — track eligibility is read from this
field)*:

```
Prava, Visa Intelligent Commerce, OpenAI Agents SDK, OpenAI GPT-4.1,
Python, Node.js, Express, React, Vite, Server-Sent Events, Duffel,
Geoapify, Open-Meteo, Docker
```

**Links:** repository · deployed app · demo video

### The problem it solves — paste this into Devfolio

> **Travel planning is not a search problem. It is a coordination problem—and today the traveller is still the coordinator.**
>
> Ask an AI to plan Goa and it can generate a beautiful list. But the moment reality enters—one fixed budget, competing flight and hotel prices, different group preferences, places spread across a map, changing weather, and actual payment responsibility—the “assistant” hands the work back to you. You reopen ten tabs, compare incompatible options, rebuild the budget after every change, connect nearby stops manually, and trust one opaque agent with too much money.
>
> Humsafar removes that coordination burden. A conversational concierge first understands how you want to travel, who is coming, what matters, what can be skipped, and the maximum you will spend. It then creates a small economy of specialist agents—Journey, Stay, Food and Things to Do—that discover options and **negotiate over the same finite budget**. If Stay wants more, another specialist must make a real concession. A neutral mediator guarantees the final allocation fits; the user chooses only among options already affordable.
>
> Humsafar then turns those choices into a practical, proximity-aware day plan with timings, route order, weather context, nearby food suggestions and a guided trip quest—without pretending every suggestion was booked.
>
> Most importantly, delegation is bounded. The approved plan is run-scoped and one-shot. Each purchasing agent receives a merchant-scoped Prava credential capped to only its own slice, so a buggy or compromised agent cannot reach another agent’s allocation—or the rest of the traveller’s money. Visa’s sandbox enforcement has already refused an over-cap attempt.
>
> **Humsafar moves AI travel from “Here are some recommendations” to “Your specialists coordinated the trade-offs, proved the budget, and can act only inside the permission you gave them.”**

### Challenges we ran into — paste this into Devfolio

> **The hardest part was not making four agents talk. It was making every rupee and “success” mean something.**
>
> **1. Our first negotiation was theatre.** The preferred options already fit, so every agent agreed immediately. We rebuilt it around actual prices: every ask maps to something buyable and every concession selects a real cheaper alternative. A deterministic mediator—not an LLM—allocates integer paise; largest-remainder splitting makes the slices exact, and a minimums-first fallback guarantees termination without overspending.
>
> **2. Providers do not behave like one clean product.** Duffel returned foreign-currency flights while accommodation access varied; maps, weather and venue APIs all failed differently. We normalized provenance, conservative conversion and destination-aware fallbacks. Every row says whether it is provider-backed, reference-priced, fixture or advisory—never turning a suggestion into a booking.
>
> **3. Prava forced real systems debugging.** Linux could not complete passkeys, so we built a phone QR handoff that keeps card, OTP and biometrics on Prava. Node also timed out while curl worked: unreachable NAT64 addresses plus a short Happy-Eyeballs window were the cause. Raising its timeout made 12/12 requests stable. When the assigned test card later failed credential minting even in Prava's flow, we reproduced it across amounts, currencies and paths, stopped wasteful retries, preserved support evidence and failed closed instead of fabricating success.
>
> **4. Dynamic routes broke the map.** Returning to the same stay each night stacked markers and tangled multi-day paths. We made each day a quest level, separated nearby markers deterministically, preserved real visit order and handed actual navigation to Google Maps.
>
> The result works beyond the happy path: it explains what happened, constrains every agent and stays honest when a dependency fails.

### Best Visa Intelligent Commerce Implementation — paste this into the track field

> **Visa is not a logo in Humsafar; it is the enforcement plane that makes autonomous commerce safe.**
>
> A traveller gives Humsafar one goal and one hard budget. Journey, Stay, Food and Things to Do agents compete for it while a deterministic mediator settles an exact integer-paise allocation. The LLM argues priorities but cannot create, round or modify money.
>
> After approval, Humsafar converts intent into machine-enforceable permissions. Every purchasing agent receives its own Prava mandate and single-use Visa credential, locked to one merchant and capped at its slice. Approval is bound to the run, plan digest and expiry; change an option or price and it fails closed. A compromised Stay Agent cannot spend Journey's allocation, switch merchants or reach the remaining budget.
>
> **We demonstrated the controls on Visa sandbox rails, not only in our UI:**
>
> - Five mandates were approved through a real phone passkey ceremony.
> - One multi-agent run generated four merchant-scoped credentials—₹9,800, ₹11,200, ₹4,200 and ₹3,600—totalling exactly the negotiated ₹28,800 allocation in the Prava dashboard.
> - Visa refused a deliberate ₹160 request against a ₹100 mandate for exceeding its authorization. That proof is not an application-level `if`.
> - Card numbers, dynamic CVVs and session secrets never enter prompts, browser storage, SSE events, receipts or logs.
>
> This is Intelligent Commerce as a permission system: one human decision becomes independently constrained agent capabilities enforced at the network boundary. If one specialist fails, only its slice is renegotiated.
>
> All evidence is explicitly labelled **Prava/Visa sandbox**. We claim verified passkey authorization, credential issuance and network-enforced refusal—not a production charge or merchant booking.

### OpenAI — paste this into the track field

> **OpenAI is not Humsafar's copywriter. It is the reasoning layer inside a real multi-agent market.**
>
> A Budget Strategy Agent turns a traveller's natural-language goal into a structured roster and priorities. Four independently instructed specialists—Journey, Stay, Food and Things to Do—inspect grounded options, choose what they will fight for and argue their trade-offs concurrently. A separate Mediator explains the settlement. Say “I care about eating well” or disable a guide and the agents, contention and allocation genuinely change; the model is not narrating a plan already chosen.
>
> We built this with the OpenAI Agents SDK using distinct `Agent` identities, `Runner` orchestration, typed Pydantic outputs and one trace group per trip. Structured outputs are also a safety boundary: no model-facing schema contains a price, allocation, cap or budget field. A specialist selects an option; trusted code looks up its price. Any invented figure in free text is rejected.
>
> **The LLM decides strategy; deterministic code decides money.** Integer-paise arithmetic, real-option floors, bounded rounds and largest-remainder allocation guarantee an exact, never-overspent budget. OpenAI reasoning materially influences who participates, what they value, which option they defend and how they negotiate—without access to Prava, cards or payment tools.
>
> A timeout, malformed output, rate limit or missing key falls back per agent to deterministic behavior, so the trip still completes with identical financial guarantees. Model/tool payload logging is disabled; card numbers, CVVs, passkeys, Prava secrets and raw payment responses never enter prompts or traces.
>
> Humsafar demonstrates a practical pattern for agentic commerce: give models enough freedom to reason, disagree and adapt, while making unsafe financial actions structurally unrepresentable.

### OpenAI Participation Credits (Already Claimed) — paste this into the track field

> We used the OpenAI participation credits to build and repeatedly test Humsafar's actual reasoning layer—not to generate decorative copy.
>
> The OpenAI Agents SDK powers a Budget Strategy Agent that interprets each traveller's natural-language goal, four independently instructed specialists—Journey, Stay, Food and Things to Do—that choose grounded options and negotiate concurrently, and a separate Mediator that explains the final compromise. The model's decisions materially change which specialists participate, what each one prioritizes and which real option it defends.
>
> The credits also let us test the difficult paths that make this safe enough for commerce: structured-output validation, parallel agent turns, malformed responses, timeouts, rate limits and deterministic fallbacks. No model-facing schema contains a budget, price, allocation or payment field. OpenAI chooses strategy and option identities; audited integer-paise code owns every rupee and Prava remains completely outside the agents' tool access.
>
> This support enabled us to move beyond a scripted demo and validate a reusable architecture where model reasoning is genuinely useful, but model failure can never overspend the traveller's budget or expose payment data.

---

## 2. The Prava integration, and the transaction outcome

This is the section judges read most carefully, and the handbook is explicit:
*"If you claim an order was placed, show the completed checkout result. Creating
a payment session alone is not a completed order."* So, precisely:

Each agent's negotiated slice is backed by its own Prava mandate — `listed`
scope, locked to one merchant, approved by the user with a **passkey**. At
purchase time the agent mints a single-use credential against its own mandate,
capped at the price of the thing it is buying.

**What completed end to end** (`txn_01KZ1MYSM8AMTXQJNVH5RDEPXX`):

| Prava's step | What happened |
|---|---|
| 1. Agent decides on a product | four-agent negotiation settled Dudhsagar Day Trip at ₹3,600 |
| 2. Approval for that purchase | mandate approved by passkey, `listed` scope |
| 3. One-time card issued | `fetchStatus: SUCCESS`, real credentials |
| 4. Card presented at a merchant | simulated storefront — **Prava's own documented route** |
| 5. Merchant declines a test card | reported and accepted: **`visaConfirmation: SUCCESS`** |

`status: failed` is the **correct** terminal state. A sandbox test card cannot be
approved by a real processor, and Prava's guidance says so: *"you simply simulate
the final merchant checkout step yourself for the demo."* The transaction is
settled, not stranded.

**The overspend proof — the safety claim, live:**

| Attempt | Result |
|---|---|
| ₹160 against a ₹100 mandate | **declined by Visa** — *"Total amount 160.00 exceeds…"* |
| ₹100 against the same mandate | approved, real single-use credentials issued |

A refused over-cap attempt does not consume the mandate, so both fit one run.
The refusal comes from the card network. That is the whole product claim,
demonstrated rather than described.

**Four credentials in one run** — 2 Aug, 15:30 IST, four `Creds_Generated` rows
seconds apart totalling **₹28,800**: ₹9,800 flights, ₹11,200 stay, ₹4,200 food,
₹3,600 guide. Exactly the split the agents negotiated on screen.

---

## 3. Disclosure — what is real and what is not

Stating this plainly is a feature, not an apology. Judges reward it and every
line of it is enforced in code.

| Part | Status |
|---|---|
| Agent negotiation and budget split | **Real.** Integer-paise arithmetic, no model touches an amount. |
| Prava mandates, credentials, cap decline | **Real, sandbox.** Verifiable in the dashboard by transaction id. |
| Passkey approval | **Real.** Completed on a phone. |
| Merchant storefront | **Simulated**, per Prava's written guidance. Hard-fixed at `DECLINED` — there is no code path that returns `APPROVED`. |
| Flight and stay inventory | **Fixture.** See below. |
| Food and activity purchases | **Advisory.** They negotiate and hold budget, but mint no card and are never called booked. |

**Why inventory is fixture, specifically.** Not a missing key: our Duffel token
works and returns 89 real BLR→GOI offers. They are priced in **USD** (Air India
$37.50, British Airways $47.04), and the entire budget model — and every Prava
mandate — is INR. Converting at an exchange rate we made up would be inventing
data, so non-INR inventory **fails closed** to labelled fixtures rather than
silently corrupting a rupee budget proof.

**Pre-existing work:** none. The repository was created for this hackathon.

---

## 4. Demo video script — target 3:30

Record the **deployed URL**, not localhost. Warm the service first; free tiers
sleep and a cold start is 30 seconds of nothing.

**0:00–0:20 — the problem, said once**
> "Any assistant can plan a trip. None of them can pay for it — because giving
> an agent a card means giving it your whole balance. Humsafar splits one budget
> between four agents, and gives each one a card that only works at its own
> merchant."

**0:20–0:50 — intake.** Type a real destination and budget. Say: *"One number.
The agents work out who gets what."*

**0:50–1:40 — the negotiation. This is the part to linger on.** Let the
deliberation feed run. Point at one specific moment:
> "The Stay Agent opened on the most expensive room on its list. The Journey
> Agent opened on the *cheapest* flight — it decided the trip was better served
> spending elsewhere. That is the agent's own choice, and it changes the final
> split."

Then the honest bit, which costs nothing and buys credibility:
> "The agents choose *which option* to fight for. They never state an amount —
> there is no field in the schema for one. Every rupee is integer arithmetic."

**1:40–2:10 — your choice.** Pick a different option than the top one. Say:
*"The agents settled the money. I only pick the taste — nothing here can go over
budget."*

**2:10–2:40 — approval.** Show the single approval with the exact split.
*"One decision, bound to this exact plan. Decline and nothing is minted."*

**2:40–3:20 — the payment. The most important 40 seconds.** Cut to the **Prava
dashboard**, not our UI.
> "Four credentials, one per agent, merchant-scoped and capped at each agent's
> slice. And here" — the over-cap row — "is an agent trying to spend ₹160
> against a ₹100 mandate. Visa refused it. Not our code. The card network."

Then the completed transaction: `visaConfirmation: SUCCESS`.
> "Credential issued, presented, declined as a sandbox test card, and reported
> back to Visa. That is the full five-step flow."

**3:20–3:30 — close**
> "Real negotiation, real credentials, real refusal. The storefront is simulated
> because sandbox cards cannot be approved — and we say so, on screen."

### Say these words, not those

| Say | Never say |
|---|---|
| "credentials issued", "authorized" | "order placed", "booked" |
| "Prava sandbox" | "production" |
| "declined by Visa" | "our system blocked it" |
| "fixture inventory" | "live flight prices" |

---

## 5. Pre-flight checklist

- [ ] Deployed URL loads and is **warm**
- [ ] A full run reaches the receipt on the deployed URL
- [ ] `GEOAPIFY_API_KEY` set — without it the mapped itinerary 503s
- [ ] `SESSION_SECRET` set, or a restart logs judges out
- [ ] `INTERNAL_API_TOKEN` set — required for a non-loopback host
- [ ] `HUMSAFAR_BACKEND_URL` **not** set on the host (the server derives it)
- [ ] Prava dashboard open in a tab, showing the four credentials and the decline
- [ ] Video under 4 minutes, first screenshot uploaded (it becomes the cover)
- [ ] Every team member added and RSVP'd
- [ ] **Project status reads Submitted, not Draft**
