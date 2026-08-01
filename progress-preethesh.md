# Progress Log — Preethesh (Integrations & Backend)

**Role scope:** Prava SDK/API integration (sandbox test card, production request if pursued), Duffel API (flights + stay), Node/Express orchestration service + WebSocket/SSE event streaming, credential-degradation adapter (live-or-fixture per integration, logged), Senso trust-score check, Project NANDA AgentFacts registration, Guide/Food fixture data shaped like real Viator/OpenTable responses.

**Assigned Git branch:** `preethesh/integrations-backend`. Push work only to this branch and open a pull request into `main`; do not push feature work directly to `main` or to another teammate's branch.

**Before every session:** read `/brainstorming.md`, then `/progress-jeswin.md` and `/progress-deepthi.md` in full, THEN this file, before writing or changing anything.

**Every time the AI makes a change:** append a new entry below. Never delete old entries. Include: timestamp, what changed, why, what's blocked, what you need from another teammate, and the exact git commit hash once pushed.

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
