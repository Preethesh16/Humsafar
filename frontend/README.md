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

The dashboard boots on the **mocked stream** by default so it demos with no
backend running. Flip the "Live backend" toggle in the header, or open
`http://localhost:5173/?source=live`, to consume the real SSE stream.

Point the dev proxy somewhere else with `HUMSAFAR_BACKEND_URL=http://host:port`.

## Tests

```bash
npm test          # reducer unit tests (also run by `npm test` at the repo root)
npm run test:render   # SSR smoke test: renders every panel against the full mock script
npm run build     # production bundle
```

## Layout

| Path | What it is |
|---|---|
| `src/state/sessionReducer.js` | Pure fold of the locked event contract into UI state. No React — unit-tested directly. |
| `src/lib/mockStream.js` | **MOCKED** scripted replay of the `brainstorming.md` Section 7 demo beats. |
| `src/lib/useEventStream.js` | Switches between the mock replay and `EventSource("/api/events")`. |
| `src/components/` | Deliberation feed, budget split, credential cards, proof panel, audit log, final receipt. |
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

## Two things that are deliberate, not accidental

**The mock is loud.** When the mocked stream is active the page carries a
persistent amber banner, every purchase is tagged `mocked stream`, and the final
receipt states that no payment was made. The hackathon rules make presenting a
mocked payment as a real transaction a disqualifier risk, and Preethesh's
progress log asks explicitly that fixture or failed card issuance is never shown
as a completed live payment. The UI enforces that rather than relying on the
narrator to remember.

**An absent `source` tag renders as "source unverified", never as live.**
`INTERFACES.md` Section 4 defines the `live | fixture` tag and Section 2 does not
list it on `purchase_result`, so the dashboard reads it tolerantly and refuses to
assume the optimistic case when it is missing.

## Dev proxy

`EventSource` cannot send custom headers and the backend sets no CORS headers, so
the stream has to be same-origin. Rather than ask Preethesh to widen the
backend's origin policy for a dev-only concern, `vite.config.js` proxies `/api`
and `/health` to the backend. A production build should be served from the same
origin as the API for the same reason.
