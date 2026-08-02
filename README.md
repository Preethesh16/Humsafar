# Humsafar

**A team of AI agents that spends one shared budget together.** You give it a goal and a
total budget. Specialist agents negotiate how to split the money across categories, a
mediator settles the split, and each agent then buys its own part on its own
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

1. The **orchestrator** takes the goal and budget and spins up four specialists —
   Flights, Stay, Food, Guide.
2. Specialists **discover real options** and argue for the share they need.
3. They **negotiate over the same finite pot**. Round one deliberately overshoots: the
   preferred plan costs more than the budget, so concessions are genuine downgrades to
   cheaper options that were actually found, not scripted dialogue.
4. A neutral **mediator** arbitrates until the split fits the budget without violating any
   agent's stated floor, or forces a compromise after five rounds.
5. The user **approves the exact split once**, through an expiring, one-shot, run-scoped
   approval.
6. The orchestrator **mints one merchant-scoped Prava credential per agent**, capped at
   that agent's slice.
7. Each agent **checks out on its own credential** — never touching a raw card number,
   never able to reach another slice.

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
| Run-scoped approval protocol | **Working** and verified end to end. |
| Prava sandbox authentication | **Verified.** `npm run prava:verify` returns authentication OK. |
| Prava customer, mandates, credentials | **Not yet created.** Zero mandates. No session, credential or transaction has been created. |
| Duffel flights/stays | **Not configured.** No `DUFFEL_ACCESS_TOKEN`, so discovery falls back to disclosed fixtures. |
| Guide / Food inventory | **Fixtures by design**, shaped like Viator/OpenTable responses. Partner API access does not clear in a hackathon window. |

**So: no real payment has been made yet.** Every purchase in a current demo run is a
fixture, and the dashboard labels it as one — a run is reported as
*"Fixture-only run — no payment was attempted"*, with **0 of 4** purchases having
exercised a payment path.

---

## Provenance labels — what each one means

These labels are a contract, not decoration. `frontend/src/lib/provenance.js` is the
single place they are produced, the wording is copied verbatim from `precaution.md`, and
unit tests assert the forbidden phrasings can never appear.

| Label | Means |
|---|---|
| `fixture / simulated; no payment attempted` | Local fixture data. No payment path touched. |
| `Prava sandbox credential issued` | A sandbox credential exists. Nothing has been charged. |
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
        │  approval · proof · audit      │    └──────────┘
        └────────────────────────────────┘   Deepthi
```

All money is **integer paise** inside the agent core and converted to rupees only at the
event boundary, so allocation can never drift by a rounding error.

Cross-team contracts are locked in [`INTERFACES.md`](INTERFACES.md). Payment safety rules
are in [`precaution.md`](precaution.md). Delivery sequencing is in
[`execution-plan.md`](execution-plan.md).

---

## Run it

Requires Node 20.19+ and Python 3.10+. No credentials are needed for the fixture demo.

```bash
# 1. backend  (http://127.0.0.1:3000)
npm install
npm start

# 2. dashboard  (http://localhost:5173)
cd frontend && npm install && npm run dev

# 3. a real agent run, streaming into the dashboard
cd agents && python3 -m humsafar --goal "Plan my Goa trip" --budget 30000 --demo
```

The dashboard opens on a clearly-labelled **simulated stream** so it demos with nothing
else running. Toggle **live backend** (or open `?source=live`) to consume real events.

Useful agent flags: `--demo` runs both proof shots, `--live-discovery` uses the backend's
discovery routes, `--no-stream` skips the backend entirely, `--llm` uses OpenAI for
dialogue when `OPENAI_API_KEY` is set.

### Tests

```bash
npm test                          # backend + frontend unit tests
cd frontend && npm run test:render # server-rendered UI smoke test
cd agents && python3 -m unittest discover -s tests -t .
```

Currently **75 JavaScript** and **80 Python** tests.

### Environment

Copy `.env.example` to `.env`. `.env` is gitignored and must stay that way — never commit
a key, a card number, or a raw Prava response. Read `precaution.md` before configuring
anything payment-related.

---

## The two proof shots

Both are visible on screen in a `--demo` run:

1. **Overspend is refused.** An agent attempts a charge above its own cap and is
   rejected. This is deliberately *not* implemented as a software `if` presented as card
   enforcement — a guardian check dressed up as network enforcement would be exactly the
   kind of misleading claim the rules prohibit.
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
- **Not real, and labelled as such:** Guide and Food inventory are fixtures shaped like
  Viator/OpenTable responses, because partner API approval does not clear in a weekend.
  Flights and stays fall back to the same fixture mechanism whenever Duffel is
  unconfigured, and the run prints which source each category actually resolved to.
- **Payment status:** Prava sandbox authentication is verified. No customer, mandate,
  session, credential or transaction has been created. No payment — sandbox or
  production — has occurred. Nothing in the UI claims otherwise.
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
| **Prava Overall** | Prava is the core mechanic: one merchant-scoped, capped credential per agent, minted only after an explicit approval | Scoped-card service, mandate resolver, cap enforcement and the approval gate are implemented and tested. Sandbox authentication verified via `npm run prava:verify`. | ⏳ **Pending the transaction.** No customer, mandate, session, credential or charge exists yet. |
| **Visa Intelligent Commerce** | Permissions and controls, not just a payment | Per-agent amount caps, merchant-scoped mandates, and an expiring one-shot run-scoped approval that fails closed on a changed plan — all verified end to end | ◑ **Controls demonstrated, completion pending.** The permissions half is real; the transaction half is not. |
| **OpenAI** | Models materially used for agent reasoning, never for money | The agent core runs deterministically today and degrades to templated dialogue without a key. No `OPENAI_API_KEY` is configured. | ⏳ **Not yet demonstrated.** Deliberate design: no model output may move money, so the money path stays deterministic. |
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
