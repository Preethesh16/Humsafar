# Progress Log — Jeswin (Agent/AI Core)

**Role scope:** Orchestrator, specialist agents, mediator, negotiation engine, the `mintScopedCard` abstraction (logic only — Preethesh owns the actual Prava API call underneath it).

**Assigned Git branch:** `jeswin/agent-core`. Push work only to this branch and open a pull request into `main`; do not push feature work directly to `main` or to another teammate's branch.

**Required Git workflow:** update local `main` → create or switch to `jeswin/agent-core` → do and test the work on that branch → commit and push `jeswin/agent-core` → open a pull request and merge it into `main` after review and conflict checks. After merging, update local `main` before starting the next phase.

**Before every session:** read `/brainstorming.md`, then `/progress-preethesh.md` and `/progress-deepthi.md` in full, THEN this file, before writing or changing anything.

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
