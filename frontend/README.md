# Humsafar Dashboard (Deepthi — frontend)

React 19 + Vite dashboard for the live agent deliberation demo. Consumes the
event stream locked in [`../INTERFACES.md`](../INTERFACES.md) Section 2.

## Run it

```bash
# terminal 1 — Preethesh's backend (from the repo root)
npm install && npm start          # http://127.0.0.1:3000

# terminal 2 — this dashboard
cd frontend && npm install && npm run dev   # http://localhost:5173
```

The root page is a one-question-at-a-time conversational trip concierge. Starting a run switches to the live
stream automatically and persists the run correlation for refreshes. With no
run, the dashboard can still boot on the clearly labelled mocked stream; use
`?source=live` or `?source=mock` to select explicitly.

Point the dev proxy somewhere else with `HUMSAFAR_BACKEND_URL=http://host:port`.

### If your edits don't show up

This repo lives on a Windows drive (`/mnt/d`) reached through WSL2, where inotify
does not fire for edits made on the Linux side. `vite.config.js` therefore sets
`server.watch.usePolling`, without which the dev server never notices a change
and serves cached transforms indefinitely.

It also sets `strictPort: true`. Vite's default is to silently move to the next
free port when 5173 is taken — which leaves a stale server still answering on
5173 while the new one runs elsewhere, so you sit there looking at an old build.
With `strictPort` the second server refuses to start instead. If you see that
error, kill the old one (`pkill -f "node.*vite"`) rather than opening 5174.

## Tests

```bash
npm test          # reducer unit tests (also run by `npm test` at the repo root)
npm run test:render   # SSR smoke test: renders every panel against the full mock script
npm run build     # production bundle
npm run test:e2e  # full browser rehearsal; requires Chrome/Brave debugging on :9222
```

## Layout

| Path | What it is |
|---|---|
| `src/state/sessionReducer.js` | Pure fold of the locked event contract into UI state. No React — unit-tested directly. |
| `src/lib/mockStream.js` | **MOCKED** scripted replay of the `brainstorming.md` Section 7 demo beats. |
| `src/lib/useEventStream.js` | Switches between the mock replay and `EventSource("/api/events")`. |
| `src/pages/Intake.jsx` | One-question-at-a-time destination, origin, journey mode, dates/flexibility, party, budget and vibe intake. Provider codes and coordinates are deliberately absent from the user flow. |
| `src/pages/Choose.jsx` | Affordable option selection with honest ranking and timeout labels. |
| `src/components/` | Deliberation feed, budget split, credential cards, proof panel, audit log, truthful receipt, full-size Milo guide and 3D trip quest. |
| `src/lib/journeyGame.js` | Pure itinerary-to-station mapping, board coordinates, real-coordinate distances and run-isolated progress keys. |
| `e2e/browser-rehearsal.mjs` | Dependency-free Chrome DevTools rehearsal from intake through receipt, geolocation and the first virtual station. It captures desktop intake, mid-ride, completion and 390px mobile evidence under `/tmp`. Set `HUMSAFAR_E2E_PAYMENT=true` only for a deliberate Prava proof run. |
| `src/lib/icons.jsx` | Inline SVG glyphs. Presentation only. |
| `src/styles.css` | The warm "paper" theme — canvas `#f3efe5`, forest `#1d3b2d`, coral `#e56b52`, mint `#c9f2dd`. |

## Design language

Warm editorial "paper" theme: a light canvas with soft mint and coral radial
washes, forest-green primary, coral serif italic for emphasis in the headline,
and monospace uppercase micro-labels for every meta line. Panels are 20px-radius
paper cards with a soft shadow and a `#ddd6c9` hairline border.

The layout is hero → journey stepper → two-column workspace → truth-layer
footer. The stepper (Negotiate → Approve → Lock spend → Verify) is derived
purely from the `phase` the reducer already computes — it is a display mapping,
not a second state machine.

`@media (prefers-reduced-motion: reduce)` disables every animation.

Milo is intentionally a large character rail, not an avatar button: 255×350px
on desktop intake/quest, a 170×210px companion on intermediate pages, and a
130×160px horizontal companion on phones. The quest borrows the broad visual
language of minimalist line-painting games—raised white track, bright completed
trail, chunky runner and low-poly scenery—but uses original CSS/SVG and the
traveller's actual itinerary order. No game asset or source code is copied.

## Two things that are deliberate, not accidental

**The mock is loud.** When the mocked stream is active the page carries a
persistent amber banner, every purchase is tagged `mocked stream`, and the final
receipt states that no payment was made. The hackathon rules make presenting a
mocked payment as a real transaction a disqualifier risk, and Preethesh's
progress log asks explicitly that fixture or failed card issuance is never shown
as a completed live payment. The UI enforces that rather than relying on the
narrator to remember.

**Provenance wording is copied from `precaution.md`, not paraphrased.**
`src/lib/provenance.js` is the single place that turns a purchase's `source`,
`status` and `environment` into a label, and every string in it is lifted
verbatim from that file's table. A nicer-sounding synonym is exactly the drift
that turns an honest demo into an overstated claim, so the labels are pinned by
`test/provenance.test.js`.

Rules it enforces:

- an unrecognised or absent `source` reads "source unverified; not evidence of a
  payment" — never the optimistic case;
- the legacy `source: "live"` describes where the *data* came from and says
  nothing about payment, so it stays unproven;
- a failed sandbox line is **not** claimed as a decline that proves cap
  enforcement — without a structured cause it could be an ordinary booking
  failure;
- a structured `credential_failed` line says Prava refused credential issuance
  and that no checkout occurred; it never implies a merchant decline;
- `environment: "test"` is always qualified as test inventory;
- if only some categories exercise Prava, the run is labelled **mixed-mode** and
  the receipt states how many lines genuinely exercised a payment path, so one
  real line can never stand for the whole run.

## Dev proxy

`EventSource` cannot send custom headers and the backend sets no CORS headers, so
the stream has to be same-origin. Rather than ask Preethesh to widen the
backend's origin policy for a dev-only concern, `vite.config.js` proxies `/api`
and `/health` to the backend. A production build should be served from the same
origin as the API for the same reason. The dev proxy reads the repository-root
`.env` server-side to attach `INTERNAL_API_TOKEN`; it never exposes that token to
browser code.
