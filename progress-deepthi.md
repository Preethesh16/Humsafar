# Progress Log — Deepthi (Frontend, Demo & Submission)

**Role scope:** React dashboard (live deliberation feed, budget split visualization, per-agent purchase cards, audit log), confirmation fan-out UI/notification, optional Flutter one-tap passkey approve/deny screen, demo video, Devfolio submission writeup (pitch, Prava integration explanation, disclosure section, track-specific evidence).

**Assigned Git branch:** `deepthi/frontend-demo`. Push work only to this branch and open a pull request into `main`; do not push feature work directly to `main` or to another teammate's branch.

**Required Git workflow:** update local `main` → create or switch to `deepthi/frontend-demo` → do and test the work on that branch → commit and push `deepthi/frontend-demo` → open a pull request and merge it into `main` after review and conflict checks. After merging, update local `main` before starting the next phase.

**Before every session:** read `/brainstorming.md`, `/INTERFACES.md`, `/progress-jeswin.md`, and `/progress-preethesh.md` in full, THEN this file, before writing or changing anything.

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

### [2026-08-01 13:52 IST] — Fixed a repo-wide CRLF problem before any frontend work
- Prompt: read every Markdown file, operate as Deepthi's senior frontend/demo owner, decide and act on issues found, log changes, and use the personal-branch workflow.
- Files changed: `.gitattributes` (new), `.gitignore`.
- Problem found: `git status` showed all 21 tracked files modified. `git diff --ignore-cr-at-eol` proved the diff was **entirely CRLF line endings, zero content change** — the repo sits on a Windows drive (`/mnt/d`) accessed from WSL. Left alone, my first commit would have rewritten every one of Preethesh's files and produced a guaranteed, meaningless merge conflict against `jeswin/agent-core`.
- Decision: added `.gitattributes` with `* text=auto eol=lf` and ran `git add --renormalize .` rather than discarding the working tree. Renormalize is non-destructive (it only restages content that already matches the index) and, unlike a one-off cleanup, it stops the churn recurring for Jeswin and Preethesh too.
- Validation: `git status` went from 21 phantom modifications to clean; confirmed `git add --renormalize` staged nothing, proving the files were byte-identical to the index apart from line endings.
- Blocked on: nothing
- Needs from Jeswin/Preethesh: nothing — the fix is repo-wide and needs no action from either of you, but expect your own phantom-modified files to disappear after you pull.
- Commit: `ec539bd` (pushed to `deepthi/frontend-demo`)

### [2026-08-01 14:20 IST] — Built the React dashboard against a mocked stream
- Prompt: same session — continued into the first implementation phase.
- Files changed: `frontend/` (new: `package.json`, `package-lock.json`, `vite.config.js`, `index.html`, `README.md`, `src/main.jsx`, `src/App.jsx`, `src/styles.css`, `src/state/sessionReducer.js`, `src/lib/{mockStream,useEventStream,agents}.js`, `src/components/{DeliberationFeed,BudgetSplit,PurchaseCards,AuditLog,FinalReceipt}.jsx`, `test/sessionReducer.test.js`, `test/render.ssr.jsx`), plus `INTERFACES.md`, `brainstorming.md`, `.gitignore`.
- Changed: the full scope-1 dashboard — live deliberation feed, budget split visualisation, per-agent scoped-card/purchase cards, audit log — plus the scope-3 confirmation fan-out receipt. React 19 + Vite 8 on Node 20.20.2.
- Key decision — **the event fold is a pure, React-free reducer** (`src/state/sessionReducer.js`). Every locked event type is handled in one file that can be unit-tested with plain `node --test`, so when Preethesh changes the contract there is exactly one place to update and 15 tests that fail loudly instead of a silently blank panel.
- Key decision — **unknown event types are routed to the audit log, not dropped.** If Preethesh ships a `senso_trust_check` event mid-build it appears on screen immediately rather than vanishing. Tested.
- Key decision — **the mock is loud, by design.** A persistent amber banner, a `mocked stream` tag on every purchase, and an explicit "no payment was made" line on the receipt. The handbook makes a mocked payment shown as real a disqualifier risk, and Preethesh's log asked that fixture/failed issuance is never rendered as a completed live payment. That is enforced in the UI, not left to the narrator. The render test asserts the string "live transaction" never appears while on the mocked stream.
- Key decision — **an absent `source` tag renders "source unverified", never live.** Section 4 defines the tag but Section 2 does not list it on `purchase_result`, so I read it tolerantly and refuse the optimistic default.
- Key decision — **dev proxy instead of backend CORS.** `EventSource` cannot send custom headers and the backend sets no CORS headers, so the stream must be same-origin. `vite.config.js` proxies `/api` and `/health` to `127.0.0.1:3000`, which keeps a dev-only concern out of Preethesh's backend entirely.
- Validation (all run, not assumed): `npm test` at the repo root passes **29/29** (14 of Preethesh's backend + 15 new reducer tests). `npm run build` produces a clean bundle (211 kB / 66 kB gzip). `npm run test:render` server-renders every panel against the fully-folded 32-event mock script and asserts 12 expected strings. **End-to-end against the real backend:** started `npm start` and `npm run dev`, POSTed a `split_update` and a `card_issued` to `/api/events`, and read both frames back through the Vite proxy at `http://127.0.0.1:5173/api/events` with correct `id:` framing; a reconnect with `Last-Event-ID: 1` correctly replayed only frame 2. Servers stopped cleanly afterwards.
- Interface changes flagged: **none of the locked shapes changed.** I added three clarifying notes to `INTERFACES.md` Section 2 — `source` is optional on `purchase_result`, unknown event types are safe to add, and the CORS/same-origin constraint on `GET /api/events`.
- Blocked on: nothing. The dashboard is fully demoable today on the mocked stream and consumes the real stream the moment Jeswin's agents emit events.
- Needs from Jeswin: the real `agent_message` text is what sells the demo — argumentative, specific, one clear claim per message (see `src/lib/mockStream.js` for the tone I built the feed's spacing around). Also emit `split_update` on **every** round, including the ones that stay over budget; the contention is the story.
- Needs from Preethesh: include the `source` tag on `purchase_result` when you have it. Nothing else — the SSE stream, ids, and `Last-Event-ID` replay all worked first try against my client.
- Commit: `d6c6286` (pushed to `deepthi/frontend-demo`)
