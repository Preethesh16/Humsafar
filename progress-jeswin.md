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
