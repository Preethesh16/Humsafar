# Progress Log — Preethesh (Integrations & Backend)

**Role scope:** Prava SDK/API integration (sandbox test card, production request if pursued), Duffel API (flights + stay), Node/Express orchestration service + SSE event streaming, credential-degradation adapter (live-or-fixture per integration, logged), Senso trust-score check, Project NANDA AgentFacts registration, Guide/Food fixture data shaped like real Viator/OpenTable responses.

**Assigned Git branch:** `preethesh/integrations-backend`. Push work only to this branch and open a pull request into `main`; do not push feature work directly to `main` or to another teammate's branch.

**Before every session:** read `/brainstorming.md`, `/INTERFACES.md`, `/progress-jeswin.md`, and `/progress-deepthi.md` in full, THEN this file, before writing or changing anything.

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
- Commit: pending (sandbox-only decision will be pushed through `preethesh/integrations-backend` and merged to `main`)
