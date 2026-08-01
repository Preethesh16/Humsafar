# Progress Log — Deepthi (Frontend, Demo & Submission)

**Role scope:** React dashboard (live deliberation feed, budget split visualization, per-agent purchase cards, audit log), confirmation fan-out UI/notification, optional Flutter one-tap passkey approve/deny screen, demo video, Devfolio submission writeup (pitch, Prava integration explanation, disclosure section, track-specific evidence).

**Assigned Git branch:** `deepthi/frontend-demo`. Push work only to this branch and open a pull request into `main`; do not push feature work directly to `main` or to another teammate's branch.

**Required Git workflow:** update local `main` → create or switch to `deepthi/frontend-demo` → do and test the work on that branch → commit and push `deepthi/frontend-demo` → open a pull request and merge it into `main` after review and conflict checks. After merging, update local `main` before starting the next phase.

**Before every session:** read `/brainstorming.md`, then `/progress-jeswin.md` and `/progress-preethesh.md` in full, THEN this file, before writing or changing anything.

**Every time the AI makes a change:** append a new entry below. Never delete old entries. Include: timestamp, what changed, why, what's blocked, what you need from another teammate, and the exact git commit hash once pushed.

---

## Entry format
```
### [DATE TIME] — <short title>
- Changed: ...
- Why: ...
- Blocked on: ... (or "nothing")
- Needs from Jeswin/Preethesh: ... (or "nothing")
- Commit: <hash> (pushed to <branch>)
```

---

## Log

### [not started yet]
- Changed: n/a
- Why: n/a
- Blocked on: needs the WebSocket/SSE event shape from Preethesh's orchestration service before the live deliberation feed can be wired to real data (can build against mock events in the meantime).
- Needs from Jeswin/Preethesh: event schema for agent messages (who's speaking, what they're arguing, current proposed split) as soon as it's decided.
- Commit: n/a

### [2026-08-01 12:59 IST] — Added Deepthi's branch workflow
- Changed: documented the required create/switch, work, test, commit, push, pull-request, and merge workflow for `deepthi/frontend-demo`.
- Why: ensure Deepthi's work stays isolated from `main` until it has been reviewed and checked for conflicts.
- Blocked on: nothing
- Needs from Jeswin/Preethesh: review interface changes before the branch is merged into `main`.
- Commit: n/a (documentation updated locally; not pushed)
