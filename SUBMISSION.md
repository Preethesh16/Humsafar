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
