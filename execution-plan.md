# Humsafar — Remaining Execution Plan

> Planning baseline for the final build. Last reviewed: 2026-08-01 23:34 IST.
> This file assigns remaining work; it does not claim that the work is already
> implemented. `precaution.md` remains mandatory for every payment/demo step.

## Outcome and target tracks

Ship one coherent, judge-verifiable flow:

```
goal + budget
  → OpenAI-assisted intent and preference parsing
  → deterministic specialist negotiation over one finite pot
  → user chooses options inside each slice (minimum viable taste step)
  → user approves the exact allocation and choices
  → merchant-specific Prava sandbox authorization
  → amount/merchant-scoped credential attempt
  → honest checkout outcome
  → per-line audit receipt
```

Deliberate targets: **Prava Overall, Visa Intelligent Commerce, OpenAI, and
Localhost**. Senso is conditional on real API access arriving early enough to
change a merchant decision. NANDA is conditional on the core flow and public
deployment being complete. Linq is cut.

## Non-negotiable architecture decisions

### OpenAI credentials and agents

- Use **one server-side OpenAI project/service-account key** for the running
  Humsafar service, loaded only from `OPENAI_API_KEY`. Do not create or expose a
  separate key for Flights, Stay, Food, Guide, or Mediator.
- If organizers gave credits/keys to multiple participants, each credential
  stays with its owner. Pick one team project credential for the demo runtime;
  do not paste several participant keys into source or distribute them to the
  browser.
- Logical separation comes from distinct OpenAI `Agent` definitions,
  instructions, tools, and structured output schemas—not from separate API
  keys.
- The intent definition is presented as the **Budget Strategy Agent**: it may
  choose categories and preference weights, but the deterministic engine alone
  turns provider prices into integer-paise allocations.
- Use the Python OpenAI Agents SDK, which uses the Responses API by default.
  Keep models configurable through environment variables. The current official
  resolver names `gpt-5.6-sol` as the latest reasoning target; perform one
  account/model smoke check before making it the demo default. Use a cheaper,
  lower-latency account-supported model for repeated specialist calls.
- Configure sensitive-data protection before the first run:

  ```env
  OPENAI_API_KEY=
  HUMSAFAR_SPECIALIST_MODEL=
  HUMSAFAR_REASONING_MODEL=gpt-5.6-sol
  OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA=0
  OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1
  OPENAI_AGENTS_DONT_LOG_TOOL_DATA=1
  ```

- One trace/group ID maps to one Humsafar `runId`. Traces may show agent names,
  reasoning stages, and sanitized option metadata; they must never contain API
  keys, payment tokens, CVVs, expiry, session tokens, or raw Prava responses.

Official references:

- Agents SDK: <https://openai.github.io/openai-agents-python/>
- Agent configuration and orchestration: <https://openai.github.io/openai-agents-python/agents/>
- Tracing and sensitive-data controls: <https://openai.github.io/openai-agents-python/tracing/>

### What each OpenAI agent is allowed to do

| Logical agent | Model responsibility | Deterministic validation |
|---|---|---|
| Budget Strategy Agent | Parse an arbitrary goal into the subset of `flights`, `stay`, `food`, `guide`; extract user emphasis and constraints | Reject unknown categories, invalid weights, invented budget, or missing required fields; the deterministic engine alone computes money |
| Four Specialist Agents | Explain the trade-off around real discovered options and the engine-provided ask/floor | Cannot set allocations, prices, merchant IDs, mandate IDs, or payment state; every stated amount must match supplied data |
| Mediator Explainer | Explain why the deterministic engine accepted concessions and the final split | Cannot edit the split or end condition; fallback text remains available |
| Taste Assistant | Summarize differences among shortlisted options without inventing ratings/reviews | User chooses; timeout uses the deterministic ranking rule and is labeled `agent-timeout` |

No OpenAI agent receives `mintScopedCard`, report-status, checkout, filesystem,
shell, or secret-reading tools. Payment execution remains ordinary audited code
after explicit human approval.

### Payment and evidence boundaries

- Prava stays on SDK/API sandbox. MCP/CLI and production remain outside the
  critical path.
- One listed mandate belongs to one merchant. Never describe the target
  one-tap multi-merchant experience as implemented.
- Use a separate mandate for the over-cap proof and successful checkout unless
  Prava confirms that a failed cap attempt leaves a one-time mandate usable.
- `THRESHOLD_EXCEEDED` must be propagated as structured data and observed before
  claiming card-network cap enforcement.
- Credential issuance is not checkout. Report only the processor/merchant's
  actual outcome.
- If only one category uses a genuine Prava sandbox path, the run is
  **mixed-mode** and the other three purchases remain individually labeled
  fixtures.

## Shared contract decisions required before parallel code

Preethesh drafts these additions in `INTERFACES.md`; Jeswin and Deepthi review
them before dependent implementation:

1. A `runId` on new command/approval/choice APIs and their related events.
2. Approval records bind `approvalRequestId`, allocation/choice digest, expiry,
   and one-shot consumption. A stale approval can never authorize another run.
3. `mintScopedCard` transient result adds `transactionId`, `dynamicCvv`,
   `expiryMonth`, `expiryYear`, `source: "sandbox"`, and structured
   `errorCode`; all credential fields are redacted by `safe()` and excluded
   from events/receipts.
4. A backend merchant-to-mandate resolver closes the current cross-process gap;
   Python must not depend on manually duplicating backend in-memory state.
5. Result provenance distinguishes `fixture`, `sandbox`, and genuine production
   data, with a separate `environment: "test" | "production" | null` for
   discovery inventory.
6. The taste step is conditionally accepted **after the Prava gate**. Minimum
   slice: stable option IDs, two or more in-budget options, `choice_requested`,
   run-correlated `POST /api/choices`, timeout, and `choice_made`. Photos are
   polish and are cut first.

## Work split

### Preethesh — integrations, payment truth, backend contracts

Branch: `preethesh/integrations-backend`

Priority 0 — unblock the core:

1. Finalize the shared contract additions above and notify both teammates.
2. Verify the local Prava sandbox key with `npm run prava:verify`; never expose
   the key or team card.
3. Add sanitized structured Prava failure propagation, including
   `errorCode`, without logging raw responses.
4. Implement the backend mandate resolver/sync contract used by Python.
5. Implement run-correlated, expiring, one-shot approval storage and endpoints.
6. Extend the transient checkout credential contract and prove secret fields
   never enter logs, SSE events, receipts, or exceptions.

Priority 1 — evidence:

7. Create the hosted mandate session only when the human/browser is ready;
   verify the resulting mandate/merchant/cap.
8. Run one deliberate over-cap proof on its own mandate and preserve only
   sanitized evidence.
9. Validate one merchant/test-processor checkout boundary, report the observed
   result truthfully, and expose a `sandbox` result envelope.
10. Add `POST /api/choices`, stable option IDs, `environment`, and the minimal
    taste-step state only after steps 1–9 are green.

Priority 2 — track/deployment:

11. Deploy the backend with `INTERNAL_API_TOKEN`, same-origin/CORS decisions,
    HTTPS, health checks, and no secrets in build output.
12. Integrate real Senso only if access arrives before the cutoff and a test
    proves it changes the merchant choice. Otherwise leave it unclaimed.

Acceptance criteria:

- No external call occurs before sandbox verification.
- Prava failures remain distinguishable and sanitized.
- No credential reaches logs/events/receipts.
- One observed sandbox checkout outcome and one observed cap result have
  private timestamps/response IDs and public redacted evidence.
- Node tests, audit, syntax, diff, and secret scans pass.

### Jeswin — OpenAI Agents SDK and deterministic orchestration

Branch: `jeswin/agent-core`

Priority 0 — meaningful OpenAI use without moving money:

1. Add a pinned Python dependency definition for `openai-agents` and retain a
   zero-key deterministic mode.
2. Replace the Chat Completions-only narrator with Agents SDK `Agent` +
   `Runner` components and structured outputs.
3. Implement Intent Agent parsing with a strict four-category allow-list,
   bounded priorities, validation, timeout, and keyword fallback.
4. Implement four specialist agent identities and the mediator explainer.
   They receive real options and engine-generated figures; they cannot change
   prices, asks, floors, allocations, or convergence.
5. Add sanitized run tracing with one trace/group per `runId`; disable sensitive
   model/tool capture by default.

Priority 1 — payment/approval orchestration:

6. Move the over-cap proof before purchase, target the actually selected
   merchant, and classify only the structured backend result.
7. Consume Preethesh's mandate resolver; remove the need for a manually shared
   Python environment registry.
8. Add a polled approval implementation bound to `runId` and allocation/choice
   digest. Decline or timeout mints nothing.
9. Extend `ScopedCard.safe()` to redact every transient credential field.
10. Implement the minimal taste-step pause/timeout and buy exactly the chosen
    option after the Prava gate is proven.

Acceptance criteria:

- A missing/dead OpenAI key produces the same deterministic allocations and a
  complete run.
- Structured agent output cannot introduce unknown categories or money.
- Tests inject a fake runner; routine tests make no paid network calls.
- One opt-in smoke run proves the Agents SDK path and produces a sanitized
  trace with recognizable specialist identities.
- Budget sweeps, approval-before-mint, no-secret-event, cap classification, and
  timeout tests pass.

### Deepthi — interactive product, evidence, deployment, submission

Branch: `deepthi/frontend-demo`

Priority 0 — make the current dashboard operable:

1. Build editable goal and budget submission against a run-creation endpoint;
   preserve the mock/demo mode.
2. Build the run-correlated approval UI showing the exact allocation and chosen
   options, expiry/countdown, approve/decline, and timeout state.
3. Render `fixture`, `sandbox`, `production`, and `environment=test` distinctly;
   keep unknown provenance pessimistic.
4. Show OpenAI agent identity and stage in the deliberation/audit view without
   exposing chain-of-thought or sensitive traces.

Priority 1 — taste step after the Prava gate:

5. Implement the minimum option-choice panel: two or more in-budget choices,
   honest rating/ranking basis, countdown, and user-vs-timeout attribution.
6. Add photos only if real returned photos exist and the minimum flow is stable.

Priority 2 — ship and submit:

7. Deploy the frontend against the HTTPS backend using a same-origin production
   path for SSE.
8. Create the root `README.md`, architecture diagram, setup instructions,
   disclosure, exact source labels, and track-evidence sections.
9. Record the demo with secrets redacted; show the genuine sandbox evidence,
   OpenAI agent behavior, deterministic budget guarantee, and mixed-mode labels.
10. Complete Devfolio fields, screenshots, technologies, lessons, and publish
    early enough to verify the status is **Submitted**.

Acceptance criteria:

- A judge can enter a goal/budget, choose, approve/decline, and understand every
  result without narration.
- Fixture, sandbox, test-inventory, timeout, declined, and successful states are
  visually unambiguous.
- Reducer, render, accessibility, production build, SSE reconnect, and mobile
  layout checks pass.
- Video/README/Devfolio use identical claims and disclosures.

## Dependency and merge order

| Gate | Required result | Owners who may proceed afterward |
|---|---|---|
| G0 — docs/contracts | This plan plus reviewed interface additions | All three develop on personal branches |
| G1 — credential checks | Prava and OpenAI smoke checks succeed without exposing keys | Preethesh sandbox ceremony; Jeswin opt-in Agents run |
| G2 — backend primitives | Run/approval, mandate resolver, structured card result | Jeswin approval/card integration; Deepthi live forms |
| G3 — agent core | Agents SDK fallback, approval gate, corrected cap order | Full-stack dry run |
| G4 — Prava evidence | Honest cap and checkout outcomes recorded | Taste step, deployment, track polish |
| G5 — product integration | UI input/approval/provenance and complete SSE run | Video and final submission |
| G6 — release | HTTPS deploy, all tests, secret scan, redacted evidence | Publish Devfolio |

Contracts merge first from Preethesh. Jeswin and Deepthi may build tests against
the reviewed shapes in parallel, but neither merges dependent behavior until
the contract commit is on `main`. Every person pushes only their assigned branch
and merges after review/conflict/tests; no force pushes.

## Timebox and cuts

1. **First 4 hours:** G0–G2, sandbox verification, OpenAI fake-runner work,
   frontend form/approval shell.
2. **Next 5 hours:** agent integration plus deliberate Prava ceremony/proofs.
3. **Next 5 hours:** full-stack integration and minimum taste step.
4. **Next 5 hours:** deployment, README, screenshots and video.
5. **Remaining buffer:** two complete rehearsals, fixes, Devfolio publish.

Cut in this order if any gate slips:

1. Taste-step photos and visual polish.
2. NANDA.
3. Senso.
4. Taste step entirely, reverting to the tested deterministic agent pick.
5. Localhost-specific polish beyond a stable deployment.

Never cut the genuine Prava sandbox evidence, truthful labeling, explicit
approval, OpenAI's meaningful structured role, demo video, or disclosure.

## Definition of done

- The repo starts from documented commands with gitignored local secrets.
- All Node, Python, frontend render/build, security and secret checks pass.
- The deterministic engine never allocates or spends above budget.
- OpenAI Agents materially interpret the goal and explain grounded trade-offs,
  while failure degrades cleanly without changing money.
- No credential or sensitive trace data is stored or emitted.
- Prava evidence is genuine sandbox evidence and described exactly as observed.
- Every purchase line carries honest provenance; mixed-mode remains explicit.
- The public deployment, README, video and submitted Devfolio project agree.

## 2026-08-02 integration milestone

Landed locally on Preethesh's branch and awaiting the one-shot merge:

- Dynamic five-screen journey with structured trip intake and no hard-coded destination list.
- Browser-started Python multi-agent run using backend provider discovery and trust checks.
- OpenAI narration enabled only when configured; deterministic money remains authoritative.
- Validated one-shot choice API; every selected option is affordable and bound into the approval digest.
- Choice now occurs before approval, and execution uses the approved option rather than selecting afterward.
- Run status, concurrency protection, child-process backpressure protection, and same-origin token proxy.
- Destination-aware fallback for arbitrary origin/destination/duration; Duffel flights use entered IATA/date context, and Duffel Stays uses a server-side Google geocode or an explicit coordinate override.
- No router advisory chain: the five linear screens use the native History API; production audit is clean.

Still external/release work, not silently treated as complete: configure OpenAI,
Duffel, and Google server credentials; add real merchant booking adapters and
the passenger/contact fields they require; obtain transactional guide, rail,
restaurant, and local-transport partner access; deploy HTTPS; record and
publish the demo/submission. Prava sandbox delegation/cap evidence is already
complete, but it is not a merchant booking. See `PRODUCTION-INTEGRATIONS.md`.
