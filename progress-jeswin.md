# Progress Log — Jeswin (Agent/AI Core)

**Role scope:** Orchestrator, specialist agents, mediator, negotiation engine, the `mintScopedCard` abstraction (logic only — Preethesh owns the actual Prava API call underneath it).

**Assigned Git branch:** `jeswin/agent-core`. Push work only to this branch and open a pull request into `main`; do not push feature work directly to `main` or to another teammate's branch.

**Required Git workflow:** update local `main` → create or switch to `jeswin/agent-core` → do and test the work on that branch → commit and push `jeswin/agent-core` → open a pull request and merge it into `main` after review and conflict checks. After merging, update local `main` before starting the next phase.

**Before every session:** read `/brainstorming.md`, `/INTERFACES.md`, `/progress-preethesh.md`, and `/progress-deepthi.md` in full, THEN this file, before writing or changing anything.

**Every time the AI makes a change:** append a new entry below. Never delete old entries — this is a log, not a status board. Include: timestamp, what changed, why, what's blocked, what you need from another teammate, and the exact git commit hash once pushed.

---

## Entry format
```
### [DATE TIME] — <short title>
- Changed: ...
- Why: ...
- Blocked on: ... (or "nothing")
- Needs from Preethesh/Deepthi: ... (or "nothing")
- Commit: <hash> (pushed to <branch>)
```

---

## Log

### [not started yet]
- Changed: n/a
- Why: n/a
- Blocked on: n/a
- Needs from Preethesh/Deepthi: confirm the `mintScopedCard(mandateId, merchant, amountCap)` function signature Preethesh will expose, before wiring the orchestrator's card-issuance step against it.
- Commit: n/a

### [2026-08-01 12:59 IST] — Added Jeswin's branch workflow
- Changed: documented the required create/switch, work, test, commit, push, pull-request, and merge workflow for `jeswin/agent-core`.
- Why: ensure Jeswin's work stays isolated from `main` until it has been reviewed and checked for conflicts.
- Blocked on: nothing
- Needs from Preethesh/Deepthi: review interface changes before the branch is merged into `main`.
- Commit: n/a (documentation updated locally; not pushed)

### [2026-08-01 14:30 IST] — Built the agent core end to end
- Prompt: read every Markdown file, work as Jeswin's senior agent/AI-core owner, validate and decide issues independently, keep the Markdown files current, and use the personal-branch-to-`main` workflow.
- Files changed: added `agents/humsafar/{__init__,__main__,money,models,discovery,negotiation,mediator,guardian,cards,checkout,events,orchestrator,llm}.py`, `agents/tests/{test_money,test_negotiation,test_events,test_orchestrator}.py`, `agents/README.md`; edited `INTERFACES.md` and `.gitignore`.
- Changed: implemented the orchestrator, four specialist buyer agents, the mediator, and the multi-round negotiation engine, plus the guardian pre-mint check, the locked-event emitter, and the `mintScopedCard` client over Preethesh's `POST /api/scoped-cards`. Added the partial-failure recovery path and both demo proof shots.

**Phase started here and why:** the negotiation engine first, before any integration work. It is the one thing no teammate can build around me, it is what makes the multi-agent claim load-bearing rather than decorative, and `build-prompts.md` calls out specifically that "the mediator settles it" must not stay hand-wavy. Everything downstream (cards, checkout, dashboard) only has meaning once there is a defensible allocation to execute.

**Decisions I made, and the reasoning:**
1. **All money is integer paise; rupees appear only at the wire boundary.** Allocation is the single place in this project where a float rounding error is an actual overspend, and `scopedCardService.validateInputs` rejects any `amountCap` with more than two decimal places. Proportional splits use the largest-remainder method so shares always sum to exactly the pot.
2. **The LLM decides what an agent *says*; the engine decides what an agent *gets*.** Every rupee comes from deterministic arithmetic. This is a correctness decision first — "the model decided the split" is not an answer I want to give a judge — and a resilience one second: no key, no credit, or a rate limit degrades us to templated dialogue with identical numbers instead of a dead demo. There is no `OPENAI_API_KEY` in this workspace, so the default run path is the deterministic one and it is fully tested.
3. **An ask is always the price of an option the agent actually found.** My first working version let agents negotiate abstract slices, then buy the best option that fit — which stranded ₹7,100 of ₹30,000 and made the negotiation decorative. Now conceding means downgrading your actual pick, so the agreed split is exactly what gets bought, and after convergence the mediator spends the leftover on whichever upgrade buys the most rating per rupee. Demo spend went from ₹22,900 to ₹28,800 of ₹30,000.
4. **The over-cap proof shot is deliberately not blocked in software.** The guardian blocks off-goal purchases (wrong category, unknown merchant) and names itself as the software layer when it does. Over-cap attempts are passed through to the card layer on purpose, because a guardian `if` presented on stage as card-network enforcement is precisely the "mocked payment presented as a transaction" the handbook lists as a disqualifier risk. The stub also labels its own refusals as simulated, and if an over-slice charge is ever *authorised* the orchestrator prints a loud warning not to present it as a block.
5. **Specialist selection is keyword-based, not an LLM call.** Which agents exist is structural; a hallucinated category produces a split the locked event schema cannot represent.

**Interface changes — Preethesh and Deepthi please read (`INTERFACES.md` was edited):**
- **§5 (mine) has a new third exit.** Rule 2 had a hole: if the sum of the agents' minimum viable asks already exceeds the budget there is no remainder to distribute, and the rule taken literally allocates *more than the user has* — the exact failure this product claims to prevent. It is reachable with an ordinary input ("Goa trip under ₹9,000" when the category floors sum to ₹16,100). Added `budget_below_floor`: scale the floors down proportionally to fit exactly and have the mediator say plainly that the budget is short and by how much. No signature or event shape changed.
- **§2 gained producer-behaviour notes (no shape changes).** The one that will bite Deepthi if missed: **`split_update` can be emitted twice with the same `round`** — once for the converged split, once after the mediator's surplus pass. Render the most recent one; don't key state by `round` alone. Also: `final_receipt` is always the last event of a run and is safe as the "finished" signal; early-round splits may legitimately exceed `totalBudget` (that overflow is the negotiation beat); all four category keys are always present, zero-filled.

- Validation: read all six Markdown files in full plus Preethesh's `app.js`, `eventSchema.js`, `scopedCardService.js`, and `server.js` before writing code. `python3 -m unittest discover -s tests -t .` passes 66/66, including a sweep asserting the allocation never exceeds the budget for every budget from ₹5,000 to ₹60,000 in ₹500 steps, and a test that no card token reaches any event. Installed Node locally (it was absent from this workspace) and ran the **real** backend: a full `--demo` run delivered **50 events, all accepted, zero delivery failures**, confirmed received over `GET /api/events` by an SSE client, with `final_receipt` last. Also exercised `--live-cards` against the real `POST /api/scoped-cards`: it returns `422` with `"PRAVA_SECRET_KEY is not configured"`, my client surfaces the locked failed shape, and the run reports ₹0 spent rather than claiming a purchase. Secret scan over the staged diff found env-var *names* only, no values.
- Decision on a mismatch I found: `INTERFACES.md` §1 says Jeswin passes a mandate belonging to the specialist's merchant, but the backend registry is keyed `mandateId -> merchant`. Rather than add a second source of truth, `cards.load_mandate_registry` inverts the same `PRAVA_MANDATE_MERCHANTS_JSON` the backend reads. If a merchant has no registered mandate, the client refuses to mint locally instead of sending a call that must fail closed anyway.
- Why: the negotiation had to be defensible before anything spends money, and both proof shots had to be real rather than staged, because the handbook penalises exactly that.
- Blocked on: nothing blocking. Live Prava issuance needs `PRAVA_SECRET_KEY` and approved merchant-specific mandate IDs (Preethesh's blocker, not mine); the demo runs fully on stub cards until then.
- Needs from Preethesh: (a) a `Checkout` implementation for Duffel — `agents/humsafar/checkout.py` is the seam, swap `SimulatedCheckout` for the live one and nothing else changes; (b) a `DiscoveryProvider` returning live Duffel/fixture options, same story via `agents/humsafar/discovery.py`; (c) the mandate IDs registered in `PRAVA_MANDATE_MERCHANTS_JSON` for the merchants we actually buy from, or the real proof shot cannot run live.
- Needs from Deepthi: the two §2 rendering notes above, especially the repeated `round` on `split_update`. `python3 -m humsafar --demo` with the backend up gives a full realistic stream to build against — no need to hand-write mocks any more.
- Commit: `48eec48` (pushed to `jeswin/agent-core`; pull request into `main` follows this log entry)

### [2026-08-01 15:10 IST] — Merged PR #1, then wired the agents to Preethesh's discovery and trust routes
- Prompt: continue.
- Files changed: added `agents/humsafar/trust.py`, `agents/tests/test_integrations.py`; edited `agents/humsafar/{discovery,orchestrator,__main__,__init__}.py`, `agents/README.md`, `INTERFACES.md`.
- Changed: merged `origin/main` into `jeswin/agent-core` (Preethesh's `d211855` travel discovery + mandate workflows landed while my PR was open), merged PR #1 into `main`, then consumed the two new routes he shipped: `BackendDiscovery` calls `POST /api/discovery/:category` behind the existing `DiscoveryProvider` seam, and `TrustClient` calls `POST /api/trust/check` before each purchase. Added `--live-discovery` and `--trust` CLI flags.

**⚠️ Finding Preethesh needs to see — the current backend fixtures cannot produce a negotiation.** Running `--live-discovery` against `backend/src/fixtures/discovery.js` gives two options per category, and the best of each sums to **₹17,400 against a ₹30,000 budget**. There is no contention, so the agents converge in round 1 with nothing to argue about — the 45-second "wow" beat in `brainstorming.md` §7 simply does not happen, and the whole multi-agent claim looks decorative on stage. My local fixtures in `agents/humsafar/discovery.py` are built as a price ladder specifically to create contention (4–5 options per category, best-of-each ≈ ₹35,600 vs a ₹30,000 budget, converging in 2 rounds after real concessions and spending ₹28,800). **I have not edited his file** — `INTERFACES.md` §3 puts that data under his ownership and silently rewriting it is exactly the unannounced change the file warns about. Preethesh: either widen the backend fixtures to a similar ladder (mine are free to copy) or we keep local fixtures as the demo default. The CLI default is already local fixtures, so nothing is blocked either way.

**Decisions:**
1. **`vendor` is used as the merchant identifier** for options from the discovery route, which returns no `merchant` field. That is what a mandate is registered against in `PRAVA_MANDATE_MERCHANTS_JSON`. If a real merchant identifier is added later the code prefers it automatically.
2. **Duffel flight offers have no `rating`, so they are treated as unrated (0.0), not given an invented score.** The flights agent therefore prefers the cheapest offer and the mediator will not spend surplus "upgrading" a flight. Inventing a rating would make the demo livelier by fabricating data, which is not a trade I will make in a build whose whole pitch is that its numbers are real.
3. **The trust check materially changes the purchase** rather than just annotating it — a flagged merchant loses the sale to the next acceptable option in the same slice, which is what the Senso track asks for. It is not a hard block: the backend heuristic labels itself a fixture in its own `reason` string, and an unreachable trust service is advisory, because letting a flaky dependency veto every purchase is a worse failure than proceeding with the flag recorded.
4. **Discovery falls back to local fixtures on an unreachable or empty response**, and the run prints the source each category actually resolved to — a fallback is never reported as live.
- Validation: 80 Python tests pass (14 new), including a real loopback HTTP server exercising the discovery envelope, missing-rating and missing-merchant rows, unusable rows, empty responses, and the trust switch changing which merchant is bought. Preethesh's 21 backend tests still pass after the merge. Full-stack run against the live backend with `--demo --trust`: **50 events delivered, zero failures**, all nine event types present, both proof shots firing (`blocked_attempt` and `renegotiation_triggered`), 4 trust checks, ₹28,800 spent of ₹30,000.
- Bug caught by a test and fixed: the trust note was reaching the streamed `purchase_result` but not the `Purchase` audit record, so the final receipt would have disagreed with the live feed. Both now build from one string.
- Interface changes: `INTERFACES.md` §2 gained a consumer-behaviour block describing exactly how the agent layer reads the discovery and trust responses. No shapes changed and no signatures changed.
- Blocked on: nothing. Live Prava issuance still needs `PRAVA_SECRET_KEY` and approved mandate IDs (Preethesh's blocker); the demo runs fully on stub cards.
- Needs from Preethesh: (a) a decision on the fixture-contention finding above; (b) a `Checkout` implementation for Duffel — `agents/humsafar/checkout.py` is the seam, swapping `SimulatedCheckout` changes nothing else; (c) mandate IDs registered for the merchants we actually buy from, or the real card-level proof shot cannot run live.
- Needs from Deepthi: `python3 -m humsafar --demo --trust` with the backend up now gives a complete realistic stream, including trust annotations in `purchase_result.details`. The §2 rendering notes from my previous entry still apply — especially that `split_update` can repeat for a round.
- Commit: `9b2dbd7` (pushed to `jeswin/agent-core`; pull request into `main` follows this log entry)

### [2026-08-02 02:10 IST] — OpenAI Agents SDK reasoning layer (Priority 0, items 1–5)
- Prompt: pull `main`, read `execution-plan.md` and `precaution.md`, and begin the OpenAI Agents SDK work.
- Files changed: added `agents/humsafar/{ai,intent,schemas,config}.py`, `agents/requirements.txt`, `agents/tests/test_ai.py`; edited `agents/humsafar/{llm,negotiation,mediator,orchestrator,__main__}.py` and `.env.example`.
- Changed: replaced the Chat Completions narrator with Agents SDK `Agent` + `Runner` and structured outputs. Five agent identities — four specialists, Intent, Mediator — separated by name/instructions/output schema rather than by key, per the one-server-side-credential rule. Added goal parsing, the mediator explainer, per-`runId` tracing, a pinned dependency file, and a stdlib `.env` loader for the Python layer.

**Two safety properties made structural rather than instructed:**
1. **No model-facing schema contains a money field.** A model cannot state an allocation, price, floor or cap as structured data because there is nowhere to put one. Stronger than instructing it not to — an instruction can be ignored, a missing field cannot be filled.
2. **`mentions_only()` rejects any agent line containing a rupee figure that was not supplied to it.** Telling a model not to invent numbers is not a guarantee; checking its output is. A rejected line silently falls back to the deterministic sentence, so a wrong figure never reaches the screen with an agent's name on it. The audience gets duller prose, never a false number.

**Parsed priorities are material, not decorative.** An emphasised category concedes less of its slack and wins surplus upgrades sooner. Priorities enter the engine as bounded multipliers alongside slack, never as amounts, and concession caps stay at raw slack so a priority can never push an agent below its floor. Verified empirically across budgets rather than assumed: the split changes at ₹20,000–₹28,000 where the budget is contested, and is **correctly inert at ₹34,000**, where every agent already holds its best affordable option and there is nothing left to trade. Both behaviours are locked by tests — the saturation test exists to stop a future change making emphasis buy a *worse* option just to look responsive.

- Bug caught by my own test: my first assertion used the ₹30,000 demo budget and failed. Investigating showed the budget is saturated there, so priority genuinely cannot move anything. I probed budgets from ₹18,000–₹34,000 before concluding the mechanism worked and the test was wrong, rather than weakening the assertion to make it pass.
- Also fixed: I pinned `openai==2.9.1` from memory; the installed and tested version is `2.52.0`. A pin that does not match what was tested is worse than no pin.
- Validation: 115 Python tests pass (35 new), every one injecting a fake runtime so the routine suite makes **no paid network calls**. Zero-key run is byte-identical to before this change — ₹28,800 of ₹30,000, same four purchases, same blocked attempt. `openai-agents 0.19.2` installed and its API surface verified directly (`Agent`, `Runner`, `trace(group_id=…)`, `output_type`); confirmed a missing key raises at call time and is caught. Secret scan over the staged diff found no credential values.
- Decision: `HUMSAFAR_REASONING_MODEL` defaults to `gpt-4.1`, not the newer target named in `execution-plan.md`. The plan itself requires an account/model smoke check before that becomes the demo default, and no key was present to run one. It is env-configurable, so switching is a one-line change once verified.
- Interface note for **Preethesh**: `.env.example` gained an agent-layer block. Purely additive; no backend variable was changed or reordered. The Python layer now reads the same shared `.env` the backend loads via `--env-file`.
- Interface note for **Deepthi**: `RunConfig` now carries a `run_id` (auto-generated when absent) to correlate the run across the approval protocol in §7 and the OpenAI trace group. Orchestrator messages now include an `[intent: openai|keyword]` tag and per-category emphasis, which is worth surfacing as agent-identity/stage information in the deliberation view.
- Blocked on: nothing in code. A live smoke run needs `OPENAI_API_KEY` in the gitignored `.env`; the key exists but the file has not been created yet.
- Needs from Preethesh: nothing new for this phase. Priority 1 items 6–9 consume his mandate resolver, structured `THRESHOLD_EXCEEDED`, and the extended card contract — all merged, all next on my list.
- Needs from Deepthi: nothing blocking.
- Commit: `3da620f` (pushed to `jeswin/agent-core`)

### [2026-08-02 03:05 IST] — Live OpenAI testing: four defects only a real key could expose
- Prompt: added the OpenAI API key to `.env` and asked for the live smoke test.
- Files changed: `agents/humsafar/{ai,llm,intent,negotiation,discovery}.py`, `agents/tests/test_ai.py`, `.env.example`.
- Changed: made the Agents SDK path fast, reliable and quota-aware after running it for real. Unit tests with a fake runtime could not have caught any of the four.

**1. Latency.** A full run took **25.9s across 10 sequential model calls**, against a negotiation beat meant to last 45s. Specialists in a round argue independently, so they now run concurrently via `ask_many` behind a semaphore. **25.9s → ~7s.**

**2. Wrong model class.** `gpt-5-nano` spent **31.8s of extended reasoning** to produce one two-sentence negotiating line, blowing the timeout so all four specialists fell back. Reasoning models are the wrong tool for short in-character dialogue. `gpt-4.1-nano` does it in **2.2s**.

**3. Event-loop churn.** `asyncio.run` creates and destroys a loop per call, and the OpenAI client's connection pool binds to the loop it first used. The mediator failed *every single run* with what looked like a network fault. The runtime now owns one persistent loop for its lifetime. This one cost the most time to find because the symptom named the wrong thing.

**4. Quota — and this needs the team's attention.** Rate limits are **per-model**, and this account is on a free/unverified tier: `gpt-4.1-mini` allows **50 requests per DAY** and was already exhausted during development, with an RPM low enough that three back-to-back runs trip it. Narration is now limited to the opening round (**10 calls → 6**), and a rate-limit response switches the whole run to deterministic text rather than burning the remaining allowance on calls that cannot succeed. Transient transport errors get exactly one retry; rate limits get none, per `precaution.md`.

**Two correctness defects seen live and fixed:**
- Agents argued from positions they had already conceded — the Stay Agent announced it was staying at the Taj after settling for Anjuna Beach Resort. Every figure was one it had been given, so `mentions_only` passed it, but the claim was incoherent on screen. Prompts now carry the current ask, what it currently buys, and that the opening position is gone.
- The Intent Agent **dropped flights and stay from a Goa trip**, non-deterministically, having returned all four for the same goal minutes earlier. A trip with no flights and nowhere to sleep is not a plan, and it silently left most of the budget unspent (₹7,800 of ₹30,000). Model *priorities* are still trusted; its *omissions* are not. Any category a confidently-travel goal needs is restored at neutral weight, while narrowing still survives for non-travel goals — which is what the agent exists to do.
- Validation: 125 Python tests pass. Deterministic output unchanged at ₹28,800 of ₹30,000. Three consecutive live runs each produced **₹28,800 and 4 purchases** whether narration succeeded, degraded, or was rate-limited — which is the resilience property the design exists for. Model availability verified directly against the account: `gpt-5.6-sol`, `gpt-4.1`, `gpt-4.1-nano`, `gpt-5-nano` all serve; `gpt-4.1-mini` is quota-exhausted.
- Decision: `HUMSAFAR_REASONING_MODEL=gpt-5.6-sol` is now the default — the smoke check `execution-plan.md` required has been done and it works with structured output at ~3s. Specialists use `gpt-4.1-nano` for latency and to avoid the drained bucket.
- **Needs from the team (Imran/Preethesh):** please check the OpenAI billing/credits page for this account. The handbook says $100 participation credits were issued, but a 50-requests-per-day ceiling is free-tier behaviour, which suggests the credit was not applied or the account is unverified. `precaution.md` already flags that Discord rollout reports are not proof for a particular account. The demo survives this — one run is comfortably within limits — but repeated rehearsal and recording will not be.
- Blocked on: nothing in code.
- Needs from Deepthi: nothing new. Orchestrator messages carry `[intent: openai|keyword]` and per-category emphasis if she wants to surface agent identity/stage.
- Commit: `1542015` (pushed to `jeswin/agent-core`)

### [2026-08-02 04:00 IST] — Priority 1 items 6–9: approval gate, mandate resolver, credential hygiene, cap proof
- Prompt: continue.
- Files changed: added `agents/humsafar/approval.py`, `agents/tests/test_approval_and_cards.py`; edited `agents/humsafar/{orchestrator,cards,guardian,events,__main__}.py`.
- Changed: implemented items 6–9 against the contracts Preethesh locked in `9f47a99`. Item 10 (taste step) stays deferred — `execution-plan.md` gates it behind proven Prava evidence.

**Item 6 — the cap proof now proves the right thing.** The over-cap attempt runs **before** that agent's own purchase and targets **the merchant it is about to buy from**. Both halves matter: afterwards a `max_charges: 1` mandate is already consumed, so the refusal would come from an exhausted use limit while we claimed card-network cap enforcement; and aimed at any other merchant it would be refused as `MANDATE_MERCHANT_NOT_ALLOWED` — a real refusal, for entirely the wrong reason. `describe_card_block` now names the actual cause: **only `THRESHOLD_EXCEEDED` is described as the amount cap blocking**, and `MANDATE_NOT_ACTIVE`, `TRIES_EXHAUSTED` or an unknown code are explicitly labelled *"not evidence of card-level overspend protection, must not be presented as the proof shot"*.

Reordering exposed a modelling flaw in my own offline stub: it inferred the mandate ceiling from whichever charge arrived first, so once the over-cap attempt moved ahead of the purchase, **the inflated amount became the ceiling and was authorised**. Mandates are now authorised at their slice before any charge, which is what actually happens with Prava. Caught by an existing test failing, not by inspection.

**Item 7 — mandate resolution via `GET /api/prava/mandates/resolve`.** My previous approach inverted `PRAVA_MANDATE_MERCHANTS_JSON` in Python, which duplicated backend state across two processes and could not learn about a mandate approved at runtime by `syncCustomerMandates`. The local map survives only as an offline fallback; the backend is the source of truth whenever reachable.

**Item 8 — approval is server state, not a boolean.** `PolledApproval` drives the §7 protocol: create → poll → consume → only then mint. The digest binds the decision to an exact plan, consumption is one-shot, and **decline, expiry, a failed consume and an unreachable service are all treated identically: do not mint.** `AutoApproval` stays the default for keyless runs and declares itself non-human on the wire (`[auto-approved: no human decision was taken]`) so a fixture run can never be presented as one a person authorised.

**Item 9 — `ScopedCard.safe()` redacts every transient credential**: `cardToken`, `dynamicCvv`, `expiryMonth`, `expiryYear`. `cardId` and `transactionId` survive deliberately — they are identifiers the report endpoint needs, and `precaution.md` permits recording them.

- Validation: **151 Python and 59 Node tests pass** (26 new). Verified **live against the running backend**: a human `APPROVE` produced 4 purchases and ₹28,800; a human `DECLINE` produced **zero purchases, zero spend and no `card_issued` event at all**. Also asserted mechanically that no credential string reaches any event, and that the over-cap attempt precedes the same agent's mint.
- Interface note for **Deepthi**: `approval_requested` now carries `runId`, `approvalRequestId`, `digest` and `expiresAt`; `approval_given` carries `runId`, `approvalRequestId` and `digest`. These are documented in `INTERFACES.md` §2 but **not yet enforced by `eventSchema.js`**, so they are additive and safe. The approval UI needs `approvalRequestId` + `digest` to POST a decision, and `expiresAt` for the countdown. Run `python3 -m humsafar --demo --await-approval` and the agent will genuinely wait for her button.
- Interface note for **Preethesh**: no contract changed. `ScopedCardClient` now calls your resolver; the stub grew an `authorize(merchant, cap)` hook that is a no-op against live Prava, where mandates are provisioned out of band.
- Blocked on: nothing in code. Item 10 and `LiveCheckout` both wait on genuine Prava sandbox evidence, which is the team's current gate.
- Commit: `7dd56c7` (pushed to `jeswin/agent-core`)

### [2026-08-02 15:15 IST] — FIRST REAL PRAVA SANDBOX EVIDENCE — cap decline and credential issuance
- Prompt: worked through the hosted mandate approval with the user, then exercised the mandate.
- Files changed: `agents/humsafar/guardian.py`, `agents/tests/test_approval_and_cards.py`.

**The gate is open.** A mandate was approved end to end on Prava sandbox: hosted page → team test card → issuer OTP → Visa payment passkey → **"Mandate created"**. `npm run prava:verify` now returns `{"authentication":"ok","customer":"found","mandateCount":1}`. Mandate `mdt_01KZ0X8XKE04P027TTDB6X5MEK`, scope `listed` → Duffel, approved ₹100, `status: active`.

**Both proof shots are now real, not simulated:**

| Attempt | Observed result |
|---|---|
| ₹160 against a ₹100 mandate | `status: failed`, `fetchStatus: FAILURE`, `errorCode: DECLINED`, message *"Total amount 160.00 exceeds ..."* — a genuine Visa decline |
| ₹100 against the same mandate | `status: awaiting_result`, `fetchStatus: SUCCESS`, real single-use credentials (`token`, `dynamicCvv`, `expiryMonth`, `expiryYear`), `transactionId: txn_01KZ0XD9RDRXGDP2JHFV47BTKK` |

**Three findings that only a live run could produce:**
1. **The cap decline code is `DECLINED`, not `THRESHOLD_EXCEEDED`.** My classifier accepted only the documented code, so it would have described a real card-network cap decline as *"not evidence of card-level overspend protection"* — failing closed, but wrongly, and throwing away the demo's central proof. `is_cap_decline()` now accepts either the documented code or a generic `DECLINED` whose message states the amount was exceeded. A bare `DECLINED` with no amount reason still does not count, because that code alone could mean insufficient funds.
2. **Prava returns HTTP 200 for a declined charge**, with the outcome in the body. Reading the status code alone would report a decline as a success. My first probe printed "AUTHORISED (!!)" for exactly this reason before I read the body.
3. **A refused over-cap attempt does not consume the mandate** — `status` stayed `active`, `remaining` stayed `100.00`, `lastCharge` recorded `declined`. This confirms the ordering decision in `7dd56c7`: running the cap proof *before* the purchase lets both fit on one `max_charges: 1` mandate. It was reasoned from the docs; it is now observed.

- Validation: 156 Python tests pass (5 new, locking the observed decline shape so a future change cannot silently narrow it back). Credential values were never printed, logged or committed — only field *names* and identifiers.
- Correction to my earlier note: I flagged Preethesh's `authorizeOnly === true` assertion as a bug, then retracted it when a shipping form appeared, then his `7ba86fa` confirmed the original call was right — the sandbox does not return that field. I should have trusted the observed response the first time instead of reversing on one ambiguous screenshot.
- **Flag for Preethesh:** `backend/scripts/createPravaMandateSession.js:55` prints `authorizeOnly: true` as a **hardcoded literal**, not read from the Prava response. The script asserts a property it never observed. Given how carefully this project labels evidence, that line should either read the real field or be dropped.
- Blocked on: nothing for the cap proof. A *completed merchant checkout* still requires a checkout target; the charge sits at `awaiting_result` and must not be reported `APPROVED` without a genuine processor result.
- Needs from Deepthi: the receipt can now show a genuine `sandbox` line for the stay category. Everything else in a default run remains `fixture`, so the run is mixed-mode and must be labelled per line.
- Commit: `5bceb6a` (pushed to `jeswin/agent-core`)

### [2026-08-02 20:55 IST] — credential least-privilege, a retracted audit finding, and the payment blocker identified
- Prompt: Preethesh asked me to figure out payment; the user supplied a Discord dump from another team.
- Files changed: `agents/humsafar/orchestrator.py`, `agents/humsafar/events.py`, `agents/humsafar/llm.py`, `agents/humsafar/negotiation.py`, `agents/tests/test_orchestrator.py`, `INTERFACES.md`, `agents/PRAVA-EVIDENCE.md`.

**The payment blocker is our card, not our code.** `FETCH_AGENTIC_CREDS_ERROR — "Visa 400 — Fetching cryptogram failed"` is now reproduced across every axis we can vary: both Prava flows (mandate charge and standard checkout), both currencies (INR and USD), both merchant countries (IN and US), and amounts from ₹50 to ₹28,800. The passkey ceremony succeeds and Visa's own threshold checks succeed — an over-cap attempt declines correctly with `visaCorrelationId=1785678386_7`. Only cryptogram issuance fails, and `token`, `dynamic_cvv` and `expiry` all come back null.

Another team (`_Devastation__`) hit the **identical error string** on Prava's own Playground. Prava staff called it Visa sandbox flakiness and advised retrying; retrying 4–5 times did not fix it. What fixed it was Yash issuing a **replacement card**. That is the ask now outstanding with Prava for `CARD-17` / `...2341`.

**Corroboration worth recording:** Prava staff stated on the record that reaching `Creds_Generated` **is** the intended outcome at this stage — Birdie: *"working exactly as intended for this stage of the flow"*; Yash: *"that was the expected scenario. Congrats 🔥"*. Our evidence file claims exactly that milestone and no more, so the submission stands whether or not the card is replaced.

**I retracted an audit finding rather than shipping the fix as a bug fix.** An audit flagged `mint(slice_paise)` against `buy(option.price_paise)` as a live money discrepancy — the mandate charged more than the receipt reported. **It is not reachable.** I swept ₹13,000–₹200,000 across the converged, recovery and forced-compromise paths and found **zero** runs where the two differed: allocation already clamps every slice to the price of the option that slice buys. Reporting it as a discovered-and-fixed bug would have been a fabricated finding.

The change is still in, on its own merits: the credential is now minted at the option price, so least privilege is a property of the design rather than a coincidence of the allocator, and the first thing that would have broken the accidental equality is live Duffel inventory. The **mandate** ceiling is untouched at the slice — that is what the over-cap proof fires against. `card_issued` now carries both: `amountCap` (credential) and the additive `mandateCap` (slice), with `amountCap <= mandateCap` asserted.

**Docstring contradiction resolved.** `llm.py` claimed "the engine decides what an agent GETS"; `intent.py` documented two modules away that a parsed priority weight genuinely moves money. The real rule is now stated once: *model output may influence allocation only through bounded, validated parameters — never as an amount.* Also deleted `_argue`, unreachable since batching landed.

- Validation: **202 Python, 139 Node, frontend build and render smoke all pass** (3 new tests). No credential value was printed, logged or committed at any point.
- Needs from Preethesh: nothing blocking. `DUFFEL_ACCESS_TOKEN` is still the only reason inventory is fixture — the live path is wired and is already the default.
- Blocked on: Prava issuing a replacement test card. Everything else in the agent core is done.
- Commit: pending

### [2026-08-02 21:40 IST] — the specialists now genuinely drive allocation
- Prompt: continuing the plan; the multi-agent claim was the weakest part of the submission.
- Files changed: `agents/humsafar/schemas.py`, `ai.py`, `llm.py`, `negotiation.py`, `mediator.py`, `orchestrator.py`, `agents/tests/test_negotiation.py`.

**The problem.** The four specialists never moved a rupee. Their output went only to `_say()`, and their own test asserted it (`test_narration_does_not_change_a_single_rupee`). Asked *"show me where an agent's output changes an amount"*, the only honest answer was the Intent Agent's bounded weight. `build_specialists(ask_strategy=…)` existed for exactly this and had **zero callers**.

**Each specialist now chooses which option it opens the negotiation fighting for** — and it does so without breaking the rule that no model-facing schema may contain a money field. The agent returns an **index** into its own shortlist, not an amount (`schemas.OpeningPosition`). The price attached to that index is ours. A hallucinated figure therefore cannot become an opening ask: there is nowhere to put one. The rejected design had the agent state its ask as a number, which would have needed a money field and moved the guarantee from *unrepresentable* to *validated afterwards*.

Out-of-range indices are **discarded, not clamped** — clamping would silently invent a choice nobody made — and fall back to the engine's heuristic. A strategy that raises is caught. The batched call runs all four agents concurrently at **2.1s**.

Live, the personas diverge exactly as written: the Journey Agent opened on the **cheapest** flight (IndiGo ₹5,700 of a ₹5,700–10,400 range) reasoning about cost versus rating, while the Stay Agent opened on the **most expensive** room (Taj ₹13,100 of ₹4,700–13,100). The engine's heuristic would have opened all four at their best-rated option.

**The finding that mattered more than the feature.** Wiring it up was not enough: I measured it and the choice changed the final split in only **2 of 28 budget bands**. `allocate_surplus` was upgrading every agent back toward its best-rated option, so an agent that deliberately opened cheap was pushed straight back up and its decision vanished from the receipt. Agency that does not survive to the receipt is decoration wearing a better name.

The mediator now **refuses to fund an agent above the option it opened on**. That is a no-op under the heuristic — the opening ask *is* the best-rated option, and the existing rating-gain check already stopped there, which is why every pre-existing surplus and forced-compromise test still passes untouched. With agents choosing, it is what makes the choice stick: **24 of 28 budget bands** now differ. Verified end to end against live OpenAI — at ₹25,000 the Food Agent picked Goa Kitchen (₹4,200) over Gunpowder (₹5,500), a ₹1,300 difference visible in the receipt.

Also resolved: `llm.py` claimed the engine decides every amount while `intent.py` documented a weight that moves money. The rule is now stated once and accurately — *model output may influence allocation only through bounded, validated parameters, never as an amount* — and the opening-position call is the clearest instance of it.

- Validation: **211 Python, 139 Node, frontend build and render smoke all pass** (11 new tests, including a budget sweep re-run with agents driving the asks, and an invariant that no agent is ever funded above its own opening ask). Budget safety is unchanged.
- Needs from Deepthi: the transcript now carries an opening line per agent (*"I'm opening on Taj Udaipur at ₹13,100. …"*) before the first negotiation round. Worth showing — it is the moment the agents commit to a position.
- Blocked on: nothing.
- Commit: pending

### [2026-08-02 21:45 IST] — the app can actually be deployed now
- Prompt: "can u fix it i want it to be proper" — a hosted link is required and nothing was hosted.
- Files changed: `backend/src/session.js` (new), `backend/src/app.js`, `backend/src/server.js`, `backend/src/services/runService.js`, `backend/test/session.test.js` (new), `Dockerfile`, `.dockerignore`, `DEPLOY.md`.

**The blocker was authentication, not hosting.** In development Vite proxies `/api` and injects `INTERNAL_API_TOKEN` on the way through; `vite.config.js` warns explicitly against ever putting that token in client code. Deployed there is no dev server, so the browser had no way to reach the API at all.

The browser now gets a **signed, httpOnly session cookie**, issued by the server when it serves the app shell. The internal token never leaves the server. Routes are split by who legitimately needs them:

| Caller | Reaches |
|---|---|
| Browser session cookie | start/read a run, choose an option, decide an approval, read the stream |
| `Bearer INTERNAL_API_TOKEN` | all of the above **plus** card minting, event publishing, approval create/consume, discovery, trust, every Prava route |

**This is narrower than what development has.** The dev proxy hands the browser the *full* internal token, so anyone with dev tools open can mint a scoped card or publish a forged event into the SSE stream. A session cookie can do neither, and `session.test.js` asserts it route by route.

**A fatal deployment bug found only by running the production build.** `runService` never set `HUMSAFAR_BACKEND_URL`, so the spawned agent used its own default of `http://127.0.0.1:3000`. Render and Railway both *assign* `PORT` — so on any managed host the agent would have posted every event into the void and the dashboard would have sat blank through a complete, successful run. The server now derives the URL from the port it actually bound. Reading the code would not have caught this; the first run against the production build produced **zero events**, which is what exposed it.

Also added a `Dockerfile` (Node 22 + Python 3, frontend built in, healthcheck) and `DEPLOY.md` with Render/Railway steps and a verification recipe.

- Validation: **211 Python, 143 Node** (4 new), frontend build and render smoke pass. Verified end to end against the real production build: intake → choose → approve → receipt, **52 events terminating in `final_receipt`**, 4 `card_issued`, 4 `purchase_result`, ₹19,200 of ₹25,000 — driven entirely through cookie auth with no token in the browser. Confirmed `/api/scoped-cards` returns 401 to a browser session.
- Needs from the team: someone with a Render or Railway account to connect the repo. Everything else is done — env vars are documented in `DEPLOY.md`.
- Blocked on: nothing.
- Commit: pending
