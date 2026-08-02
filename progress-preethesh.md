# Progress Log — Preethesh (Integrations & Backend)

**Role scope:** Prava SDK/API integration (sandbox test card, production request if pursued), Duffel API (flights + stay), Node/Express orchestration service + SSE event streaming, credential-degradation adapter (live-or-fixture per integration, logged), Senso trust-score check, Project NANDA AgentFacts registration, Guide/Food fixture data shaped like real Viator/OpenTable responses.

**Assigned Git branch:** `preethesh/integrations-backend`. Push work only to this branch and open a pull request into `main`; do not push feature work directly to `main` or to another teammate's branch.

**Before every session:** read `/brainstorming.md`, `/INTERFACES.md`, `/precaution.md`, `/execution-plan.md`, `/progress-jeswin.md`, and `/progress-deepthi.md` in full, THEN this file, before writing or changing anything.

**Every prompt and every file change must be logged:** append a dated entry for every user prompt, including prompts that result in no file changes. Never delete old entries. For a file-changing phase, include the exact files changed, validation performed, technical decision and reason, blockers, teammate needs, and pushed commit hash. For a prompt with no file changes, write `Files changed: none` and `Commit: n/a`; never create an empty commit merely to satisfy the log.

**Engineering standard:** operate as the senior/staff owner described in `build-prompts.md`; validate assumptions and external behavior, inspect failures, make the safest in-scope decision when evidence is sufficient, and record the decision and tradeoff here. Stop and ask only when a choice materially changes product scope, requires new authority, or cannot be validated safely.

**Reminder — do not commit the Prava sandbox test card, any API keys, or `.env` files.** Keep them gitignored.

---

## Entry format
```
### [DATE TIME] — <short title>
- Changed: ...
- Why: ...
- Blocked on: ... (or "nothing")
- Needs from Jeswin/Deepthi: ... (or "nothing")
- Commit: <hash> (pushed to <branch>)
```

---

## Log

### [not started yet]
- Changed: n/a
- Why: n/a
- Blocked on: confirming with Prava sandbox whether one mandate can mint multiple scoped cards directly, or whether it's one token per merchant per purchase (see brainstorming.md Section 3) — resolve this FIRST before building the rest of the payment layer.
- Needs from Jeswin/Deepthi: nothing yet
- Commit: n/a

### [2026-08-01 12:54 IST] — Documented person-specific Git branches
- Changed: added an explicit branch-per-person plan to the project documentation and assigned `preethesh/integrations-backend`, `jeswin/agent-core`, and `deepthi/frontend-demo` to their respective owners.
- Why: isolate each teammate's work during pushes and require reviewed pull requests into `main` instead of direct feature pushes.
- Blocked on: nothing
- Needs from Jeswin/Deepthi: use only the assigned personal branch and open pull requests into `main` for integration.
- Commit: n/a (documentation updated locally; not pushed)

### [2026-08-01 13:11 IST] — Re-grounded role and strengthened operating workflow
- Prompt: read every Markdown file, operate as Preethesh's senior integrations/backend owner, validate and decide issues carefully, log every prompt and file change, and use the personal-branch-to-main workflow.
- Files changed: `brainstorming.md`, `build-prompts.md`, `progress-jeswin.md`, `progress-deepthi.md`, and `progress-preethesh.md`; added the existing untracked `INTERFACES.md` contract document to the branch for team use.
- Changed: made `INTERFACES.md` required reading, changed the ambiguous WebSocket/SSE references to the locked SSE decision, and required prompt-level plus file-level logging without empty commits.
- Validation: read all six Markdown files in full; confirmed `main` matched `origin/main` before creating `preethesh/integrations-backend`; checked the locked contracts against the documented role boundaries; ran the credential-pattern scan and Markdown diff check; corrected one trailing-space failure in `INTERFACES.md`.
- Decision: keep SSE as the only dashboard stream because the flow is one-way and `INTERFACES.md` already locks it; use separate POST endpoints for future client-to-server actions.
- Why: remove transport ambiguity, protect cross-team interfaces, and make the requested accountability workflow explicit.
- Blocked on: nothing
- Needs from Jeswin/Deepthi: read `INTERFACES.md` before boundary work and flag proposed contract changes before implementation.
- Commit: `a906ab0` (pushed to `preethesh/integrations-backend`; fast-forward merged and pushed to `main`)

### [2026-08-01 13:18 IST] — Started implementation and resolved Prava mandate model
- Prompt: start working on implementation.
- Files changed: `.gitignore`, `.env.example`, `package.json`, `backend/src/integrations/pravaClient.js`, `backend/src/services/scopedCardService.js`, `backend/test/pravaClient.test.js`, `backend/test/scopedCardService.test.js`, `INTERFACES.md`, `brainstorming.md`, and `progress-preethesh.md`.
- Changed: implemented the authenticated Prava mandate-charge client and the locked `mintScopedCard` service; added fail-closed validation, mandate-to-merchant enforcement, idempotency references, safe structured logging, environment templates, tests, and corrected architecture documentation.
- Validation: re-read all six Markdown files; fetched GitHub and confirmed this branch matched `origin/main`; checked official Prava concepts, session, authentication, and mandate-charge references current on Aug 1, 2026; `npm test` passed 8/8 tests; Node syntax checks and `git diff --check` passed; credential scan found no committed secret value.
- Decision: implement one `POST /v1/mandates/{id}/charge` per scoped credential; require a registered mandate-to-merchant match; map Prava `instructionId` to `cardId`; never log credential fields; fail closed without live configuration rather than presenting a fixture payment as real.
- Why: Prava documents repeated fresh credentials per active mandate, but listed mandates and setup sessions are single-merchant. Claiming one mandate across several merchants would be technically unsupported and misleading.
- Blocked on: live sandbox verification requires a local `PRAVA_SECRET_KEY` and active merchant-specific mandate ID; neither is present in the workspace.
- Needs from Jeswin/Deepthi: Jeswin should treat `mandateId` as merchant-specific; Deepthi must not label fixture or failed card issuance as a completed live payment.
- Commit: `60b34a4` (pushed to `preethesh/integrations-backend`; merge to `main` follows this log finalization)

### [2026-08-01 13:26 IST] — Added Express API and replayable SSE stream
- Prompt: continued implementation under the same request after completing the Prava adapter phase.
- Files changed: `.env.example`, `package.json`, `package-lock.json`, `INTERFACES.md`, `backend/src/app.js`, `backend/src/server.js`, `backend/src/events/eventSchema.js`, `backend/src/events/eventHub.js`, `backend/test/app.test.js`, `backend/test/eventSchema.test.js`, `backend/test/eventHub.test.js`, and `progress-preethesh.md`.
- Changed: added Express 5.2.1, health and scoped-card routes, authenticated internal event ingestion, locked event validation, SSE event IDs and bounded replay, safe loopback defaults, and non-loopback token enforcement.
- Validation: `npm test` passed 14/14 tests; started the real server; verified `/health`; posted an `agent_message`; connected to `/api/events` and received the retry directive plus the replayed JSON event; stopped the server cleanly.
- Decision: keep the dashboard stream unauthenticated for browser `EventSource` compatibility, protect state-changing POST routes when `INTERNAL_API_TOKEN` is configured, and refuse non-loopback startup without that token.
- Why: this gives Jeswin and Deepthi a small, debuggable contract boundary while avoiding an unauthenticated mutation API on a network deployment.
- Blocked on: live Prava issuance remains blocked on a local secret key and active merchant-specific mandate IDs.
- Needs from Jeswin/Deepthi: Jeswin should POST the locked event objects to `/api/events`; Deepthi should consume `GET /api/events` and may use `Last-Event-ID` reconnect replay.
- Commit: `09abcf4` (pushed to `preethesh/integrations-backend`; merge to `main` follows this log finalization)

### [2026-08-01 13:31 IST] — Clarified implementation status
- Prompt: asked what happened after the implementation update.
- Files changed: `progress-preethesh.md` only, to satisfy prompt-level logging; no implementation files changed.
- Changed: recorded a plain-language status clarification.
- Validation: confirmed `preethesh/integrations-backend`, `main`, and both corresponding GitHub branches were synchronized at `2ce60ac` before this log-only update.
- Decision: pause additional implementation until the user confirms the next phase; do not attempt a live Prava call without local credentials and approved mandate IDs.
- Why: the completed code is healthy, while live sandbox execution needs external configuration that is intentionally absent from Git.
- Blocked on: live Prava test credentials and merchant-specific mandate IDs only; local automated/backend behavior is not blocked.
- Needs from Jeswin/Deepthi: nothing new.
- Commit: `966ce3b` (pushed to `preethesh/integrations-backend`; merge to `main` follows this log finalization)

### [2026-08-01 14:18 IST] — Completed remaining backend integrations
- Prompt: finish the remaining task.
- Files changed: `.env.example`, `INTERFACES.md`, `backend/src/app.js`, `backend/src/server.js`, `backend/src/integrations/pravaClient.js`, `backend/src/integrations/duffelClient.js`, `backend/src/integrations/withFixtureFallback.js`, `backend/src/services/mandateService.js`, `backend/src/services/discoveryService.js`, `backend/src/services/trustService.js`, `backend/src/fixtures/discovery.js`, `backend/test/integrations.test.js`, `backend/test/mandateService.test.js`, `backend/test/trustService.test.js`, and `progress-preethesh.md`.
- Changed: completed merchant-specific Prava mandate setup/list-sync/charge-report support; Duffel Flights and Stays searches; labeled Food/Guide fixtures; reusable degradation envelopes; discovery and trust routes; AgentFacts discovery and A2A ping; explicit fixture trust gating.
- Validation: consulted current official Prava and Duffel references; `npm test` passed 21/21 tests; `npm audit --omit=dev` found zero vulnerabilities; all source files passed Node syntax checks; diff and secret scans passed; live server smoke tests verified AgentFacts, A2A ping, fixture-backed Duffel discovery, and fixture trust responses.
- Decision: degrade discovery and trust to visibly labeled fixtures, but keep payment issuance fail-closed; expose AgentFacts locally without claiming external NANDA registry submission; do not claim Senso track evidence because no verified Senso endpoint/key is configured.
- Why: flaky discovery should not kill the demo, while simulated payment success or unverified prize-track claims would violate the project rules.
- Blocked on: real Prava, Duffel, and Senso calls require local credentials; external NANDA registration and production deployment require a public URL. Code paths and honest fixture behavior are complete.
- Needs from Jeswin/Deepthi: pass discovery inputs through the documented routes and display the top-level `source`; never label fixture trust/discovery or failed payment issuance as live.
- Commit: `d211855` (pushed to `preethesh/integrations-backend`; merge to `main` follows this log finalization)

### [2026-08-01 17:18 IST] — Reviewed Jeswin handoff and restored backend-driven negotiation
- Prompt: review Jeswin's completed agent-core handoff, including his request for Preethesh to decide whether the backend demo fixtures should create contention.
- Files changed: `backend/src/fixtures/discovery.js`, `backend/test/integrations.test.js`, `agents/humsafar/discovery.py`, `agents/tests/test_integrations.py`, `INTERFACES.md`, and `progress-preethesh.md`.
- Changed: aligned the backend's labeled offline Goa choices with the agent layer's deliberate price ladder; expanded every category to at least four real options; added fixture-only preference scores; added a regression test locking the ₹16,100 viable floor and ₹35,600 preferred total around the default ₹30,000 demo budget; and replaced the obsolete Vistara option with Air India in both discovery paths and the parser test.
- Validation: fetched and fast-forwarded the latest `origin/main` into `preethesh/integrations-backend`; read all project Markdown files; inspected the agent selection, concession, surplus-allocation, discovery, trust, and checkout paths; reproduced the backend-fixture defect end to end (round-one convergence and only ₹17,400 spent); verified from Air India's official merger notice that Vistara ceased operating under its own brand in November 2024; `npm test` passed all 37 backend/frontend tests; all 80 Python tests passed; `npm audit --omit=dev` found zero vulnerabilities; Node syntax, diff, stale-airline, and credential scans passed; and a real backend plus agent demo streamed all 50 events, negotiated over two rounds, exercised both proof shots, spent ₹28,800, and stayed within budget with all four discovery sources labeled `fixture`.
- Decision: use the same transparent synthetic price ladder on both offline discovery paths. Fixture ratings are allowed only on rows labeled `source: "fixture"`; live Duffel flights remain unrated and must never inherit synthetic scores.
- Why: the former backend set made the four preferred choices total only ₹17,400 against ₹30,000, eliminating the product's central negotiation beat. The new invariant makes the preferred plan exceed budget while keeping a complete floor plan affordable, so concessions are genuine downgrades between purchasable options rather than scripted dialogue.
- Blocked on: live Prava, Duffel, and Senso verification still requires credentials; this fixture correction is not blocked.
- Needs from Jeswin/Deepthi: Jeswin can now use `--live-discovery` without losing negotiation when the backend transparently falls back to fixtures; Deepthi should continue displaying the existing fixture labels. No event shape changed.
- Commit: `7c317f1` (implementation committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 17:40 IST] — Audited what remains before submission
- Prompt: asked what work remains.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: recorded a repo-, contract-, integration-, teammate-branch-, and submission-level readiness audit. The fixture demo is complete, but a judge-valid live commerce run, interactive approval/input UX, deployment, track evidence, and submission assets remain.
- Validation: read all eight Markdown files in full; fetched every GitHub branch and confirmed `main` and `preethesh/integrations-backend` were clean at `1ae3d7d`; found Deepthi's documentation-only `116ecf6` still outside `main`; confirmed no local `.env` and no configured Prava, Duffel, OpenAI, deployment, or internal-auth variables; `npm test` passed 37/37 and Python passed 80/80; installed the exact locked frontend dependencies, then passed the 24-assertion SSR smoke test and production build with zero audit vulnerabilities; inspected the approval, checkout, Prava mandate, Duffel, frontend input, deployment, and fan-out paths; checked the live Devfolio page and current official Prava session/use-limit documentation.
- Decision: prioritize real Prava sandbox evidence and a real checkout before optional prize-track work. The current `max_charges: 1` mandate and post-purchase over-cap attempt must be validated or reordered, because a second invocation could fail from an exhausted use limit rather than prove amount-cap enforcement. Do not claim the stub refusal as card-network proof.
- Why: the public hackathon page requires Prava to be a real part of the product and an agent to complete or enable a transaction. The current demo is honest and reliable, but its cards and checkouts are still simulated by default, approval is auto-granted, and the dashboard goal/budget row is read-only.
- Blocked on: Preethesh must receive a sandbox `PRAVA_SECRET_KEY`, create merchant-specific approved mandates, and choose an actual supported merchant checkout target; Duffel/OpenAI/Senso live paths need their respective credentials; deployment and exact submission cutoff require external platform access.
- Needs from Jeswin/Deepthi: Jeswin should wire a real checkout implementation after the merchant target is selected and expose a non-auto approval boundary; Deepthi should add the interactive goal/budget/approval flow, prepare the demo video and Devfolio writeup/disclosure, and reconcile the documentation-only commit on her branch. Flutter, Senso, and NANDA track evidence remain optional until the core live transaction is proven.
- Commit: `999f874` (status audit committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 17:54 IST] — Decided sandbox versus production access
- Prompt: asked whether Prava production access is required and whether the production-access form from the Prava email should be submitted.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: recorded the access decision and safe operating boundary.
- Validation: checked the current official Prava quickstart, environment, intent-invocation, and production-verification documentation plus the live Devfolio requirements. Prava explicitly positions sandbox for development/testing and production as separately provisioned after verification; Devfolio requires Prava to be a real part of the product and an agent to complete or enable a transaction, but does not require production access.
- Decision: submit the temporary production-access form now because review is asynchronous and optional access may strengthen the demo, but do not wait for it or make it the critical path. Finish and record a genuine sandbox flow first. A real sandbox API result is acceptable evidence; the current local stub is not. Do not use production until checkout is real, approval is explicit, and the team understands merchant/compliance consequences.
- Why: production access requires additional verification and does not turn the current simulated checkout into a real order. Sandbox proves the integration safely and is the fastest credible submission path; applying early preserves the production option without risking the deadline.
- Blocked on: the workspace still lacks `PRAVA_SECRET_KEY` and approved merchant-specific sandbox mandates. The contents of the user's email were not provided, so any form-specific deadline or condition in that email must be followed directly.
- Needs from Jeswin/Deepthi: no new code dependency; preserve clear sandbox/production/fixture labels in the demo and submission.
- Commit: `cea9f3c` (access decision committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 18:02 IST] — Locked the step-by-step execution order
- Prompt: confirmed that the remaining work should be completed sequentially, finishing the current access step before starting the next one.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: recorded the agreed order: submit the Prava production-access form without waiting on approval, obtain and verify sandbox access, complete one genuine sandbox transaction and cap-rejection proof, then implement interactive UX/deployment, and finish the video and submission package last.
- Validation: confirmed the working tree was clean and both `main` and `preethesh/integrations-backend` were synchronized before this log entry.
- Decision: keep exactly one active milestone at a time and verify its evidence before moving forward.
- Why: this prevents optional production access and partner-track work from distracting from the sandbox transaction that the core submission needs.
- Blocked on: the user completing the Prava production-access form or sharing its non-secret questions for review.
- Needs from Jeswin/Deepthi: nothing at this step.
- Commit: `278b3bf` (workflow decision committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 22:25 IST] — Guided sandbox API-key creation
- Prompt: shared the Prava dashboard's Create API Key screen and asked whether this is the correct step and what to enter for Merchant URL.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: confirmed this is the sandbox-key step, not the production-access form, and documented the safe field values.
- Validation: inspected the supplied dashboard screenshot, checked the public repository URL, and rechecked Prava's official sandbox/API-key guidance.
- Decision: keep Environment set to `Sandbox`, keep Application name `Humsafar`, and use the existing public project URL `https://github.com/Preethesh16/Humsafar` as the honest Merchant URL until a deployed Humsafar HTTPS URL exists. Do not use `localhost`, an invented domain, or a destination travel vendor's URL.
- Why: the field identifies the Humsafar application/merchant account. The public repository is an owned, reachable HTTPS project URL and is safer than permanently associating the key with a domain the team does not control.
- Blocked on: the user creating the key and storing it locally without sharing or committing it.
- Needs from Jeswin/Deepthi: nothing at this step.
- Commit: `6b79a56` (dashboard guidance committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 22:26 IST] — Confirmed sandbox-only submission path
- Prompt: decided not to pursue the production-access form because it requires a production-ready project and confirmed that the integration will be completed in sandbox.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: removed production approval from the active plan and made Prava Sandbox the sole payment environment for the hackathon build and evidence.
- Validation: confirmed the dashboard is currently on the Sandbox key flow and the official Prava documentation designates sandbox for development/testing while production requires additional verification.
- Decision: create and use the sandbox key, approved sandbox mandates, sandbox credentials, and a clearly labelled sandbox checkout. Do not request or use production access during this build.
- Why: production access adds verification and real-world merchant/compliance risk without being required to demonstrate the integration. Sandbox gives the team the fastest safe path to genuine Prava API evidence.
- Blocked on: the user creating the sandbox key and storing it locally without sharing or committing it.
- Needs from Jeswin/Deepthi: describe successful Prava results as sandbox transactions, never production or real-money transactions.
- Commit: `906a443` (sandbox-only decision committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 22:32 IST] — Reviewed Jeswin's proposed Prava transaction plan
- Prompt: asked whether the attached implementation plan from Jeswin's assistant is worth executing.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: recorded a technical review of the proposed access, over-cap proof, approval boundary, mandate setup, settlement, mandate scope, and verification phases.
- Validation: read the attached 91-line plan in full; compared it with the current Prava client, scoped-card service, agent card/checkout/orchestrator seams, environment loading, contracts, and tests; checked today's official Prava sandbox, REST checkout, mandate charge/report, mandate lifecycle, error, and test-card documentation.
- Decision: accept the plan's priority, operator-script idea, pre-purchase cap test, and approval boundary, but reject execution as written. Reporting `APPROVED` to Prava is reconciliation after a merchant checkout attempt, not checkout execution; it cannot be used by `LiveCheckout` as a substitute for a processor/merchant result. Drop the unsupported one-approval/four-merchant assumption unless Prava support explicitly confirms it, because `any` permits any merchant for a one-time mandate but the documented one-time lifecycle still consumes after one settled charge.
- Why: the proposed Phase 3b could create a completed Prava record without a merchant attempt and then label it a live order, reproducing the exact evidence-integrity risk the project has guarded against. The current locked card shape also omits transaction ID, CVV, and expiry; environment paths are wrong for this workspace; `npm start` does not load `.env`; and moving the cap attempt earlier must target the selected merchant rather than `options[0]`.
- Blocked on: sandbox key creation and a decision from Prava support on whether their documented manual sandbox report is intended as the processor simulation for hackathon evidence, plus an honest checkout target if the submission claims an order rather than only a completed Prava sandbox lifecycle.
- Needs from Jeswin/Deepthi: Jeswin should revise Phase 3 around a real or explicitly simulated processor boundary and a `sandbox` source label; Deepthi must render sandbox separately from production/live. No implementation should begin from the attached plan unchanged.
- Commit: `c49aa3e` (plan review committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 22:45 IST] — Added a zero-transaction Prava sandbox access check
- Prompt: shared the official team sandbox card and access notice, confirmed that a sandbox API key now exists, and asked what to do next.
- Files changed: `package.json`, `.env.example`, `backend/scripts/verifyPravaAccess.js`, `backend/test/verifyPravaAccess.test.js`, and `progress-preethesh.md`.
- Changed: added `npm run prava:verify`, a read-only authenticated mandate-list check that loads the local gitignored `.env`, reports only sandbox/authentication status and mandate count, and never prints credentials or mandate contents. Added `npm run start:sandbox` so the backend can load the same local environment explicitly without changing the zero-config fixture start path.
- Validation: compared the supplied handbook with the existing Prava client and confirmed that sandbox—not production—is the active path; `npm test` passed 40/40, `npm audit --omit=dev` reported zero vulnerabilities, Node syntax and diff checks passed, and the credential scan found only explicit dummy test values. Tests cover the authenticated request, production URL/key refusal, missing customer ID, and absence of transaction creation.
- Decision: verify the key with a read-only request before creating a mandate session or using the unique team card. Enforce the official sandbox origin and `sk_test_` key prefix in the operator command so a mistaken production key cannot be used through this workflow.
- Why: the team card is limited to 30 sandbox transactions per day; authentication/configuration errors should be found without consuming that allowance. The API key and card values remain local and must never be pasted into chat or committed.
- Blocked on: the user must place the sandbox key in a local `.env` file; no key value is available to or needed by source control.
- Needs from Jeswin/Deepthi: nothing for this verification step. Continue labeling any eventual Prava result as `sandbox`, not production.
- Commit: `1d35790` (implementation committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 22:51 IST] — Ranked eligible tracks and audited the maximum-coverage plan
- Prompt: provided the official Builder Handbook again plus Jeswin's assistant's maximum-track win plan, and asked which problem statements and tools best fit Humsafar before continuing sandbox setup.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: recorded the recommended target set: Prava Overall, Visa Intelligent Commerce, OpenAI, and Localhost as deliberate targets; Senso only if real API access arrives quickly; NANDA only after the core transaction and deployment; skip Linq because messaging is not Humsafar's core interface.
- Validation: read the full 383-line handbook and 101-line proposed plan; compared every track's qualification language with the repository's implemented Prava, agent, trust, NANDA, checkout, event, and frontend paths.
- Decision: preserve the plan's core-first sequencing, earlier-deadline assumption, meaningful OpenAI proposal, and Linq skip, but do not execute it literally. Visa eligibility through Prava does not make the track automatic; sandbox must be labeled sandbox; an over-cap charge remains tied to the selected merchant mandate; no `APPROVED` report may be sent without a genuine merchant/test-checkout outcome; a local trust heuristic does not qualify as Senso; and the unrelated card values suggested in the plan must not be used in place of the team's officially issued test card.
- Why: four strong, evidenced track submissions are more credible than six shallow claims. The handbook explicitly penalizes mocked transactions, decorative partner integrations, and misleading results.
- Blocked on: the core track gate remains the local sandbox-key verification followed by one honest end-to-end sandbox checkout. Senso and NANDA additionally require external access/evidence.
- Needs from Jeswin/Deepthi: Jeswin should keep payment enforcement deterministic and OpenAI reasoning grounded; Deepthi should prepare distinct sandbox/fixture labels and track-specific evidence only for integrations actually demonstrated.
- Commit: `a96ddc8` (review committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 23:01 IST] — Final-audited the revised execution plan
- Prompt: provided the revised post-track-review execution plan and asked whether it is final.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: recorded that the target set and broad sequencing are approved, but the document is not executable as final until its remaining payment and coordination defects are corrected.
- Validation: read the full 97-line plan; inspected the current mandate, scoped-card, agent registry, overspend, checkout, approval, source-label and API-route implementations; rechecked today's official Prava sandbox, REST checkout, mandate charge/report, list-mandates, test-card and error references.
- Decision: require these corrections before implementation: (1) never log a full charge response; retain only sanitized status/error metadata, (2) propagate the failed charge's structured `errorCode` because the current `PravaClient` already maps `THRESHOLD_EXCEEDED` to `PravaApiError.code` but `ScopedCardService` drops it, (3) describe over-cap proof as not requiring merchant *checkout*, while still requiring the correct merchant-scoped mandate, (4) close the backend-to-Python mandate-registry gap because backend sync does not update the agent process's environment, (5) correlate approval state by run/request ID with expiry and one-shot consumption rather than global GET/POST state, (6) do not assume a failed cap attempt leaves the one-time mandate usable—confirm with Prava or use separate proof and checkout mandates, and (7) explicitly label a one-real-transaction plus three-fixture demo as mixed-mode unless all four merchant checkouts are genuine.
- Why: without these corrections the plan can leak ephemeral credentials, misclassify a structured decline, reuse stale approval, fail to resolve a mandate in the Python process, or overstate how much of the demo completed through Prava.
- Blocked on: sandbox key verification remains the first safe action; merchant/test-checkout selection and failed-charge mandate lifecycle need Prava confirmation before the proof run.
- Needs from Jeswin/Deepthi: Jeswin must correlate approval and mandate resolution and preserve structured decline causes; Deepthi must present per-purchase sandbox/fixture evidence and never imply all four purchases are genuine from a single Prava checkout.
- Commit: `c46f4d9` (review committed on `preethesh/integrations-backend`; push and merge to `main` finalized by the following log commit)

### [2026-08-01 23:14 IST] — Added the Discord-derived sandbox precaution runbook
- Prompt: supplied a 1,386-line export of Prava support/general Discord conversations, asked me to read everything discussed, identify problems other builders faced, keep them in mind, and create `precaution.md`.
- Files changed: added `precaution.md`; updated `build-prompts.md` and `progress-preethesh.md`.
- Changed: converted explicit Prava-team answers and recurring builder failures into a preflight, mandate, passkey, over-cap, checkout/reporting, approval, demo-labeling, evidence and submission runbook. The document distinguishes confirmed staff answers from unanswered participant questions and omits all card values, credentials and personal identifiers. Added `precaution.md` to every role's mandatory startup reading list so the safeguards persist across sessions.
- Validation: read the complete 1,386-line export in non-truncated chunks despite duplicated channel sections and collapsed/missing thread replies; re-read all project Markdown; compared the findings with the current sandbox verifier, Prava client, mandate service, scoped-card service, separate Python registry, checkout seam, SSE/UI labeling and the current official Prava testing/charge/report references; verified the runbook contains no supplied card number, API key, personal identifier or copied credential.
- Decision: treat a real merchant's expected rejection of a sandbox credential as a genuine sandbox checkout *attempt*, consistent with Prava staff's Discord guidance, but never as a completed merchant order. SDK/API has no included browser harness; session/passkey calls stay deliberate; outdated templates never override current API docs; and unanswered Discord questions remain open rather than becoming assumptions.
- Why: the repeated failures were operational rather than architectural—lost keys, stale/outdated request shapes, passkey friction, no reliable sandbox merchant, browser-harness confusion, test-card declines and unclear limits. A single runbook prevents the team from rediscovering them while preserving truthful payment evidence.
- Blocked on: the four Prava questions listed in `precaution.md`, plus local sandbox-key verification before any transaction-bearing call. Git finalization was initially blocked because `.git` was mounted read-only; write access was restored in the following session and the preserved working-tree changes were finalized without loss.
- Needs from Jeswin/Deepthi: both must read `precaution.md` before changing payment/approval/demo behavior; Jeswin must preserve structured causes and cross-process mandate resolution, and Deepthi must use the exact sandbox/fixture/mixed-mode labels.
- Commit: `567e7af` (precaution runbook committed on `preethesh/integrations-backend` after Git write access was restored)

### [2026-08-01 23:37 IST] — Planned the remaining build across all three owners
- Prompt: asked me to pull first, read every Markdown file and the current plan, then brainstorm and create a three-person remaining-work plan including meaningful OpenAI Agents/API use.
- Files changed: added `execution-plan.md`; updated `brainstorming.md`, `build-prompts.md`, and `progress-preethesh.md`.
- Changed: synchronized the latest `origin/main`, including Deepthi's proposed taste-step contract, then wrote a dependency-gated plan for Preethesh, Jeswin, and Deepthi with acceptance criteria, merge order, timeboxes, cut order, OpenAI agent roles, Prava evidence boundaries, deployment, and submission ownership. Added the plan to every role's mandatory startup reading.
- Validation: pulled the current personal branch, fetched every remote branch, fast-forwarded the four new `main` commits, read all current Markdown and the revised execution-plan context, inspected the current OpenAI narrator/agent CLI/discovery/payment seams, and consulted current official OpenAI Agents SDK, orchestration, tracing, configuration and latest-model guidance. Node tests passed 40/40, Python tests passed 80/80, the frontend render smoke test and production build passed, `git diff --check` passed, and the credential scan found only the repository's explicit fake test keys.
- Decision: use one server-side OpenAI project credential for all logical agents, not one key per specialist. Distinct `Agent` definitions and structured outputs provide identity; deterministic code retains all money, approval, Prava and checkout authority. The OpenAI Agents SDK replaces the decorative Chat Completions-only narrator with intent parsing, grounded specialists, and mediator explanation while preserving zero-key fallback. Deepthi's taste step is conditionally accepted only after genuine Prava evidence, with `runId` correlation and photos cut first.
- Why: this gives the OpenAI track a material product role without allowing model output to move money, keeps the three branches independently actionable behind explicit contract gates, and protects the core transaction from optional track/polish work.
- Blocked on: local `.env` is still absent, so Prava and OpenAI credential smoke checks cannot run. The user must place keys locally without sharing them; Prava's four open operational questions remain listed in `precaution.md`.
- Needs from Jeswin/Deepthi: both must review the shared contract additions in `execution-plan.md` before dependent code. Jeswin owns Agents SDK and deterministic orchestration integration; Deepthi owns interactive UX, provenance, deployment and submission assets.
- Commit: `3334f23` (execution plan committed on `preethesh/integrations-backend`; merge finalization is recorded by the follow-up log commit)

### [2026-08-01 23:44 IST] — Clarified the three-person ownership split
- Prompt: asked whether the remaining work was split specifically among Deepthi, Jeswin, and Preethesh and requested the named breakdown.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: confirmed the three owners and restated their boundaries: Preethesh owns integrations/payment/backend contracts, Jeswin owns OpenAI agent core and deterministic orchestration, and Deepthi owns frontend/product experience, deployment presentation, and submission assets.
- Validation: checked the assignments against `execution-plan.md`; no ownership conflict or unassigned core work was found.
- Decision: preserve one accountable owner per major layer while requiring contract review at shared boundaries.
- Why: clear ownership prevents duplicate implementations and lets the three personal branches progress independently after the contract gate.
- Blocked on: none for this clarification.
- Needs from Jeswin/Deepthi: follow the acceptance criteria and dependency gates in `execution-plan.md`.
- Commit: `5b8e500` (clarification committed on `preethesh/integrations-backend`)

### [2026-08-01 23:45 IST] — Verified main and handed off parallel work
- Prompt: asked me to push the plan to `main`, let Jeswin and Deepthi pull and begin, and identify Preethesh's immediate work.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: recorded the team handoff and Preethesh's first execution sequence from the approved plan.
- Validation: fetched the remote and confirmed both `origin/main` and `origin/preethesh/integrations-backend` point to `bd78d6a`; the working tree was clean before this log entry.
- Decision: Jeswin and Deepthi first update their personal branches from `origin/main`; Preethesh starts G0 by locking the shared interface additions before any dependent implementation.
- Why: contracts must land before the agent and frontend branches implement approval, mandate, choice, and provenance behavior against them.
- Blocked on: Prava and OpenAI live smoke checks still require local, gitignored credentials; contract drafting itself is not blocked.
- Needs from Jeswin/Deepthi: pull `main`, merge it into the assigned personal branch, read `execution-plan.md` and `precaution.md`, and work only within the assigned scope.
- Commit: `1139e07` (handoff committed on `preethesh/integrations-backend`)

### [2026-08-01 23:54 IST] — Implemented the first Preethesh contract and backend phase
- Prompt: identified as Preethesh and asked me to begin and complete Preethesh's assigned work.
- Files changed: `INTERFACES.md`, `backend/src/app.js`, `backend/src/server.js`, `backend/src/integrations/pravaClient.js`, `backend/src/services/approvalService.js`, `backend/src/services/mandateService.js`, `backend/src/services/scopedCardService.js`, `backend/test/app.test.js`, `backend/test/approvalService.test.js`, `backend/test/mandateService.test.js`, `backend/test/scopedCardService.test.js`, and `progress-preethesh.md`.
- Changed: locked the `runId`-correlated approval/choice, transient card, merchant resolver, and provenance contracts. Added an in-memory approval service whose server-computed canonical SHA-256 digest binds the run, four allocations, and selected choices; requests expire, cannot be decided twice, and can be consumed only once. Added protected approval endpoints and an internal normalized merchant-to-mandate resolver so Python no longer needs copied backend environment state. Extended scoped-card results with checkout credential fields, nullable transaction ID, explicit sandbox provenance, and structured failure codes while retaining only safe code/response-ID metadata in logs. Tightened Prava charge validation so incomplete transient credentials fail closed.
- Validation: backend/root tests passed 47/47, Python agent tests passed 80/80, frontend render smoke and production build passed, `npm audit --omit=dev` found zero vulnerabilities, and `git diff --check` passed. The credential scan found only explicit fake CVVs inside unit-test fixtures and no team card or real API key.
- Decision: explicit `runId` replaces global single-active-run state. Approval is a state machine (`pending` → `approved`/`declined`/`expired` → `consumed`), with consumption immediately before minting owned by Jeswin's orchestration integration. Payment provenance uses `fixture | sandbox | production`; discovery separately keeps `live | fixture` plus `environment`. The event validator temporarily accepts legacy uncorrelated approval events so the current demo remains runnable during the teammate migration.
- Why: this closes stale-approval replay, cross-process mandate drift, lost Prava decline causes, and sandbox-vs-success ambiguity without letting models or browser code control payment credentials.
- Blocked on: `.env` is absent, so the read-only Prava authentication check and all deliberate sandbox calls remain blocked on Preethesh placing the existing sandbox key locally. The taste-step backend remains intentionally deferred until genuine Prava evidence passes G4.
- Needs from Jeswin/Deepthi: Jeswin must consume the new resolver/approval endpoints, pass the new correlated approval events, and redact `cardToken`, `dynamicCvv`, expiry, and transaction identifiers in `ScopedCard.safe()` before any live-card run. Deepthi must use the approval request ID/digest/run ID, keep `INTERNAL_API_TOKEN` out of browser bundles, and render payment provenance separately from outcome. Both must pull the contract commit before dependent work.
- Commit: `9d9d5f5` (G0/G2 implementation committed on `preethesh/integrations-backend`)

### [2026-08-01 23:58 IST] — Clarified the existing Prava sandbox credentials
- Prompt: said the Prava sandbox secret/API keys already exist and asked what happened to the sandbox integration.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: clarified that the sandbox implementation remains active and no credential or transaction was removed; the repository deliberately does not contain the user's key.
- Validation: confirmed the current branch is `preethesh/integrations-backend` and the gitignored local `.env` file is absent, so no authenticated Prava request could have run from this workspace.
- Decision: the user will place the existing `sk_test_...` sandbox secret locally as `PRAVA_SECRET_KEY`; it must not be pasted into chat or committed. Then `npm run prava:verify` performs the read-only authentication check before transaction-bearing calls.
- Why: possession of a dashboard key and availability of that key to the local process are different states. Keeping the key outside Git/chat preserves it while allowing the existing sandbox client to authenticate once configured.
- Blocked on: local `.env` creation by the credential owner.
- Needs from Jeswin/Deepthi: none for this credential placement step.
- Commit: `9a45dd9` (credential clarification committed on `preethesh/integrations-backend`)

### [2026-08-02 00:04 IST] — Distinguished Prava's secret and publishable API keys
- Prompt: clarified that Prava issued both one secret key and one API key.
- Files changed: `.env.example`, `precaution.md`, and `progress-preethesh.md`; no runtime implementation changed.
- Changed: documented the dual-key setup: `sk_test_...` maps to backend-only `PRAVA_SECRET_KEY`, while `pk_test_...` maps to `PRAVA_PUBLISHABLE_KEY` for future browser SDK initialization. Added both placeholders without values and a warning against exposing the secret through Vite/client code.
- Validation: checked the current official Prava Authentication & Environments documentation, which specifies Bearer authentication for secret keys and browser SDK initialization for publishable keys; confirmed the existing backend correctly uses the secret Bearer form.
- Decision: configure the secret key now for REST verification; retain the publishable key locally but do not wire it into the frontend until a real Prava browser SDK/passkey step is implemented.
- Why: using the publishable key on server calls would fail authentication, while exposing the secret key in browser code would compromise the merchant account.
- Blocked on: the user placing both values in the local gitignored `.env`; only the secret is required for the immediate read-only verification.
- Needs from Jeswin/Deepthi: Jeswin needs neither raw key. Deepthi may use only the publishable key if the browser SDK phase is implemented and must never import or expose `PRAVA_SECRET_KEY`.
- Commit: `ef4f615` (dual-key documentation committed on `preethesh/integrations-backend`)

### [2026-08-02 00:07 IST] — Mapped the dashboard key shown in the screenshot
- Prompt: shared the Prava Sandbox API Keys dashboard and asked exactly what to fill and where.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: confirmed the masked dashboard key begins with `pk_test_` and therefore belongs in local `PRAVA_PUBLISHABLE_KEY`; the separately saved `sk_test_` value belongs in backend-only `PRAVA_SECRET_KEY`.
- Validation: visually inspected the supplied Sandbox-tab screenshot and matched its visible key prefix against Prava's current official dual-key authentication table.
- Decision: keep the existing active default key; do not rotate, revoke, or create another. Configure both values only in the gitignored root `.env`, then use the secret-key-backed read-only verifier.
- Why: the shown publishable key is intended for browser SDK initialization and cannot authenticate the current REST backend; the secret key must remain server-only.
- Blocked on: the user entering the two already-saved values locally and running `npm run prava:verify`.
- Needs from Jeswin/Deepthi: none now; Deepthi may later consume only the publishable key through an approved browser SDK path.
- Commit: `c4d4144` (dashboard mapping committed on `preethesh/integrations-backend`)

### [2026-08-02 00:10 IST] — Corrected and passed the live sandbox access verification
- Prompt: ran `npm run prava:verify` with the locally configured keys and received `CUSTOMER_NOT_FOUND` for the placeholder Humsafar customer.
- Files changed: `.env.example`, `backend/scripts/verifyPravaAccess.js`, `backend/test/verifyPravaAccess.test.js`, and `progress-preethesh.md`.
- Changed: corrected the verifier to distinguish invalid authentication from an authenticated merchant account whose application customer has not been created yet. `CUSTOMER_NOT_FOUND` now returns `authentication: "ok"`, `customer: "not_created"`, and zero mandates instead of the false `authentication: "failed"` label. Clarified that `PRAVA_TEST_CUSTOMER_ID` is our stable external application identifier and becomes associated during the first session.
- Validation: current official Prava Create Session documentation confirms `user_id` is the unique identifier from our system and that invalid keys return `AUTH_1001`/`AUTH_1002`, not `CUSTOMER_NOT_FOUND`. Root tests passed 60/60. The read-only command was rerun against the real local sandbox secret and returned authentication OK, customer not created, zero mandates, and a sanitized response ID; no session, mandate, credential, or transaction was created.
- Decision: G1 Prava credential authentication is passed. Keep `humsafar-demo-user` stable and create its first merchant-specific mandate session only when the cardholder is ready to complete the hosted approval flow.
- Why: listing mandates before any customer session legitimately has no customer to return; treating that as bad credentials blocked a valid new-account setup and misreported the evidence.
- Blocked on: the next step requires a deliberate mandate-session ceremony with the user's email, selected first merchant, and the cardholder ready for the hosted passkey/card flow.
- Needs from Jeswin/Deepthi: none for authentication. Continue treating mandate approval as authorization only, not a completed purchase.
- Commit: `2d9a4d2` (verifier correction committed on `preethesh/integrations-backend`)

### [2026-08-02 11:38 IST] — Prepared the first hosted Prava mandate ceremony
- Prompt: shared Prava's current documentation, the Sandbox dashboard at onboarding step 2/3, and asked what to do next.
- Files changed: `.env.example`, `package.json`, `backend/scripts/createPravaMandateSession.js`, `backend/test/createPravaMandateSession.test.js`, and `progress-preethesh.md`.
- Changed: added `npm run prava:create-mandate-session`, a sandbox-only operator command for one merchant-specific, one-time, authorize-only mandate. It validates the secret-key prefix, sandbox origin, customer email, positive cap, HTTPS merchant URL, and ISO country code before network access. It prints only safe session metadata and the hosted `iframeUrl`; it deliberately drops `session_token`, keys, and card data. Added local configuration for a ₹100 Duffel cap-enforcement proof mandate.
- Validation: read the complete supplied 124-line Prava introduction and compared today's official integration-choice, quickstart, SDK, create-session, and sandbox-testing pages with Humsafar's REST client. Root tests passed 62/62 and `git diff --check` passed. Confirmed the real local `.env` has no customer email yet, so the command was not run and no session/transaction allowance was consumed.
- Decision: keep Humsafar on the hosted full-API path for this first proof. Do not install the global dashboard skill, do not use MCP/CLI, and do not paste the dashboard's generic SDK snippet. The dashboard currently shows 20 sandbox transactions remaining, which becomes the live operational limit regardless of the older 30-per-day organizer note.
- Why: hosted mode is Prava's documented fastest/lowest-maintenance path and matches the backend already implemented. The global skill/CLI is a different agent-owned-interface product, while embedded SDK work would add frontend risk before one genuine sandbox proof exists.
- Blocked on: the user adding `PRAVA_TEST_CUSTOMER_EMAIL` locally and being physically ready to open the short-lived hosted page, enter the team test card, and complete real WebAuthn/passkey approval.
- Needs from Jeswin/Deepthi: none until the mandate is active; they must continue to treat mandate approval as authorization, not a purchase.
- Commit: `186a715` (safe hosted-session operator committed on `preethesh/integrations-backend`)

### [2026-08-02 13:02 IST] — Created and opened the first live Prava sandbox mandate session
- Prompt: authorized me to use the supplied email locally and proceed with the next Prava sandbox steps.
- Files changed: local gitignored `.env`; `backend/src/integrations/pravaClient.js`, `backend/test/pravaClient.test.js`, and `progress-preethesh.md`. The email and all credentials remain excluded from tracked files.
- Changed: added the customer email only to local `.env`, invoked the safe hosted-session operator, and opened the returned Prava page locally without printing its URL or session token. The first authenticated response used a nested/current envelope without the documented `authorizeOnly` field, so the strict parser rejected it; updated the parser to accept either documented top-level or observed nested envelopes while still requiring both `session_id` and `iframe_url`, then retried once successfully.
- Validation: root tests passed 78/78. The second real sandbox call returned a one-time, merchant-listed, ₹100 INR Duffel authorization session with safe metadata and opened the hosted page. No card details, key, session token, hosted URL, email, or raw response entered Git/log output; no charge or checkout result exists yet.
- Decision: the user must now finish the short-lived hosted card/passkey ceremony in the browser. Do not mint a credential, run the over-cap proof, or claim a transaction until the mandate is confirmed active through the read-only sync/list flow.
- Why: actual Prava response envelopes differ slightly from the current example, but the two security-critical identifiers are stable. Accepting only those required fields preserves fail-closed behavior without rejecting a valid sandbox session.
- Blocked on: human completion of sandbox card entry, any test OTP, and WebAuthn/passkey approval before session expiry.
- Needs from Jeswin/Deepthi: none until mandate activation is confirmed; do not represent this created session as a purchase.
- Commit: `7ba86fa` (live response compatibility fix committed on `preethesh/integrations-backend`)

### [2026-08-02 13:07 IST] — Clarified where to complete the hosted approval
- Prompt: asked where to enter the sandbox card, OTP, and passkey after the mandate session was created.
- Files changed: `progress-preethesh.md` only; no implementation files changed.
- Changed: clarified that these actions occur on Prava's separate hosted collection/approval page opened from the session's `iframeUrl`, not in the developer dashboard or terminal.
- Validation: confirmed the preceding operator run reported `hostedPageOpened: true`; the URL was intentionally neither logged nor persisted and the session is short-lived.
- Decision: first check the browser for a new Prava checkout/approval tab. If absent, blank, or expired, create exactly one fresh session while the cardholder is ready and open its returned `iframeUrl` locally.
- Why: the dashboard manages keys/activity; sensitive card entry and WebAuthn approval are isolated on Prava's hosted surface.
- Blocked on: the human completing the hosted browser flow.
- Needs from Jeswin/Deepthi: none.
- Commit: `24e5bff` (hosted-page clarification committed on `preethesh/integrations-backend`)

### [2026-08-02 13:41 IST] — Opened a fresh hosted approval page for the user
- Prompt: said the dashboard instructions remained unclear and asked me to perform the setup directly.
- Files changed: `progress-preethesh.md` only; no implementation or local credential file changed.
- Changed: created exactly one fresh ₹100 INR, one-time, Duffel-listed sandbox mandate session using the already configured local credentials and opened its short-lived Prava-hosted page directly in the user's browser. The URL and session token were not printed, persisted, or committed.
- Validation: the operator returned `mandate_session_created`, `authorizeOnly: true`, safe session metadata, and `hostedPageOpened: true`. This created authorization state only; no credential mint, checkout, report, or completed transaction occurred.
- Decision: stop automation at Prava's secure collection page. The human cardholder must enter the issued sandbox card and approve WebAuthn/passkey; those security actions cannot and should not be automated by Humsafar.
- Why: card entry and biometric/passkey approval are deliberately isolated human-presence controls on Prava's hosted origin.
- Blocked on: completion of the newly opened browser page before its short expiry.
- Needs from Jeswin/Deepthi: none until mandate activation is verified.
- Commit: `4c0f209` (fresh-session operational log committed on `preethesh/integrations-backend`)

### [2026-08-02 15:00 IST] — Pulled and audited the teammate Prava sandbox fix
- Prompt: asked me to pull `main`, verify the teammate handoff for the intermittent Prava failure, inspect the current hosted approval screenshot, and identify all remaining work.
- Files changed: local gitignored `.env` and `progress-preethesh.md`. Pulled teammate changes from `main`; no backend, agent, or frontend source logic was changed by Preethesh in this step.
- Changed: fast-forwarded `preethesh/integrations-backend` to current `origin/main`, which includes Deepthi's Node network-family timeout fix and Jeswin's OpenAI Agents/approval/card integration. Added the five non-secret proof configuration values from `.env.example` to the local `.env`; credentials and customer data remain untracked. The screenshot was identified as the final human-presence step for the existing ₹100 Duffel authorization: **Create passkey now**.
- Validation: six consecutive `npm run prava:verify` calls all returned authenticated sandbox access with the customer found and `mandateCount: 0`; the intermittent `fetch failed` did not recur. Root/Node tests passed 78/78, Python agent tests passed 151/151, `npm audit --omit=dev` found zero vulnerabilities, and `git check-ignore -v .env` confirmed the credential file is excluded from Git.
- Decision: accept Deepthi's `--network-family-autoselection-attempt-timeout=2000` script fix as valid. Do not create or retry another mandate session while the current hosted flow is open. The cardholder must tap **Create passkey now** and approve with the phone's fingerprint, face, or screen lock; only a later read-only verification showing `mandateCount: 1` proves activation. A created session and card enrollment are authorization setup, not a purchase.
- Why: repeat authentication establishes that the API key and network path now work, while `mandateCount: 0` proves the hosted ceremony has not produced an active mandate yet. WebAuthn requires human presence and cannot safely be automated.
- Remaining: complete the passkey ceremony; verify and sync the active mandate; run one isolated over-cap sandbox proof and capture the structured decline without claiming checkout success; use a separate suitable mandate for an eventual successful checkout if required; implement the missing honest `LiveCheckout`/merchant boundary and `POST /api/runs`; finish frontend agent identity/stage wiring; perform one opt-in real OpenAI Agents SDK smoke run after configuring the local OpenAI key; then deploy, record the demo, reconcile README/submission claims with evidence, and submit to Devfolio. The taste-choice flow remains deferred until the Prava proof gate is complete.
- Needs from Jeswin/Deepthi: Jeswin should help validate the first real OpenAI/Prava orchestration trace after mandate activation. Deepthi should connect the goal/budget form once `POST /api/runs` exists and finish agent-stage rendering against Jeswin's event data.
- Commit: `87d0c8c` (Prava handoff audit committed on `preethesh/integrations-backend`)

### [2026-08-02 15:05 IST] — Directed the final human passkey action
- Prompt: asked what to do next after the teammate fix and remaining-work audit.
- Files changed: `progress-preethesh.md` only.
- Changed: identified the single immediate action: on the already-open Prava hosted page, tap **Create passkey now**, approve the Android fingerprint/PIN prompt, and wait for Prava's success confirmation.
- Decision: do not create another session, run a charge, or close the current hosted page. After the human approval, rerun only the read-only verifier; `mandateCount: 1` is the required activation evidence before continuing.
- Blocked on: human-presence WebAuthn approval on the user's phone.
- Commit: recorded by the commit containing this entry.

### [2026-08-02 15:10 IST] — Clarified phone ownership and passkey ceremony
- Prompt: asked for basic instructions because the hosted Prava flow was opened and card enrollment was performed on a friend's phone.
- Files changed: `progress-preethesh.md` only.
- Changed: clarified that the friend holding the already-open phone must tap **Create passkey now** and approve Android's system prompt using that phone's configured fingerprint, face, pattern, PIN, or password. No credential, OTP, biometric, or screen-lock value should be shared in chat.
- Decision: continue on the same phone and existing hosted page. Treat the resulting passkey as stored on that phone/account; use Preethesh's own passkey-capable device for a new ceremony later if Preethesh needs independent control.
- Blocked on: the phone holder completing the Android system confirmation and reporting the non-sensitive result screen.
- Commit: recorded by the commit containing this entry.

### [2026-08-02 17:15 IST] — Completed dynamic browser-to-agent integration
- Prompt: asked to finish the remaining product work in one meaningful milestone, replace hard-coded Goa behavior with an actual dynamic multi-agent journey, reconcile teammate work and push only after verification.
- Files changed: backend run/event/choice services and tests; Python choice/approval/orchestrator/discovery/CLI/event contracts and tests; frontend intake/routing/approval/receipt/proxy/package configuration; `.env.example`; README, interface, dynamic-flow, execution, submission and component documentation.
- Changed: added structured origin/destination, IATA codes, dates, travellers, rooms, budget, preferences and optional stay coordinates; browser runs now start provider-backed discovery and trust checks, and enable OpenAI narration when a key exists. Added a server-owned one-shot choice state machine that accepts only options emitted for that run/category. Moved all choices before approval and included exact option IDs in the approval digest. Execution now uses that approved option. Added run status, single-run concurrency protection, ignored child stdio to prevent pipe deadlocks/sensitive log spill, and explicit opt-in gates for Prava/live checkout. Removed the vulnerable router dependency and implemented the five linear pages with native History API. Fixed non-travel category parsing, dynamic fixture origin/duration, round-trip Duffel search and per-event purchase provenance.
- Safety decisions: normal browser use never enables `--live-cards` or `--live-checkout`; those require explicit environment flags because they can consume sandbox mandates. A provider credential, Prava credential, or authorization is never called a booking. Food/guide remain labelled fixtures, and missing Duffel configuration or stay coordinates degrades to destination-aware fixtures. No Prava call was made during verification.
- Validation: 87 JavaScript tests passed; 178 Python tests passed; frontend 43/43 unit tests, SSR render smoke, production build and zero-vulnerability production audit passed. A controlled full-stack smoke run for Pune→Jaipur, two travellers, custom dates and ₹42,000 completed with exit code 0 and correctly reported provider fallback/simulated execution modes. The current OpenAI model resolver confirmed `gpt-5.6-sol` as the flagship target already configured for intent/mediation, while the measured low-latency specialist model remains intentionally separate. `.env` remains gitignored.
- Remaining external work: configure Duffel test credentials for provider inventory; implement actual Duffel order creation with required traveller/contact/payment inputs; add food/guide provider access; deploy HTTPS; record the video and publish Devfolio. These are not represented as completed merchant bookings.
- Needs from Jeswin/Deepthi: pull main after the merge, run their owned checks, and help with the final deployment/video review; do not reintroduce fixture or credential-overclaim wording.
- Commit: recorded by the milestone commit containing this entry.

### [2026-08-02 17:25 IST] — Defined production providers and phone-only Prava operation
- Prompt: required real OpenAI Agents SDK agents, dynamic Goa planning before any booking, explicit API-key requirements, deterministic multi-agent budget negotiation, and recorded that Prava hosted payment/passkey does not work in the Linux browser and was completed on a family phone.
- Files changed: backend Google Maps integration/discovery wiring and tests; frontend intake copy; OpenAI agent identity; run-isolated SSE code/tests; `.env.example`; `PRODUCTION-INTEGRATIONS.md`, README, interfaces, execution plan, precautions, and component documentation.
- Changed: renamed the OpenAI intent persona to Budget Strategy Agent while keeping exact money in the deterministic engine; added server-side Google destination geocoding so Duffel Stays no longer requires users to know latitude/longitude; isolated SSE replay and live delivery by `runId`; documented the one-key/six-agent model and the provider/contract matrix for flights, stays, activities, Indian rail, restaurants, local transport, and production payment; pinned the Linux-operator/phone-passkey Prava workflow.
- Decision: one `OPENAI_API_KEY` serves all logical agents. Separate keys do not create agent isolation. No rail, restaurant, guide, ride, or merchant booking will be claimed until an authorized transactional provider grants the required tier and its checkout result is implemented. Prava sandbox remains authorization/cap evidence, not production inventory payment.
- Validation: 90 JavaScript tests and 178 Python tests passed; frontend SSR folded all 32 mock events and passed 24 content assertions; the production bundle built; the production dependency audit found zero vulnerabilities. A browser-equivalent Goa smoke run negotiated ₹36,000, accepted four server-validated choices, consumed one exact-plan approval, and completed at ₹35,100 with all four lines honestly labelled fixture/simulated. A separate run confirmed the filtered SSE replay and run status. Neither run enabled Prava or merchant checkout.
- Remaining external inputs: add `OPENAI_API_KEY`, `DUFFEL_ACCESS_TOKEN`, and `GOOGLE_MAPS_API_KEY` locally; acquire Viator partner access and an IRCTC-authorized B2B provider if real activity/rail booking is required; select restaurant and local-transport partners; deploy HTTPS and complete release media/submission.
- Commit: recorded by the milestone commit containing this entry.
