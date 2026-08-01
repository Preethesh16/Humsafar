# HUMSAFAR — Brainstorming & Context Log
> Read this file FIRST, in full, before writing any code. It is the complete history of how this project was designed, why every decision was made, what was rejected and why, and the exact hackathon rules we're building against. If anything here conflicts with a teammate's progress file, the progress file is more current — but the reasoning here should still guide judgment calls.

---

## 0. THE EVENT (ground truth — verify against live Devfolio before final submission)

**Agentic Commerce Hackathon**, hosted by **Prava**.
- Kickoff: Jul 31, 7:00 PM PT / Aug 1, 7:30 AM IST (already happened)
- Submission deadline: **⚠️ DISCREPANCY IN THE OFFICIAL HANDBOOK ITSELF** — the header says "Aug 2, 7 PM PT / Aug 3 7:30 AM IST", but Section 8 ("Hard deadline") says "Pacific Time: August 2 at 3:00 PM PT / IST: August 3 at 3:30 AM IST". **Do not trust either blindly — check the live Devfolio submission page for the actual countdown timer and treat whichever is EARLIER as the real deadline.** Losing 4 hours of build time to a wrong assumption here would be a self-inflicted disaster.
- Results announced: by Aug 8
- Team size: 1–4 builders. Our team: **Jeswin, Preethesh, Deepthi** (+ Imran coordinating).

### Prava sandbox test card (given to our team, DO NOT commit to a public repo)
- Card number: stored only in the local `PRAVA_SANDBOX_CARD_NUMBER` environment variable
- Expiry/CVC: stored only in local `PRAVA_SANDBOX_CARD_EXPIRY` and `PRAVA_SANDBOX_CARD_CVC` environment variables; confirm the exact values and format in the Prava dashboard
- Card ID: stored only in the local `PRAVA_SANDBOX_CARD_ID` environment variable
- Max daily limit: 30 transactions
- Unique to our team — don't leak it in commits, screenshots, or the demo video. Use environment variables / `.env` (gitignored).

### Prava production access
- Sandbox is open to everyone immediately via the Prava Developer Dashboard.
- **Temporary production access** can be requested Aug 1–8 via Dashboard → API Key Page → Production Tab → select "Hackathon" → fill the form. Not automatic — Prava reviews it.
- Stay in sandbox until the full flow works reliably end-to-end, THEN request production if we want a live real-money demo moment. Not required to win — sandbox transactions count as "real" for judging as long as they're not mocked/faked.
- Restricted categories (tobacco, gambling, betting) cannot go to production — irrelevant to us (travel/consumer goods).

### OpenAI credits
- **$100 in API credit has already been issued to all participants who applied by Jul 30** (this includes our team, per the Prava email). Check the OpenAI dashboard billing page to confirm it landed — if missing, post in the Discord thread.
- $10,000 credit pool for OpenAI-track winners/finalists on top of that.

### What actually gets judged (from the Builder Handbook, Section 2)
1. End-to-end functionality — does intent → result actually work live?
2. Creativity and novelty
3. User value and market feasibility
4. **Prava implementation** — must be meaningful and central, not a bolt-on. A mocked payment presented as a real transaction is an explicit disqualifier risk — "If you claim an order was placed, show the completed checkout result. Creating a payment session alone is not a completed order."
5. Track implementation (if going for a partner track)
6. Product experience — demoable, coherent, understandable
7. "What happens next" — could this be a real product/startup

**Explicit anti-patterns called out by the organizers** (avoid these on stage): a generic chat wrapper, a common idea reproduced with no new insight, a mocked payment presented as a transaction, partner tech bolted on only to qualify for a track.

### Prize tracks and rewards (published)
| Track | Reward | What must be true |
|---|---|---|
| Prava Overall Finalist | up to $10k Prava credits | Working transaction, useful, original, trustworthy |
| OpenAI | $100/participant + $10k to winners | OpenAI models/Codex materially used, Prava still required |
| Visa Intelligent Commerce | $5,000 cash | Transaction completion, permissions, controls |
| Linq iMessage Agent | $1,000 cash + $5k Linq credits | Linq is a **core interface**, not decorative |
| Localhost Startup-Ready | $5,000 Anthropic credits | Real product potential, founder commitment |
| Project NANDA Adapter | $1,000 OpenAI credits | Reusable Prava adapter for NANDA Town, documented, PR submitted |
| Senso Discovery & Trust | $7,500 Senso credits | Senso **materially** influences a merchant/discovery decision, not just logged |

Given our scope and time, **priority order to actually chase**: (1) Prava Overall, (2) OpenAI, (3) Senso (cheap to wire, real prize), (4) NANDA (cheap to wire). Visa and Linq require deeper, different integrations (Linq needs iMessage as the core interface — skip unless there's spare time) — do not chase these unless the core product is already rock solid.

### Prava integration choice
Handbook recommends **SDK/API** for hackathon builds needing an embedded/native payment experience with full control — this is our pick (not MCP or CLI, which need production access and suit chat-native or terminal-only agents).

### Rules to not violate
- Must disclose any pre-existing work. **Our disclosure**: the project brief, architecture, and application answers were drafted before the official build window in prep conversations — this is planning/ideation, not built product code. All actual code, repo commits, and working integrations must be built inside the official window (Jul 31 7PM PT onward). State this explicitly in the submission's disclosure section.
- No fake transactions, fabricated results, or misleading demos — sandbox transactions are fine and expected; mocked ones must be clearly labeled as mocked, not claimed as completed orders.
- Don't expose API keys/card details in repos or the demo video.

---

## 1. PROJECT: HUMSAFAR

**One-line pitch:** Humsafar is a team of AI agents that spends one shared budget together — you give it a goal and a total budget, specialist agents negotiate how to split the money across categories, and each agent buys its part on its own locked, single-merchant Prava card so no agent can ever overspend or touch the rest of the money.

**Why "Humsafar":** means "fellow traveler / companion for the journey."

**The problem:** every AI shopping agent today is a solo actor — one model, one purchase, no way to make cross-category tradeoffs when a goal is messy and the budget is finite ("Plan my Goa trip under ₹30k" = flights + stay + food + activities all competing for one pot). Giving one agent a real card also means one bug/bad merchant/prompt-injection can drain everything.

**The core mechanic (this is the whole product):**
1. Orchestrator takes goal + total budget.
2. Spins up specialist agents per category (Flights, Stay, Food, Guide/Activities).
3. Specialists **negotiate over the same finite pot** — each argues for its share, pushes back on others.
4. A neutral **Mediator** arbitrates until the split sums to ≤ budget and no agent's minimum viable ask is violated.
5. Orchestrator mints a **merchant-scoped, one-time Prava credential per agent**, sized to its agreed slice. With Prava's current REST API, each merchant requires its own approved listed mandate; a future batch/multi-merchant approval flow is required to deliver the intended single-tap UX honestly.
6. Each agent completes a **real transaction** on its own card — never touching a raw card number, never able to reach another agent's slice or the rest of the money.
7. Target UX: user approves **once**, up front, then watches the team reason, argue, and buy. Current REST-backed MVP: one listed mandate approval per merchant, after which repeat charges against that merchant need no new passkey. Do not claim the target single-tap flow is live until Prava exposes or confirms a batch/multi-merchant approval mechanism.

**Why multi-agent is load-bearing, not decorative:**
1. Resource contention — several agents competing over one pot is impossible to reason about with a single agent.
2. Isolation of blast radius — each agent's own scoped card means a compromised/buggy agent can only damage its own slice.

---

## 2. AGENT ARCHITECTURE

- **Orchestrator ("The Planner"):** parses goal+budget, decides which specialists are needed, kicks off negotiation, holds the master Prava mandate, mints per-agent scoped cards after allocation, produces the final plan + running audit.
- **Specialist Buyer Agents** (one per category — Flights, Stay, Food, Guide/Activities): discover real options, estimate what they need, argue for budget share, push back on others, then discover → decide → checkout on their own scoped card.
- **Mediator ("The Arbiter"):** does not negotiate for itself; validates fairness, resolves conflicts, prevents any one agent grabbing the whole pot, structures the final allocation. This buyer-pushes/mediator-arbitrates loop was refined by borrowing the negotiation structure from a teammate's separate prior project ("Accord" — buyer/seller/mediator agents for B2B agreements; we adapted the buyer/mediator pattern, not the seller side, since we don't have a seller).
- **(Optional) Guardian check:** lightweight intent/anomaly check before any card is minted — one internal check, not the headline feature (that category is already crowded — Fystack, ATXP, Fireblocks, Airwallex, Meridian all do spend-firewall products).

### Adopted from AiDHD (a same-hackathon teammate-adjacent project, reviewed for inspiration, not copied structurally — see comparison below)
1. **Partial-failure recovery:** if one specialist's booking fails, the orchestrator re-negotiates ONLY that agent's slice, not a full restart.
2. **Graceful credential degradation:** every external integration sits behind a thin adapter that falls back to realistic fixture data if a live key/API is missing or flaky — logged which one was used. Never hard-block on a dead key mid-demo.
3. **Bounded multi-track wiring:** a trust check per specialist plus AgentFacts and a basic A2A ping are useful integration foundations. They do **not** open the Senso or NANDA tracks by themselves: claim Senso only after a verified live Senso decision materially affects merchant selection, and claim NANDA only after the public AgentFacts endpoint is registered and any required adapter PR/evidence is submitted.
4. **Confirmation fan-out:** after all agents finish, fan a summary out to at least one channel.

### Deliberately NOT adopted from AiDHD
Their multi-channel group-of-humans input model (WhatsApp/iMessage/web ingestion + voting) — different product thesis, would dilute ours if bolted on now. Kept as a documented Phase 3 idea only.

---

## 3. PRAVA MECHANIC (the core technical bet)

Target flow: one approval → mediator-approved split → orchestrator mints a merchant-scoped one-time credential per agent → each agent transacts on its own credential. Current verified REST flow: one passkey-approved listed mandate per merchant → repeated single-use credentials can be minted against that mandate within its caps without another passkey. Merchant and amount enforcement happen at the card-network level.

**Resolved from the official Prava REST documentation on Aug 1, 2026:** [`POST /v1/mandates/{id}/charge`](https://docs.prava.space/api-reference/mandate-charge) mints a fresh single-use credential against an active mandate as many times as its frequency and charge caps allow. A [`listed` mandate](https://docs.prava.space/concepts/mandates) is locked to the merchant approved during setup, and [session creation](https://docs.prava.space/api-reference/create-session) accepts exactly one merchant. Therefore the current API does not establish that one master mandate can cover several merchants. The MVP uses one mandate per specialist merchant behind `mintScopedCard(mandateId, merchant, amountCap)` and fails closed on a mandate/merchant mismatch. Live sandbox verification is still pending a `PRAVA_SECRET_KEY` and approved mandate IDs.

---

## 4. TECH STACK & APIs — ALL FREE, VERIFIED

- **Agent layer:** Python, OpenAI Agents SDK (orchestrator + handoffs + parallel specialists) or CrewAI/LangGraph/AutoGen patterns borrowed for the discovery step of each specialist (these open-source frameworks solve "research + reason about options" well; none of them do budget negotiation or real checkout — that's our actual contribution). Free, open-source.
- **LLM calls:** OpenAI models. $100 credit already issued (see Section 0). Use `gpt-4.1-mini` / `nano` tier for specialist reasoning to stretch the credit, reserve a stronger model for the Mediator's final arbitration only.
- **Search tool for specialist discovery:** Tavily (1,000 free credits/month) or Serper (2,500 free one-time queries) — either covers a weekend build.
- **Flights + Stay:** **Duffel API** — single REST API, 300+ airlines + 2M+ hotel properties. **Test mode is entirely free**, no card, no charge — use `duffel_test_...` sandbox token and Duffel's test cards for checkout simulation.
- **⚠️ Amadeus is DEAD as an option** — self-service portal decommissioned July 17, 2026, new registrations already paused. Do not attempt to sign up for it.
- **Guide/Activities + Food:** live partner API access (Viator, GetYourGuide, OpenTable) needs a partner-approval process that will not clear in 48 hours. Use realistic fixture data shaped like their real response formats, openly disclosed in the submission as an MVP cut and a stated next-step integration.
- **Payments:** Prava SDK/API (sandbox test card above; production access requestable Aug 1–8 if we want it).
- **Backend:** Node.js + Express as the orchestration API / bridge between the Python agent layer and the frontend; streams one-way dashboard events via SSE, as locked in `INTERFACES.md`. Use a separate POST endpoint if a future frontend action needs client-to-server communication.
- **Frontend:** React — live deliberation feed, budget split visualization, per-agent purchase cards, audit log.
- **Mobile flourish (optional):** Flutter screen for the one-tap passkey approve/deny moment.
- **Data:** MongoDB or Postgres for sessions, allocations, audit trail.

---

## 5. COMPETITIVE LANDSCAPE (why this is defensible, not "just X")

| | Humsafar | Crossmint | ATXP | Locus | AiDHD (same hackathon) |
|---|---|---|---|---|---|
| What it is | Consumer product: agents negotiate one shared budget | Infra: wallets/cards for a single agent | Infra: agent-to-agent payment protocol (crypto) | Infra: wallets for agent swarms (crypto) | Concierge for group nights/trips |
| Negotiation layer | **Yes — agents argue over one pot** | No | No (top-down per-task limits) | No (top-down) | No — reconciles *human* preferences into packages, not agent-vs-agent |
| Rails | Prava (Visa network) | Cards + stablecoins | Mostly crypto (USDC/Base) | Crypto (USDC/Base) | Prava (per-category mandates) |

**30-second answer if a judge names a competitor:** "Crossmint, ATXP, and Locus are all infrastructure — a wallet or card with a top-down spending limit, mostly crypto, built for developers. We're not competing with them, we could run on top of them. What none of them do is have multiple agents *negotiate* over one finite pot before anyone spends a rupee, then each execute on its own locked card via Prava."

**Honest self-assessment vs. AiDHD:** AiDHD is more mature in execution (already deployed, live repo) and touches more prize tracks deliberately (Senso, Linq, NANDA all wired in). Humsafar's core mechanic (agent-vs-agent budget contention) is more novel than AiDHD's group-preference-reconciliation. We adopted AiDHD's resilience/degradation/track-wiring patterns (Section 2) without copying its group-input thesis.

---

## 6. WHAT THIS IS NOT (scope guards — don't let the build drift here)
- Not another solo consumer shopping assistant (saturated).
- Not a generic "spend firewall" as the headline (crowded category — keep as one internal check only).
- Not enterprise B2B procurement (wrong scope for 48h).
- Not blockchain/crypto — plain cards via Prava.
- Not (yet) a full multi-channel group-input product — that's a documented future phase, not this weekend's build.

---

## 7. DEMO SCRIPT (target ~3 minutes)
1. Type: "Plan my Goa trip under ₹30k." (5s)
2. Specialists appear and argue over the split; mediator settles it. (45s) ← the wow moment
3. User taps approve once (passkey). (10s)
4. Each agent buys its part live on its own scoped card — real sandbox transactions. (45s)
5. Proof shot #1: an agent's off-goal/over-slice attempt is blocked at the card level, on screen. (25s)
6. Proof shot #2: one agent's booking is deliberately failed; orchestrator re-negotiates only that slice and recovers live. (25s)
7. Final receipt + audit + confirmation fan-out. (20s)

Punchline: "A team of agents spent your budget together — not one of them could overspend it, and when one hit a snag, only its own slice had to be redone."

---

## 8. TEAM & ROLE SPLIT (see individual progress files for live status)
- **Jeswin** — Agent/AI core: orchestrator, specialist agents, mediator, negotiation engine, Prava `mintScopedCard` logic and abstraction.
- **Preethesh** — Integrations & backend: Prava SDK/API wiring (sandbox test card, production request if pursued), Duffel API, Node/Express orchestration service + SSE streaming, credential-degradation adapter, Senso + NANDA wiring, Guide/Food fixture data.
- **Deepthi** — Frontend, demo & submission: React dashboard (deliberation feed, split viz, purchase cards, audit log), confirmation fan-out, optional Flutter passkey screen, demo video, Devfolio submission writeup and disclosure section.

Each person's `/progress-<name>.md` is the source of truth for what's actually been done — read all three before starting a new work session, not just your own.

---

## 9. GIT BRANCH PLAN

Each teammate must develop and push only from their assigned personal branch. Do not push feature work directly to `main`, and do not push commits to another teammate's branch.

| Person | Assigned branch | Work owned on that branch |
|---|---|---|
| Jeswin | `jeswin/agent-core` | Agent/AI core, orchestration, negotiation, mediator, and scoped-card abstraction logic |
| Preethesh | `preethesh/integrations-backend` | Integrations, backend, streaming, adapters, and fixture data |
| Deepthi | `deepthi/frontend-demo` | Frontend, demo, submission material, and confirmation UI |

For each phase: update local `main`, create or switch to the assigned branch, make and test the scoped change, update only the owner's progress log, commit, and push that personal branch. Open a pull request from the personal branch into `main`; merge only after checking interfaces and conflicts. After a pull request is merged, each teammate should update local `main` and rebase or merge it into their own branch before continuing. Never force-push a shared or protected branch.

Before the first GitHub push, remove all card details, API keys, and other secrets from tracked Markdown and source files, replace them with environment-variable references, and confirm `.env` files are ignored. Run a secret scan on the commits being proposed; do not rely on a later deletion, because a secret remains in Git history after the file is edited.
