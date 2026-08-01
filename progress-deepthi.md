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

### [2026-08-01 14:32 IST] — Ran the dashboard for review
- Prompt: asked to see the work running and to pull anything new on `main`.
- Files changed: none.
- Changed: nothing — started the backend and the Vite dev server and walked through the demo beats on `http://localhost:5173`.
- Validation: `/health` returned ok; the dashboard returned HTTP 200; `origin/main` was still at `66e0d75`, so there was nothing to pull.
- Blocked on: nothing
- Needs from Jeswin/Preethesh: nothing
- Commit: n/a (no file changes)

### [2026-08-01 15:05 IST] — Merged Preethesh's backend work and re-themed the UI
- Prompt: take UI/UX inspiration from a reference demo site, change only the look and feel, leave every bit of logic and flow exactly as it is, and pull anything new on `main`.
- Files changed: `frontend/src/styles.css` (full rewrite), `frontend/src/App.jsx`, `frontend/src/lib/agents.js`, all five existing components, `frontend/src/components/ProofPanel.jsx` (new), `frontend/src/lib/icons.jsx` (new), `frontend/test/render.ssr.jsx`, `frontend/README.md`.
- Merged: `origin/main` `95657ea` (Preethesh's discovery, mandate, trust, Duffel and NANDA work) into this branch. The merge was clean and my three `INTERFACES.md` Section 2 clarifications survived alongside his six new endpoint entries.
- Changed: replaced the dark dashboard theme with a warm editorial "paper" theme — canvas `#f3efe5`, forest `#1d3b2d`, coral `#e56b52`, mint `#c9f2dd`, Inter with a coral serif italic accent in the headline, monospace uppercase micro-labels, 20px paper panels. Restructured the page into hero → journey stepper → two-column workspace → truth-layer footer, and split the two demo proof shots into their own coral panel so a judge sees them without reading the feed.
- **Constraint honoured, and proved mechanically:** `frontend/src/state/sessionReducer.js`, `frontend/src/lib/useEventStream.js` and `frontend/src/lib/mockStream.js` are byte-for-byte unchanged — verified with `git diff --numstat HEAD` per file before committing. No event shape, no reducer branch, no stream handling, and no phase transition was touched. The journey stepper is a display mapping over the `phase` the reducer already computes, not a second state machine.
- Decision: kept every honesty affordance through the re-theme rather than letting a prettier design soften them. The simulated-stream notice is still unmissable (amber, above the fold), every purchase still carries its `fixture data · mocked stream` tag, an absent `source` still renders "source unverified", and the receipt still states no payment was made. The render test still asserts the string "live transaction" can never appear on the mocked stream.
- Decision: added `prefers-reduced-motion` support, which the previous theme lacked.
- Validation: `npm test` at the repo root passes **36/36** (Preethesh's merge added 7). `npm run test:render` passes with 15 assertions (up from 12) over the full 32-event script. Clean production build. Restarted the backend on the merged code and re-ran the end-to-end check: `/health` ok, his new `/.well-known/agentfacts.json` returns 200, and a POSTed `agent_message` came back through the Vite proxy SSE stream correctly framed.
- Blocked on: nothing
- Needs from Jeswin/Preethesh: nothing new.
- Commit: `9de1257` (pushed to `deepthi/frontend-demo`), after merge commit `bff608b` brought in `main` at `95657ea`.

### [2026-08-01 15:40 IST] — Matched the reference visual exactly, merged Jeswin's agent core
- Prompt: use the reference demo site's colour theme, font style, spacing and overall visualisation, with a screenshot supplied; change only the design, keep all logic as specified in the Markdown files; pull anything new on `main`.
- Files changed: `frontend/src/styles.css`, `frontend/src/App.jsx`, `frontend/src/main.jsx`, `frontend/src/lib/icons.jsx`, `frontend/test/render.ssr.jsx`, `frontend/package.json`, `frontend/package-lock.json`, `.gitignore`, `progress-deepthi.md`.
- Merged: `origin/main` `16c7677`, which brought in Jeswin's agent core (orchestrator, specialists, mediator, negotiation) and his backend discovery/trust consumption. One conflict, in `.gitignore` — both sides had appended different entries, so I kept both (my `.ssr-out/` and `dist/`, his Python `__pycache__/`, `*.py[cod]`, `.venv/`, `venv/`). Nothing was dropped. My `INTERFACES.md` clarifications survived, verified by grep after the merge.
- Changed, against the reference's real CSS rather than a guess: pulled the reference page's stylesheet directly and matched its tokens — canvas `#f3efe5`, paper `#fffdf8`, forest `#1d3b2d`, coral `#e56b52`, mint `#c9f2dd`, line `#ddd6c9`, radius 20px, and its two exact radial background washes. Rebuilt the hero to the screenshot's actual structure (headline left, body copy right, full-width command bar below, then the journey stepper), enlarged the headline to `clamp(42px, 5.2vw, 76px)` at weight 800 with `-0.055em` tracking and a Georgia coral italic second line, switched the brand mark to the lettermark "H", and made completed journey steps show a check instead of a number.
- Decision — **self-hosted Inter.** The reference site declares `font-family: Inter, ...` with no `@font-face` and no font link, so it silently falls back to system sans on any machine without Inter installed. For a judged live demo that is an unacceptable coin flip, so I added `@fontsource-variable/inter` and bundled it. The typography now matches the screenshot on any machine, offline.
- Decision — **no goal/budget input was added.** The reference's command bar centres on a text input, a ceiling input and a "Replay the demo" button. Wiring those would mean new state and a new submit path, which the brief forbids, so the bar renders the same three slots read-only from existing state and reuses the pre-existing source toggle as its action control. Appearance matched, logic untouched.
- **Constraint honoured, proved mechanically:** `sessionReducer.js`, `useEventStream.js` and `mockStream.js` are unchanged since their original commit `d6c6286` — verified with `git diff --quiet` against both `d6c6286` and `HEAD`.
- Validation: `npm test` 36/36 at the repo root; render smoke test extended from 15 to 23 content assertions and now server-renders the whole `App` shell (previously only the panels), catching any crash in the rewritten hero, stepper and footer; clean production build with Inter bundled; servers restarted and the end-to-end SSE round trip re-verified through the Vite proxy.
- Blocked on: nothing
- Needs from Jeswin/Preethesh: nothing new.
- Commit: `539a4d9` (pushed to `deepthi/frontend-demo`), after merge commit `0b22b27` brought in `main` at `16c7677`.

### [2026-08-01 15:58 IST] — Fixed the stale dev server that hid every UI change
- Prompt: asked why the dark theme was still showing.
- Files changed: `frontend/vite.config.js`, `frontend/README.md`, `progress-deepthi.md`.
- Problem found: the re-themed code was correct and committed, but the browser was being served the old dark build. Two Vite processes were running. The original one still held port 5173 and was answering with `--bg: #0b0f17`; the newer one had logged `Port 5173 is in use, trying another one...` and quietly moved to 5174. On top of that, the first process had never picked up any of my edits at all, because **inotify does not fire on `/mnt/d` under WSL2** — it was serving cached transforms from when it started.
- Decision: fixed both halves rather than just restarting. Added `server.watch.usePolling` (interval 300ms) so file changes are actually detected on this Windows-drive/WSL setup, and `server.strictPort: true` so a second dev server now refuses to start instead of silently relocating. The silent port fallback is what turned a stale process into a confusing "my changes did nothing" symptom, and it would have recurred every session.
- Validation: killed all four stale PIDs, restarted one dev server, confirmed exactly one Vite process running, and confirmed `http://127.0.0.1:5173/src/styles.css` now serves `--canvas: #f3efe5`, `--paper: #fffdf8`, `--forest: #1d3b2d`, `--coral: #e56b52` instead of the old dark tokens. Backend health and the `/health` proxy both still return ok.
- Note for the team: this trap is not frontend-specific. Anyone running a watching dev process against this repo from WSL will hit it, so it is documented in `frontend/README.md`.
- Blocked on: nothing
- Needs from Jeswin/Preethesh: nothing.
- Commit: `fa86e0e` (pushed to `deepthi/frontend-demo`)

### [2026-08-01 16:20 IST] — Audited the build against the spec; found and fixed a mislabelling bug
- Prompt: asked whether all the features work as specified in the Markdown files.
- Files changed: `frontend/src/components/FinalReceipt.jsx`, `frontend/src/lib/mockStream.js`, `frontend/src/styles.css`, `frontend/test/render.ssr.jsx`, `progress-deepthi.md`.
- Audit performed: re-read Jeswin's new producer-behaviour notes in `INTERFACES.md` §2 and checked each one against the dashboard, then read the agent core's `events.py` and `orchestrator.py` directly instead of trusting the prose.
- Checked and correct: repeated `split_update` at the same round (the reducer always takes the latest, never keys by round); over-budget early rounds render as overflow rather than being clamped; `final_receipt` is treated as the terminal signal; all four allocation keys always present. Currency units were the biggest risk — the agent core works in integer paise — but `to_rupees()` converts at the event boundary, so the wire carries rupees and the existing formatting is right.
- **Bug found and fixed:** each `final_receipt.purchases` line carries its own `status` and `source`, and the receipt rendered neither. A fixture line and a *failed* line both displayed as completed purchases with an amount charged. On the mocked stream the banner masked it; on the live stream there is no banner, so this was a real mislabelling of a fixture as a completed order — the exact disqualifier risk in the handbook. Failed lines now read "not charged", fixture lines "simulated · fixture", live lines "live order", untagged lines "source unverified". The copied fan-out summary carries the same labels.
- Decision: also filled `status`/`source` into the mocked receipt lines so the mock exercises the same labelling path as a real run. This touches `mockStream.js`, which I had otherwise kept frozen — the event shapes and stream flow are unchanged, only the fixture payload gained the two fields the real producer already sends. Flagging it explicitly because I had previously reported that file as untouched.
- Known gap, not fixed: `summarize()` totals only the four locked categories, so an allocation key outside those four would be omitted from the allocated total. Jeswin's note says the current MVP goals never emit one; fixing it would mean changing reducer logic, so I am flagging rather than pre-emptively changing it.
- Validation: 36/36 at the repo root, render assertions up to 24, clean build. The new test builds a receipt shaped exactly like the agent core's `_close()` output and asserts a fixture line cannot borrow the live-order label.
- **Scope still outstanding (not started):** the optional Flutter passkey screen, and the demo video plus Devfolio submission writeup — pitch, Prava integration explanation, disclosure section and track evidence. These are items 4 and 5 of my brief in `build-prompts.md`.
- Blocked on: nothing
- Needs from Jeswin: nothing — the producer notes were accurate and caught a real bug on my side.
- Commit: `4e578b4` (pushed to `deepthi/frontend-demo`)

### [2026-08-01 16:35 IST] — Merged the frontend branch into `main`
- Prompt: pull anything new on `main`, then merge my branch into `main`.
- Files changed: none beyond this log — the merge itself carried the already-reviewed frontend commits.
- Changed: fast-forwarded local `main` to `origin/main` at `16c7677`, then merged `deepthi/frontend-demo` into `main` with `--no-ff` so the branch stays legible in history, matching the pull-request-style merges already on `main`.
- Validation, run on `main` *after* the merge and *before* pushing: no conflicts and a clean working tree; `npm test` 36/36; the render smoke test passed with 24 content assertions; a clean production build; and a secret scan across the merged tree found nothing. Pushed `16c7677..3b7361e`. Confirmed `origin/main` carries the merge and that the only commit authors across the merged range are Jeswin and me.
- Decision: merged with `--no-ff` rather than fast-forwarding, so the 13 frontend commits stay grouped under one reviewable merge point instead of being interleaved into `main`'s linear history.
- Post-merge: fast-forwarded `deepthi/frontend-demo` back onto `main` so the branch and `main` are level at `3b7361e` with zero divergence, ready for the next phase.
- Blocked on: nothing
- Needs from Jeswin/Preethesh: pull `main` before your next phase — the `frontend/` tree and the repo-wide LF normalisation are now on it.
- Commit: `3b7361e` (merge commit on `main`; branch `deepthi/frontend-demo` level with it)

### [2026-08-01 16:50 IST] — First real end-to-end run: agent core → backend → dashboard
- Prompt: asked what work is left for me.
- Files changed: none — this was a verification pass, logged because the result changes what "done" means for my scope.
- Changed: nothing. Ran Jeswin's agent core for real (`python3 -m humsafar --goal "Plan my Goa trip" --budget 30000 --demo`) against the running backend, captured the 51 events it streamed, and folded them through my actual `sessionReducer` to see exactly what the dashboard would render.
- Result: **the live path works.** All nine locked event types were consumed, phase reached `complete`, four credentials were issued, five purchases recorded with one failure recovered, and both demo proof shots arrived (1 `blocked_attempt`, 1 `renegotiation_triggered`). Zero events fell through to the unrecognised-type path. Budget ₹30,000, allocated ₹28,800, spent ₹28,800.
- Why this mattered: until now the live path had only ever been tested with hand-POSTed events. Judging criterion 1 is whether intent → result actually works live, so an untested real integration was the biggest unknown left in my scope.
- **Confirmed the receipt fix was load-bearing:** every real receipt line came back with `source: "fixture"` and a `details` string ending "not a live merchant order". Before this morning's fix the dashboard would have rendered all four simulated bookings as completed orders with amounts charged.
- Blocked on: nothing in my lane.
- Needs from Jeswin/Preethesh: nothing — the agent core streamed exactly the locked shapes.
- Commit: `8fdde2f` (pushed to `deepthi/frontend-demo`)

### [2026-08-01 18:20 IST] — Pulled Preethesh's fixture fix and re-verified the contention beat
- Prompt: pull anything new from `main`.
- Files changed: none beyond this log; the merge brought in Preethesh's and Jeswin's work.
- Merged: `origin/main` `2f3622e` — 8 commits, mostly Preethesh's discovery-fixture correction plus status and workflow logs. Clean merge, no conflicts.
- Interface check: `INTERFACES.md` §3 changed (the fixture shape now covers all four categories, and `rating` is documented as a scripted preference score present only on offline fixtures). **No event shape changed**, so the dashboard needed no edit.
- Validation: `npm test` 37/37, Python 80/80, render smoke test 24 assertions.
- **Caught a stale-process trap again, this time on the backend.** My first re-run after the merge produced ₹17,400 of ₹30,000 — the exact figure Preethesh had identified as the defect. The backend process predated the merge and was still serving the old fixtures. After restarting it, the same command produced ₹28,800, matching his reported result. Worth naming for the team: on this repo any long-running dev process must be restarted after a pull, because the WSL/`/mnt/d` watching problem means nothing reloads itself.
- Confirmed the beat the dashboard exists to show: round 1 now asks ₹35,600 against a ₹30,000 budget, so the split bar overflows and the state chip reads "over budget" before the agents concede to ₹28,800. Before this fix, round one fit immediately and the negotiation was invisible.
- Also confirmed Jeswin's producer note in practice: round 2 emitted `split_update` **twice** (₹26,800 then ₹28,800). The reducer takes the most recent rather than keying by round, so the dashboard settles on ₹28,800 — the exact hazard that note warned about, handled.
- New scope assigned to me by Preethesh's audit: an **interactive goal/budget/approval flow**. The command bar is deliberately read-only today, because the earlier instruction was to change visuals without touching logic. This is now explicitly wanted and is a real feature, not a re-theme, so it needs its own phase.
- Team execution order now locked (Preethesh's `278b3bf`): Prava production-access form → sandbox access → one genuine sandbox transaction with cap-rejection proof → interactive UX and deployment → demo video and submission package last. This supersedes my earlier recommendation to start the submission writeup immediately.
- On his note that my `116ecf6` sits outside `main`: that is deliberate, not drift. My standing instruction is to push to my own branch and merge to `main` only when explicitly told.
- Blocked on: the interactive approval flow needs a real approval boundary from Jeswin — approval is auto-granted today, so there is nothing for a UI control to gate yet.
- Needs from Jeswin: expose the non-auto approval boundary Preethesh's audit asks for, and tell me how the dashboard should signal approval back — a plain POST endpoint, per the `INTERFACES.md` §2 note that the SSE stream stays one-directional.
- Commit: `0478aad` (pushed to `deepthi/frontend-demo`)
