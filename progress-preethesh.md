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
