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

### [2026-08-01 19:05 IST] — Proposed the human choice step ("taste step") to the team
- Prompt: add a new feature to the Markdown files, assigned to whoever can implement each part — after the agents settle the budget, the user picks the actual option (hotel room, flight, etc.) from a shortlist inside that slice, with photos and a preview, ranked by quality.
- Files changed: `INTERFACES.md` (new §6), `brainstorming.md` (new §6b, plus demo-script and role-split additions), `progress-deepthi.md`.
- Merged first: `origin/main` `39278cb` — 11 commits of Preethesh's Prava sandbox-access work and track review. Clean merge, no contract changes.
- Changed: wrote the feature up as a **proposed, not locked** contract so Jeswin and Preethesh can accept or reject it before anyone writes code. Everything specified is additive — two new event types (`choice_requested`, `choice_made`), one new endpoint (`POST /api/choices`), and extra fields on discovery options. **No existing shape changes**, so the current flow keeps working untouched if this is deferred.
- Decision — **where the step sits.** After the mediator finalises the split and before any card is minted. Any earlier and the user picks something the budget may not cover; any later and a credential has been minted for an option about to change.
- Decision — **the ranking rule is a correctness constraint, not a preference.** Rank by rating only where a real rating exists. Duffel stays return one; Duffel flight offers do not, and §2 already forbids inventing one. Where nothing real exists, rank by price and say so. "Top rated" over an unrated list is a false claim.
- Decision — **added an `environment: "test" | "production"` field.** Duffel's free tier is test mode, which returns placeholder inventory. That is a genuine live API call so `source: "live"` is accurate, but calling it live alone would imply real market data. This was the subtlest honesty trap in the whole idea and it needed its own field rather than a footnote.
- Decision — **a timeout with `chosenBy: "user" | "agent-timeout"`.** This is the only step in the run that waits on a human, so it must not be able to hang a live demo. A timed-out auto-pick must never be presented as a human decision, hence the field on the event rather than a UI-only distinction.
- Recorded as settled-impossible, so nobody burns time on them mid-build: real booking sites cannot be iframed (they send `X-Frame-Options`); a Duffel stay has no external property website to open because Duffel *is* the booking channel; and ranking by review-text analysis is not backed by any data we hold.
- Decision — **I did not write into `progress-jeswin.md` or `progress-preethesh.md`.** Those are append-only personal logs owned by their authors. Cross-team assignments belong in the shared files, so the work split went into `INTERFACES.md` §6.8 and `brainstorming.md` §8, which is where both of them already read for contract changes.
- Sequencing recorded explicitly: this is **below a genuine Prava sandbox transaction**. Cards are still stubs, and judging criterion 4 wants Prava meaningful and central — a richer picker on simulated payments scores worse than a plain UI on a real one.
- Validation: 37/37 JS tests and 80/80 Python still pass after the merge; documentation-only change on my side, no source touched.
- Blocked on: Jeswin and Preethesh accepting or amending §6 before implementation. Also still blocked on the approval boundary from the previous entry.
- Needs from Jeswin: agree or push back on §6, especially the pause-and-wait in the orchestrator and the ranking rule. Needs from Preethesh: agree or push back on §6.3, and decide the open question there — whether events gain a `runId` or the backend simply tracks one active run.
- Commit: `b401f14` (pushed to `deepthi/frontend-demo`)

### [2026-08-01 23:20 IST] — Merged the choice-step proposal into `main`
- Prompt: pull anything new from `main`, then merge my work into `main`.
- Files changed: `progress-deepthi.md` only; the merge carried the already-written §6 proposal.
- Merged in first: `origin/main` `a47c450` — Preethesh's final audit of the revised execution plan. Documentation only, no contract or source changes, so nothing in the dashboard was affected.
- **New requirement landed on me** from his item (7) and his teammate note: *present per-purchase sandbox/fixture evidence, and never imply all four purchases are genuine from a single Prava checkout.* Partly satisfied already — every purchase card and every receipt line carries its own `source` tag, and an untagged line reads "source unverified". **The gap is at run level:** the receipt header still reads "Every agent has settled · ₹28,800 spent" with no aggregate statement, so a judge glancing at it could read four real purchases where only one was a genuine sandbox charge. A mixed-mode run needs an explicit run-level label, not just per-line tags. Recorded here rather than fixed, because this session's task was the merge; it is the first thing to build once the sandbox charge exists to label.
- Merged out: `deepthi/frontend-demo` into `main` with `--no-ff`, carrying the proposed `INTERFACES.md` §6 and `brainstorming.md` §6b choice step so Jeswin and Preethesh can review it on `main`.
- Validation before pushing `main`: clean tree, no conflicts, `npm test` 40/40, Python 80/80.
- Blocked on: Jeswin and Preethesh accepting or amending §6 — it is still 🟡 proposed, and merging it to `main` publishes the proposal for review, it does not lock it.
- Needs from Jeswin/Preethesh: review §6. From Preethesh specifically: tell me the shape of the per-purchase sandbox evidence you want surfaced, so the mixed-mode label reflects what Prava actually returns rather than something I invent.
- Commit: `bf900f8` (merged to `main`)

### [2026-08-02 00:10 IST] — Priority 0 item 3: provenance labelling
- Prompt: pull the repo, then continue my part of the work.
- Files changed: `frontend/src/lib/provenance.js` (new), `frontend/test/provenance.test.js` (new), `frontend/src/components/FinalReceipt.jsx`, `frontend/src/components/PurchaseCards.jsx`, `frontend/src/styles.css`, `frontend/test/render.ssr.jsx`, `frontend/README.md`, `progress-deepthi.md`.
- Merged first: `origin/main` `bd78d6a` — 5 commits adding `execution-plan.md` and `precaution.md`, both now mandatory startup reading. Read both in full before writing anything.
- **Why this item and not another.** The plan gives me four Priority 0 items. Items 1 and 2 (goal/budget submission, run-correlated approval UI) both depend on gate **G2 — backend primitives**, which Preethesh has not built; item 4 depends on Jeswin's Agents SDK identity. Item 3 — render `fixture`, `sandbox`, `production` and `environment=test` distinctly, keep unknown provenance pessimistic — depends on nothing outside my own code, so it was the only Priority 0 item actually unblocked. It also closes the mixed-mode gap I flagged in the previous entry.
- Changed: added `src/lib/provenance.js` as the single place that turns a purchase's `source`, `status` and `environment` into a label, and wired the receipt and the credential cards through it.
- Decision — **the label strings are copied verbatim from the `precaution.md` table, not paraphrased.** A friendlier synonym is precisely the drift that turns an honest demo into an overstated claim, so `test/provenance.test.js` pins the exact wording and asserts the banned phrases ("order placed", "real money", "production") never appear.
- Decision — **a failed sandbox line is NOT labelled "declined as expected".** That phrasing would claim the failure proves cap enforcement, when without a structured cause it could equally be an ordinary booking failure. It reads "Prava sandbox checkout attempt — not completed" until there is a real signal to distinguish the two.
- Decision — **the legacy `source: "live"` is treated as unproven.** In `INTERFACES.md` §4 it means live *data*, which says nothing about whether money moved, and `precaution.md`'s vocabulary is fixture/sandbox/production. Reading it as a completed payment would be the exact overstatement being guarded against.
- Decision — **run-level labelling, which is the part that was actually missing.** Per-line tags already existed; the receipt header did not. It now states the run mode and "N of M purchases exercised a payment path", so a one-real-three-fixture run cannot be read as four real orders. The copied fan-out summary carries the same line.
- Validation: 52/52 tests at the repo root (12 new provenance tests), render smoke test at 24 assertions including a purpose-built mixed-mode receipt (one sandbox, two fixture, one untagged) asserting only the sandbox line may claim a completed checkout; clean production build. Restarted the backend after the pull per the `precaution.md` demo-day checklist, ran the real agent core, and confirmed the live data produces "Fixture-only run — no payment was attempted" with **0 of 4** proven — which is the honest description of where the project stands today.
- Blocked on: Priority 0 items 1, 2 and 4 remain blocked on gate G2 and on Jeswin.
- Needs from Preethesh: emit `sandbox` or `production` as the purchase `source` once real charges exist — `live` is ambiguous under the new vocabulary and my code will keep treating it as unproven. Also propagate the structured `errorCode` you identified (e.g. `THRESHOLD_EXCEEDED`); with it I can honestly show "declined as expected" as cap-enforcement evidence, and without it I will not claim it.
- Commit: `b81156c` (pushed to `deepthi/frontend-demo`)

### [2026-08-02 00:35 IST] — Merged provenance labelling into `main`; gate G2 has opened
- Prompt: pull anything new from `main`, then merge my work into `main`.
- Files changed: `progress-deepthi.md` only; the merge carried the provenance work.
- Merged in first: `origin/main` `9f47a99` — Preethesh's **gate G2 backend primitives**: `approvalService`, the run-scoped approval routes, and the mandate resolver. Clean merge.
- **My §6 taste-step proposal was accepted.** It is now 🟢 locked in `INTERFACES.md` as an additive, post-Prava-gate contract, with Preethesh requiring mandatory `runId` correlation rather than the single-active-run shortcut I had offered as the cheaper option. His reasoning is better than mine was: explicit `runId` means a delayed click can never mutate a later run. Photos are cut first if time runs short.
- **Gate G2 has opened, which unblocks my Priority 0 items 1 and 2.** The new `INTERFACES.md` §7 protocol is `POST /api/approvals/requests`, `GET /api/approvals/:id?runId=`, `POST /api/approvals/:id/decision`, and `POST /api/approvals/:id/consume`. That is a four-call protocol with expiry and one-shot consumption, so the approval UI is now buildable rather than blocked — it is the next thing I pick up.
- Merged out: `deepthi/frontend-demo` into `main` with `--no-ff`, carrying `provenance.js`, its 12 tests, the run-level mixed-mode receipt banner, and the exact `precaution.md` labels.
- Validation before pushing `main`: clean tree, no conflicts, **59/59** JS tests, 80/80 Python, render smoke test at 24 assertions.
- Blocked on: nothing in my lane any more. Priority 0 items 1 and 2 are now unblocked by G2; item 4 still waits on Jeswin's agent identity, and the taste step still waits on the G4 Prava evidence gate by design.
- Needs from Preethesh: unchanged — emit `sandbox`/`production` as the purchase `source`, and propagate the structured `errorCode`, so the labels can reflect real evidence rather than staying pessimistic by default.
- Commit: `60e7669` (merged to `main`)

### [2026-08-02 00:55 IST] — Priority 0 item 2: the run-scoped approval UI
- Prompt: pull the repo, and do my remaining work.
- Files changed: `frontend/src/lib/approvals.js` (new), `frontend/src/components/ApprovalPanel.jsx` (new), `frontend/test/approvals.test.js` (new), `frontend/src/state/sessionReducer.js`, `frontend/src/App.jsx`, `frontend/src/styles.css`, `frontend/src/lib/mockStream.js`, `frontend/vite.config.js`, `frontend/test/sessionReducer.test.js`, `frontend/test/render.ssr.jsx`, `progress-deepthi.md`.
- Merged first: `origin/main` `a6c7747` — Preethesh's Prava key-mapping docs. Fast-forward.
- **Checked my provenance work against the newly locked `INTERFACES.md` §8 before building anything else.** §8 locks payment `source` to `fixture | sandbox | production`, pairs discovery `source` with `environment`, and requires a fixture+sandbox run to be `mixed-mode` without promoting the run to the strongest line. My `provenance.js` already satisfies all three — no rework needed, and the legacy `live` handling stays useful as a pessimistic fallback.
- Changed: built the §7 approval gate. The reducer now captures `runId`, `approvalRequestId`, `digest` and `expiresAt` from `approval_requested`; `approvals.js` holds the protocol client and state machine; `ApprovalPanel` shows the exact allocation, a live countdown, and approve/decline.
- Decision — **the client never computes a digest.** §7 says the backend computes it and callers never invent one, so the digest is echoed back untouched. A test asserts the request body is exactly `{ runId, digest, decision }`.
- Decision — **no approve button without full correlation.** All three of `runId`/`approvalRequestId`/`digest` are required. The backend fails closed on a mismatch, so offering a click that is guaranteed to 404 is worse than explaining why it is unavailable. Same for an expired request.
- Decision — **a new `approval_requested` clears any earlier decision for that run.** The digest covers the plan, so a changed plan means the previous approval must not carry over. Tested.
- Decision — **the token is never sent from the browser.** §7 forbids shipping `INTERNAL_API_TOKEN` in browser JavaScript, so the client sends no `Authorization` header at all and the Vite dev server attaches it server-side in `proxyReq`. A test asserts the client attaches no authorization header, and I grepped the built bundle to confirm the token name does not appear. A real deployment needs an equivalent trusted proxy — noted in the config comment so nobody "fixes" this by moving the token into `import.meta.env`.
- Decision — **the mocked stream refuses to submit.** There is no backend to answer it, so clicking approve on the mock says so plainly instead of faking a recorded decision.
- Validation: **74/74** tests at the repo root (32 new frontend tests), render smoke test extended to cover pending, expired, uncorrelated and not-yet-requested panel states, clean build. **End-to-end against Preethesh's real routes:** created a request, sent a decision using exactly my client's body shape (`202`), confirmed a mismatched `runId` returns `404` and a tampered digest returns `409 APPROVAL_DIGEST_MISMATCH` — the structured code my client surfaces verbatim — and confirmed the decline path returns `202`. Also verified the same call succeeds through the Vite proxy, which is the path the browser actually uses.
- Note: `strictPort` earned its keep — the dev server refused to start over a stale one instead of silently moving to another port, which is exactly the failure it was added for.
- Blocked on: Priority 0 item 1 (goal/budget submission) needs a run-creation endpoint; §7 covers approvals but I did not find a documented `POST /api/runs`. Item 4 still needs Jeswin's agent identity fields.
- Needs from Preethesh: confirm the run-creation endpoint for item 1 — its path and body — or tell me the goal/budget is meant to be posted some other way. Everything else for the approval gate is done and verified against your implementation.
- Commit: `c2f1cb6` (pushed to `deepthi/frontend-demo`)

### [2026-08-02 01:15 IST] — Merged the approval gate to `main`, then wrote the root README
- Prompt: pull `main`, merge my work into `main`, then continue any pending work of mine.
- Files changed: `README.md` (new), `progress-deepthi.md`.
- Merged in: `origin/main` `a1aa8c3` — Preethesh's corrected Prava verifier and his **successful sandbox authentication check**. Merged out `deepthi/frontend-demo` into `main` at `4b6421b` with the §7 approval gate, after 75/75 JS, 80/80 Python and a clean build **on `main`** rather than only on my branch.
- Then continued with the next unblocked item. Priority 0 item 1 is still blocked — I re-checked `INTERFACES.md` after the merge and there is still no documented run-creation endpoint — and item 4 needs agent identity fields that are not on `main` yet. Priority 1 is gated on G4 by design. So the highest-value unblocked work was **Priority 2 item 8, the root `README.md`**, which is a submission asset with a hard deadline and was not started.
- Changed: wrote the root `README.md` — product explanation, the mechanic, architecture diagram with ownership, run and test instructions, the provenance label table, both proof shots, the disclosure section, team split, and known limitations.
- Decision — **the README leads with a "current status — read this before judging" table.** The strongest temptation in a submission README is to describe the intended system as though it were the shipped one. Putting the honest status above the feature description makes that impossible to do by accident, and it matches what the UI already enforces in code.
- Decision — **the payment status is stated exactly.** Prava sandbox authentication is verified; no customer, mandate, session, credential or transaction has been created; no payment has occurred. I took this from Preethesh's verifier result rather than paraphrasing it optimistically, because "sandbox verified" could easily be misread as "a sandbox payment happened".
- Decision — **the disclosure separates four things** rather than the usual two: what predates the build window (planning only), what was built inside it (all code), what is fixture and why, and the exact payment status. The rules ask for pre-existing work; the fixture and payment lines are what actually prevent a misleading impression.
- Validation: verified every factual claim in the README against the repo rather than from memory — test counts (75 JS, 80 Python) by running both suites, the Node 20.19+ and Python 3.10+ floors from `package.json` and `agents/README.md`, the existence of `npm run prava:verify`, and each documented agent flag against `agents/README.md`. The run instructions are the exact commands used in this session.
- Blocked on: item 1 still needs the run-creation endpoint from Preethesh; item 4 needs Jeswin's agent identity fields to reach `main`.
- Needs from Preethesh: the run-creation endpoint path and body. Needs from Jeswin: the agent identity/stage fields once your branch merges, so the deliberation view can show which agent is acting without exposing chain-of-thought.
- Commit: `23d580a` (pushed to `deepthi/frontend-demo`)

### [2026-08-02 01:45 IST] — Accessibility and mobile pass; two real contrast failures fixed
- Prompt: pull `main`, merge my work in, then continue any pending work.
- Files changed: `frontend/src/styles.css`, `frontend/src/components/FinalReceipt.jsx`, `frontend/test/render.ssr.jsx`, `progress-deepthi.md`.
- Merged the root README to `main` at `186b3b9` first (docs-only, verified with a diff excluding `.md` that no source changed; 75/75 on `main` before pushing).
- Then continued. Items 1 and 4 are still blocked — I re-checked and there is still no run-creation endpoint, and Jeswin's identity fields are not on `main` — so I took the outstanding acceptance criterion instead: my section of `execution-plan.md` requires reducer, render, **accessibility**, production build, SSE reconnect and **mobile layout** checks to pass. Reducer, render, build and SSE were already covered; accessibility and mobile had never been checked at all.
- **Two genuine WCAG failures found by measuring rather than eyeballing.** `--muted-2` was `#8e968f` at **2.99:1** on paper, well under the 4.5:1 floor, and it carries real content — run ids, credential fields, audit rows. Fixed to `#666e67`. Then, widening the check to every background the token is actually used against caught a second one: `--muted` passed on paper at 5.00:1 but was only **4.43:1 on canvas**, which is exactly where `.hero-copy` sits at 17px — below the 18.66px/24px large-text threshold, so it needs the full 4.5. Fixed to `#636e66`. Every text token now measures ≥4.5:1 on all three surfaces.
- Decision — **checked each token against every surface it appears on, not just one.** The second failure only existed on canvas; a single-background check would have declared the palette clean and shipped it.
- Verified the agent colours are fine as-is: they are only ever used as icon glyphs on their own tint, every icon is `aria-hidden` because its meaning is carried by adjacent text, so the 4.5:1 text rule does not apply. Confirmed they still clear the 3:1 graphics guideline anyway (3.72–6.48:1).
- Also fixed: no visible keyboard focus anywhere — added `:focus-visible` outlines, including a `:has()` rule for the source toggle, whose real checkbox is visually hidden so the ring had to be drawn on the label the user can see. The receipt modal was a keyboard trap; Escape now closes it and focus moves to the close button when it opens. Raised the smallest font sizes from 8–9.5px to a 9.5–10.5px floor, which matters as much for a recorded demo video as for accessibility.
- Mobile: audited every fixed grid track and width. All three fixed-track grids (`hero`, `workspace`, `command-row`) already collapse to one column at their breakpoints, and the only remaining fixed pixel values are `max-width`/`min()` bounds, so nothing can overflow a 320px viewport.
- Validation: 75/75 tests, render smoke test now carries accessibility assertions (dialog role, `aria-modal`, labelled icon-only button, live countdown region, and every SVG `aria-hidden`) so these cannot silently regress; clean production build; contrast recomputed after each change rather than assumed.
- Blocked on: item 1 still needs the run-creation endpoint; item 4 needs Jeswin's identity fields on `main`.
- Needs from Jeswin/Preethesh: unchanged from the previous entry.
- Commit: `efd2e11` (pushed to `deepthi/frontend-demo`)

### [2026-08-02 02:05 IST] — Added the track-evidence section, closing item 8
- Prompt: pull `main`, merge my work in, then continue any pending work.
- Files changed: `README.md`, `progress-deepthi.md`.
- Merged the accessibility pass to `main` at `0098d64` first, after 75/75, the render suite and a clean build **on `main`**.
- Then found a real gap in my own supposedly-finished work: `execution-plan.md` Priority 2 item 8 asks for "README, architecture diagram, setup instructions, disclosure, exact source labels, **and track-evidence sections**". I had written every part except the last one, so item 8 was not actually complete.
- Changed: added a prize-track evidence table covering all seven tracks with the status each claim honestly holds today.
- **Verified each claim by running it rather than asserting it.** NANDA's `GET /.well-known/agentfacts.json` and `POST /a2a/ping` both return `200`. The trust route returns a `source: "fixture"` envelope whose own reason string reads *"replace with a verified Senso response before claiming track evidence"*. No `OPENAI_API_KEY` is configured, so the agent core runs deterministic dialogue.
- Decision — **two tracks are explicitly not claimed.** Senso is marked ✗ because a local fixture heuristic is not Senso, exactly as Preethesh's track review concluded. Linq is ✗ because messaging is not our core interface and a bolted-on channel is the decorative integration the handbook penalises. Writing "not claimed" into the README is more useful than silence, because it stops anyone quietly claiming them later under deadline pressure.
- Decision — **Visa is marked partially demonstrated rather than pending.** The track wants completion *and* permissions/controls; the controls half is genuinely real and tested (per-agent caps, merchant-scoped mandates, an expiring one-shot approval that fails closed on a changed plan). Splitting the status is more accurate than a single verdict on either extreme.
- Decision — **OpenAI is marked not yet demonstrated, and the reason is stated as a design choice rather than an omission.** No model output may move money, so the money path is deterministic by construction; that is worth saying plainly rather than looking like a missing integration.
- This follows Preethesh's instruction to me directly: prepare track-specific evidence only for integrations actually demonstrated.
- Validation: 75/75 tests; every endpoint claim in the table exercised against the running backend before being written down.
- Blocked on: item 1 needs the run-creation endpoint; item 4 needs Jeswin's identity fields on `main`; items 7, 9 and 10 (deploy, video, Devfolio) need external platform access and a real transaction to record.
- Needs from Jeswin/Preethesh: unchanged. The track table will need updating the moment the first genuine sandbox charge lands — that single event moves Prava from pending to demonstrated and completes the Visa claim.
- Commit: `961c8c3` (pushed to `deepthi/frontend-demo`)

### [2026-08-02 02:30 IST] — Drafted the submission pack while blocked on everything else
- Prompt: pull `main`, merge my work in, then continue any pending work.
- Files changed: `submission.md` (new), `progress-deepthi.md`.
- Pull/merge: nothing new on `main`, and my branch was already level at `dd72333` — nothing to pull and nothing to merge this round.
- Re-checked all three blockers rather than assuming: still no `POST /api/runs` in `INTERFACES.md` (item 1), still no agent identity fields (item 4), and still no completed Prava charge anywhere in Preethesh's log. **The deadline is today** — the earlier published time is Aug 2, 3 PM PT / Aug 3, 3:30 AM IST.
- Decision — **drafted the submission content now, even though the agreed order puts it last.** The sequencing exists so optional work does not crowd out the sandbox transaction, and drafting text does not compete with that: it uses time that is otherwise idle while I am blocked on two teammates and one credential. Writing it after the charge lands would put the slowest task on the critical path at the worst moment. Nothing is published — that decision stays with the team.
- Changed: added `submission.md` with the Devfolio field copy, a shot-by-shot demo runbook, and a pre-submission checklist.
- Decision — **every charge-dependent claim is written twice, [A] charge landed and [B] no charge.** This is the part that actually de-risks the deadline. Under time pressure the failure mode is not forgetting to write copy, it is pasting an optimistic claim that the demo cannot support. Pre-writing the honest [B] variant means the safe option costs zero minutes at 3am, and the pack says explicitly: never mix variants, and if in doubt use [B].
- Decision — **the runbook names the exact phrases that must not be said** ("order placed", "booking confirmed", "real money", "production", "we analysed reviews") and flags beat 8 as where an overclaim is both most tempting and most damaging. A narration slip is not caught by any test, so it needed to be written down.
- Also recorded in the checklist: publish rather than leave a draft, verify the status reads *Submitted*, choose one variant consistently across README/video/Devfolio, and restart long-running processes after the final pull.
- Validation: 75/75 tests still pass; scanned the new file for key/card patterns before committing — clean.
- Blocked on: unchanged — items 1 and 4 on teammates, items 7/9/10 on platform access and a real transaction to record.
- Needs from Jeswin/Preethesh: someone must check the **live Devfolio countdown** and confirm which deadline is real. `brainstorming.md` flags the handbook contradicting itself by four hours, and that is the single assumption that could cost us the submission outright.
- Commit: `cc20d6e` (pushed to `deepthi/frontend-demo`)
