# Humsafar

**A team of AI agents that spends one shared budget together.** You give it a goal and a
total budget. Specialist agents negotiate how to split the money across categories, a
mediator settles the split, and each agent then attempts its own part on its own
merchant-locked Prava credential — so no agent can overspend, and none can reach another
agent's slice or the rest of the money.

*Humsafar* means "fellow traveller".

Built for the **Agentic Commerce Hackathon** hosted by Prava.

---

## The problem

Every AI shopping agent today is a solo actor: one model, one purchase, no way to make
cross-category trade-offs when the goal is messy and the budget is finite. *"Plan my Goa
trip under ₹30,000"* is really flights + stay + food + activities all competing for one
pot. And handing one agent a real card means a single bug, bad merchant, or prompt
injection can drain everything.

## The mechanic

1. The **Budget Strategy Agent** interprets the goal and preference weights; the
   orchestrator spins up only the specialists the traveller requested — Journey,
   Stay, Food and/or Things to do.
2. Specialists use provider discovery when configured and an explicitly labelled,
   destination-aware fixture fallback otherwise, then argue for the share they need.
3. They **negotiate over the same finite pot**. Round one deliberately overshoots: the
   preferred plan costs more than the budget, so concessions are genuine downgrades to
   cheaper options that were actually found, not scripted dialogue.
4. A neutral **mediator** arbitrates until the split fits the budget without violating any
   agent's stated floor, or forces a compromise after five rounds.
5. The user chooses among options that already fit each slice.
6. The user **approves the exact split and option IDs once**, through an expiring,
   one-shot, run-scoped approval.
7. The orchestrator **mints one merchant-scoped Prava credential per agent**, capped at
   that agent's slice.
8. Each agent executes through the configured checkout adapter. The default is a labelled
   simulation; a credential is never described as a merchant order.

Two things make the multi-agent design load-bearing rather than decorative:

- **Resource contention.** Several agents competing over one pot is a problem a single
  agent cannot meaningfully reason about.
- **Blast radius.** A compromised or buggy agent can only damage its own slice.

---

## Current status — read this before judging the demo

We are precise about this because the hackathon rules make an overstated payment claim a
disqualifier risk, and because the UI enforces the same distinctions in code.

| Component | Status |
|---|---|
| Negotiation, mediation, convergence | **Working.** Deterministic, tested, terminates by construction. |
| Scoped-card abstraction and cap enforcement | **Working**, against a stub credential issuer by default. |
| Live dashboard over SSE | **Working**, including reconnect replay. |
| Conversational trip concierge | **Working.** Nine one-question prompts collect ordinary city names, journey mode, flexible/exact dates, party, optional trip parts, accommodation style, budget and vibe—no IATA codes or coordinates. |
| Local day planner | **Working with Geoapify.** Travellers choose mapped suggestions or “decide for me”; Humsafar clusters nearby stops, routes them with timings, suggests nearby food/cost ranges without booking it, and returns to the selected stay each night. Open-Meteo supplies in-window weather. |
| Guided completion experience | **Working.** Milo is a full-size left-side companion from intake through the quest. The receipt opens with a persistent 3D game board derived from the mapped stop order: raised track, painted progress, browser-only geolocation, next-stop distance, a transport-aware moving runner and XP. It is a playful itinerary view, while real directions open in Google Maps. |
| Flexible specialist scope | **Working.** Travellers can disable Journey, Stay, Food or Things to do; disabled agents do not negotiate, receive a slice, offer choices or execute. |
| Group accommodation | **Working in concierge mode.** Party/room-aware comparisons include hotel rooms, hostels, homestays and entire-home/villa estimates. Whole-home rows are labelled search handoffs/fixtures, not live Airbnb inventory. |
| Human option choice | **Working.** Only offered affordable options are accepted, once; selections are bound into approval. |
| Run-scoped approval protocol | **Working** and verified end to end. |
| Prava sandbox authentication | **Verified.** `npm run prava:verify` returns authentication OK. |
| Prava mandates | **Historically created.** Five approvals are preserved in the evidence record; after the latest phone ceremony, the read-only check on 3 Aug reports two standing sandbox mandates. |
| Phone budget authorization | **Working and opt-in.** The embedded receipt requests an authorize-only Prava mandate for the authoritative planned total, renders its QR inline and checks for the exact active mandate. It never labels authorization as a payment or booking. |
| Scoped credential issuance | **Verified on real rails.** Four credentials issued in a single run, one per agent, each capped at its own slice. |
| Browser-to-Prava refusal path | **Verified.** A full Journey-only browser run reused the phone-approved Duffel mandate and asked Prava for a ₹10,300 credential against its ₹100 cap. Prava refused credential issuance, no merchant checkout ran, and the receipt reported ₹0 charged. |
| One-shot ₹100 completion attempt | **Blocked upstream on 3 Aug.** Humsafar made exactly one in-cap charge request after a read-only dry-run; Prava returned `FETCH_AGENTIC_CREDS_ERROR` before issuing credentials. No checkout/report ran, the mandate remains available with ₹100 remaining, and no retry loop was used. |
| Network cap enforcement | **Verified.** Visa declined ₹160 against a ₹100 mandate — *"Total amount 160.00 exceeds …"*. |
| Merchant order | **Not performed.** No goods were bought; the charge is deliberately left unreconciled. |
| Duffel flights/stays | **Flights verified against provider test search; no order creation.** Ordinary city names resolve through Duffel Places, with coordinate-based airport fallback. Foreign-currency totals are converted into labelled INR planning estimates while preserving the provider amount. This account still needs Duffel Stays access, so hotels currently fall back to disclosed estimates. |
| Activities / Food | **Advisory only.** Geoapify supplies real mapped possibilities and the planner supplies labelled cost bands. No activity ticket, guide, restaurant reservation, card or payment is claimed. |

### What actually happened on Prava

On **2 Aug 2026, 15:30 IST**, one run produced four `Creds_Generated` records in Prava's
dashboard, seconds apart:

| Amount | Agent | Merchant |
|---|---|---|
| ₹9,800 | flights | Air India Express |
| ₹11,200 | stay | Anjuna Beach Resort |
| ₹4,200 | food | Gunpowder Assagao |
| ₹3,600 | guide | Dudhsagar Day Trip |

**₹28,800 — exactly the split the agents negotiated on screen.** Each credential is
merchant-locked and amount-capped to that agent's slice. Separately, a ₹160 charge
against a ₹100 mandate was **refused by Visa**, and the refusal left the mandate intact.

So the claim this project makes is demonstrated, not asserted:

> Four agents negotiated one budget, each was issued a real merchant-scoped,
> amount-capped Prava credential, and the card network physically refused an overspend.

**What was NOT done, stated plainly:** no merchant order was placed. Credentials were
issued and locked; nothing was bought, and no `APPROVED` was ever reported to Prava,
because reporting an outcome that never happened would fabricate a completed record.
Prava staff confirmed (Discord, 29 Jul) that reaching this point with a sandbox card is
a valid sandbox flow.

Full transaction ids, the exact decline text, and an explicit list of claims we refuse to
make are in **[`agents/PRAVA-EVIDENCE.md`](agents/PRAVA-EVIDENCE.md)**.

> **Reproducing this right now:** Prava's sandbox has been returning
> `FETCH_AGENTIC_CREDS_ERROR` ("Visa 400 — Fetching cryptogram failed") on every charge
> since 15:49 IST on 2 Aug. Two other teams reported the same fault on 30 Jul. It is
> upstream of this repository and does not affect the evidence above, which landed
> beforehand. A default `--demo` run uses stub credentials and is unaffected.

---

## Provenance labels — what each one means

These labels are a contract, not decoration. `frontend/src/lib/provenance.js` is the
single place they are produced, the wording is copied verbatim from `precaution.md`, and
unit tests assert the forbidden phrasings can never appear.

| Label | Means |
|---|---|
| `fixture / simulated; no payment attempted` | Local fixture data. No payment path touched. |
| `Prava sandbox credential issued` | A sandbox credential exists. Nothing has been charged. |
| `Prava sandbox credential request refused — no checkout` | Prava refused before issuing a credential, so no merchant checkout could run. |
| `Prava sandbox checkout attempt — not completed` | A sandbox checkout was attempted and did not complete. |
| `completed sandbox checkout` | A sandbox checkout genuinely completed. Sandbox, not real money. |
| `source unverified; not evidence of a payment` | Provenance was missing or unrecognised. Assume nothing. |
| `· test inventory` | Appended when the inventory is a provider's test data, not real market inventory. |

If some categories exercise Prava and others do not, the run is labelled **mixed-mode**
and the receipt states how many lines genuinely exercised a payment path. **No line ever
inherits another line's result**, and the run is never promoted to the strongest source
observed on a single line.

---

## Architecture

```
                    goal + budget
                         │
                         ▼
        ┌────────────────────────────────┐
        │  Agent core (Python)           │   Jeswin
        │  orchestrator · 4 specialists  │
        │  mediator · negotiation engine │
        └───────┬────────────────┬───────┘
                │                │
   locked events│                │ mintScopedCard / discovery / trust
                ▼                ▼
        ┌────────────────────────────────┐
        │  Backend (Node + Express)      │   Preethesh
        │  SSE hub · approvals · mandates│
        │  Prava · Duffel · fixtures     │
        └───────┬────────────────┬───────┘
                │ SSE            │ REST
                ▼                ▼
        ┌────────────────────────────────┐    ┌──────────┐
        │  Dashboard (React + Vite)      │    │  Prava   │
        │  deliberation · split · cards  │    │  sandbox │
        │  itinerary · approval · audit │    └──────────┘
        └────────────────────────────────┘   Deepthi
```

All money is **integer paise** inside the agent core and converted to rupees only at the
event boundary, so allocation can never drift by a rounding error.

Cross-team contracts are locked in [`INTERFACES.md`](INTERFACES.md). Payment safety rules
are in [`precaution.md`](precaution.md). Delivery sequencing is in
[`execution-plan.md`](execution-plan.md). The exact keys, partner contracts, and
remaining booking boundaries are in [`PRODUCTION-INTEGRATIONS.md`](PRODUCTION-INTEGRATIONS.md).

---

## Run it

Requires Node 20.19+ and Python 3.10+. No credentials are needed for the fixture demo.

```bash
# 0. Optional OpenAI Agents SDK environment (required for model-backed agents)
python3 -m venv agents/.venv
agents/.venv/bin/python -m pip install -r agents/requirements.txt
# Set HUMSAFAR_PYTHON=.venv/bin/python in the root .env

# 1. backend  (http://127.0.0.1:3000)
npm install
npm start

# 2. dashboard  (http://localhost:5173)
cd frontend && npm install && npm run dev

# 3. open the dashboard and submit any trip on `/`; it starts the agents.
# CLI remains available for a deterministic proof-shot rehearsal:
cd agents && python3 -m humsafar --goal "Plan my Goa trip" --budget 30000 --demo
```

The dashboard opens on a clearly-labelled **simulated stream** so it demos with nothing
else running. Toggle **live backend** (or open `?source=live`) to consume real events.

Useful agent flags: `--demo` runs both proof shots, backend provider discovery is
the default, `--local-discovery` forces offline fixtures, `--no-stream` skips the
event backend, and `--llm` uses OpenAI dialogue when `OPENAI_API_KEY` is set.

### Tests

```bash
npm test                          # backend + frontend unit tests
cd frontend && npm run test:render # server-rendered UI smoke test
cd agents && python3 -m unittest discover -s tests -t .
```

Currently **196 JavaScript** and **218 Python** tests, plus frontend SSR,
production-build and browser-rehearsal checks.

### Environment

Copy `.env.example` to `.env`. `.env` is gitignored and must stay that way — never commit
a key, a card number, or a raw Prava response. Read `precaution.md` before configuring
anything payment-related.

The receipt's **Authorize trip budget on phone** control is deliberately disabled by
default. For a cardholder-attended sandbox mandate ceremony, set
`HUMSAFAR_ENABLE_PRAVA_PHONE_APPROVAL=true`, fill the existing `PRAVA_TEST_*` values,
and start with `npm run start:sandbox`. Nothing is sent to Prava until the user clicks
the button. Repeated clicks reuse the same unexpired ceremony, and the browser never
sends customer, merchant, amount, API key or card details—only the run ID. The backend
resolves the final receipt and uses its exact planned total as a card-network cap. It
checks Prava's standing mandates after phone approval and shows success only when an
active, available, listed Humsafar mandate with that exact cap exists. This step does
not mint credentials, charge the card, report `APPROVED` or claim a booking.

---

## The two proof shots

Both are visible on screen in a `--demo` run:

1. **Overspend is refused — by Visa, not by us.** An agent attempts a charge above its
   own cap and is rejected. This is deliberately *not* a software `if` presented as card
   enforcement; a guardian check dressed up as network enforcement would be exactly the
   misleading claim the rules prohibit. Against live Prava this produced a real decline:
   *"Total amount 160.00 exceeds …"* on a ₹160 charge against a ₹100 mandate. The
   classifier only calls a refusal cap enforcement when the network says the amount was
   exceeded — `MANDATE_NOT_ACTIVE`, an exhausted use limit, or a bare decline are each
   reported as what they are, precisely so this proof cannot be faked by accident.

   The attempt runs **before** that agent's own purchase. Afterwards a one-time mandate
   is already consumed, and the refusal would prove an exhausted use limit while claiming
   cap enforcement — the right answer for the wrong reason.
2. **Failure is contained.** One booking is failed on purpose. The orchestrator
   re-negotiates **only that agent's slice** and recovers; the other purchases stand.

---

## Disclosure

Required by the hackathon rules, and stated precisely:

- **Before the official build window:** the project brief, product thesis, architecture
  sketch, competitive analysis and application answers were drafted in planning
  conversations. That is ideation and planning — no product code.
- **Inside the official build window:** all source code, all tests, every commit in this
  repository, and all working integrations.
- **Not bookings, and labelled as such:** the day planner uses real Geoapify map/place
  results for food and activities, but its cost bands are estimates and those categories
  are advisory—no card, reservation or order is created. The agent negotiation still
  uses disclosed Guide/Food estimate rows until a transactional partner exists. Duffel
  flight search is live against test inventory; foreign-currency offers retain their
  provider total and receive a clearly labelled reference-rate INR planning conversion.
  Stays and any unavailable flight search fall back to disclosed fixtures, and the run
  prints which source each category actually resolved to.
- **Payment status:** Prava **sandbox** only — no production access was requested or used,
  and no real money moved at any point. Five mandates were approved by a human through
  Prava's hosted passkey ceremony. Four merchant-scoped, amount-capped credentials were
  issued in a single run (₹9,800 / ₹11,200 / ₹4,200 / ₹3,600), and Visa refused a ₹160
  charge against a ₹100 mandate. **No merchant order was placed** — nothing was bought,
  and no `APPROVED` outcome was ever reported to Prava, because reporting a result that
  never happened would fabricate a completed record. The UI labels every line accordingly
  and never promotes a run to the strongest source seen on one line. Evidence and the
  explicit list of claims we refuse to make: [`agents/PRAVA-EVIDENCE.md`](agents/PRAVA-EVIDENCE.md).
- **Third-party inspiration:** the buyer/mediator negotiation structure was adapted from
  a teammate's earlier, separate project ("Accord"); the seller side was not used. Some
  resilience patterns — fixture fallback, partial-failure recovery — were adopted from a
  same-hackathon project reviewed for inspiration, not copied structurally.

---

## Prize-track evidence

Listed with the status each claim honestly has **today**, because a track claim we
cannot demonstrate is worse than one we do not make. The handbook penalises
decorative partner integrations, so a track is only claimed where there is something
runnable to point at.

| Track | What we would claim | Evidence today | Status |
|---|---|---|---|
| **Prava Overall** | Prava is the core mechanic: one merchant-scoped, capped credential per agent, minted only after an explicit approval | Four credentials issued in one run (₹9,800 / ₹11,200 / ₹4,200 / ₹3,600) matching the negotiated split, five passkey-approved mandates, and a real Visa cap decline. All visible in the Prava dashboard. | ✓ **Demonstrated.** Credentials issued and an overspend refused. No merchant order placed. |
| **Visa Intelligent Commerce** | Permissions and controls, not just a payment | Per-agent amount caps, merchant-scoped mandates, an expiring one-shot approval that fails closed on a changed plan — and **Visa itself declining an over-cap charge**: *"Total amount 160.00 exceeds …"* | ✓ **Demonstrated.** Controls, authentication and a network-enforced refusal, all on Visa rails through Prava. |
| **OpenAI** | Models materially used for agent reasoning, never for money | Agents SDK with five agent identities: an Intent Agent parsing arbitrary goals into categories and priorities that measurably change the split, four specialist negotiators, and a mediator explainer. No model-facing schema contains a money field, and any figure an agent states that it was not given is rejected. | ✓ **Demonstrated.** Reasoning is material; the money path stays deterministic by construction. |
| **Localhost Startup-Ready** | A real product direction, not a demo toy | The negotiation mechanic, the containment argument, and the honesty layer are the product thesis | ◑ **Narrative, not code evidence.** |
| **Project NANDA** | A reusable Prava adapter, discoverable | `GET /.well-known/agentfacts.json` → `200`, `POST /a2a/ping` → `200`, both verified | ◑ **Endpoints demonstrated**, full adapter submission pending. |
| **Senso** | Trust materially influences a merchant decision | The trust route exists and materially changes purchases, but it is a **local fixture heuristic** and labels itself as such: *"replace with a verified Senso response before claiming track evidence"* | ✗ **Not claimed.** A local heuristic is not Senso. |
| **Linq** | — | — | ✗ **Not pursued.** Messaging is not Humsafar's core interface, and a bolted-on channel is exactly the decorative integration the handbook penalises. |

Legend: ✓ demonstrated · ◑ partially demonstrated · ⏳ pending · ✗ not claimed

---

## Team

| | Owns |
|---|---|
| **Jeswin** | Agent core: orchestrator, specialists, mediator, negotiation engine, scoped-card logic |
| **Preethesh** | Integrations and backend: Prava, Duffel, SSE, approvals, mandates, fixtures, trust |
| **Deepthi** | Frontend, product experience, provenance labelling, deployment, demo and submission |

Each owner keeps a running log — `progress-jeswin.md`, `progress-preethesh.md`,
`progress-deepthi.md` — recording what changed, why, what was validated and what is
blocked.

---

## Known limitations

- No real payment has been executed yet; the credential issuer is a stub by default.
- Goal and budget are not yet user-editable in the dashboard; a run-creation endpoint is
  still needed.
- Flight offers carry no rating from Duffel, so flights are ranked by price. Ratings are
  never invented to make a demo livelier.
- Booking sites cannot be embedded for previews — they block framing — so any future
  option preview must render inside the app.
- This repository lives on a Windows drive accessed through WSL during development, where
  file watching does not fire. **Restart every long-running dev process after a pull**, or
  it will keep serving stale code.
- **Prava calls fail intermittently without a Node connection flag.** The sandbox host
  resolves to both IPv4 and NAT64 IPv6 addresses; the IPv6 ones are unroutable on some
  networks, and Node's Happy Eyeballs auto-selection abandons the attempt after ~250ms and
  reports `fetch failed` / `ETIMEDOUT`. Measured here: **9/12** requests succeeded with no
  flag, **12/12** with `--network-family-autoselection-attempt-timeout=2000`. That flag is
  set on every `npm` script that talks to Prava. `curl` is unaffected, which is what makes
  this look like a credential or API problem when it is neither — if you are debugging
  Prava by hand, use the npm scripts rather than a bare `node` invocation.

### Environment file gotcha

The scripts load `.env` via `node --env-file=.env`. A file saved as `.env.txt` (Windows
"Save as" often appends `.txt`) is **silently ignored** — every value reads as undefined
and the failure looks like bad credentials. Check `ls -a` for the exact filename, and
confirm `.env` defines every key in `.env.example`; the mandate-session script validates
five merchant/cap variables that are easy to miss.
