# Deploying Humsafar

One container. The Node backend serves the built frontend *and* spawns the
Python agent, so all three parts of the product share a process tree and an
origin. That sharing is not incidental — it is what lets the browser
authenticate with a cookie instead of holding the internal API token.

---

## Why it is one image

`runService.js` spawns `python3 -m humsafar` for every run, so Node and Python
have to be in the same container. Node is the base image and Python is installed
on top, because the Node image ships a working npm and the Python one does not.

The frontend is built during the image build and served by the backend. In
development Vite serves it instead and proxies `/api` through, injecting
`INTERNAL_API_TOKEN` on the way (see `frontend/vite.config.js`). Deployed there
is no dev server, which is the whole reason the session layer exists.

---

## Authentication in production

Two different callers need two different amounts of power.

| Caller | Credential | Can reach |
|---|---|---|
| Browser | signed `humsafar_session` cookie, httpOnly | start a run, read a run, choose an option, decide an approval, read the SSE stream |
| Agent process | `Authorization: Bearer $INTERNAL_API_TOKEN` | all of the above **plus** card minting, event publishing, approval create/consume, discovery, trust, every Prava route |

The cookie is issued by the server when it serves the app shell and is signed
with `SESSION_SECRET`. **The internal token never reaches client code.**

This is deliberately *narrower* than the development proxy. That proxy hands the
browser the full internal token, which means anyone with dev tools open on a dev
instance can mint a scoped card or publish a forged event into the stream. A
session cookie cannot do either. `backend/test/session.test.js` asserts exactly
that, route by route.

The cookie does not identify a user. Anyone who loads the page can start a run,
which is correct for a public demo with no accounts — the property being
protected is that a browser cannot reach the payment machinery.

---

## Environment

Required:

| Variable | Notes |
|---|---|
| `INTERNAL_API_TOKEN` | **Required.** `server.js` refuses to bind a non-loopback host without it, and `authorize()` is a no-op when unset — so an unset token on a public host would mean no auth at all. |
| `PRAVA_SECRET_KEY` | Server-to-server Prava calls. |
| `PRAVA_PUBLISHABLE_KEY` | |

Strongly recommended:

| Variable | Notes |
|---|---|
| `SESSION_SECRET` | Signs browser cookies. Generated per boot if unset, so a restart logs everyone out. Set it for a stable demo. |
| `OPENAI_API_KEY` | Without it the agents fall back to deterministic dialogue — the run still works and spends identically, but the specialists no longer choose their own opening positions. |
| `PUBLIC_BASE_URL` | Only used for `agentfacts.json`. |
| `DUFFEL_ACCESS_TOKEN` | The only reason inventory is fixture rather than live. |
| `GEOAPIFY_API_KEY` | **The mapped itinerary is dead without it.** Both `/api/itineraries/*` routes return `503 GEOAPIFY_NOT_CONFIGURED`, so the intake page loses its suggestions and the plan never renders. Free tier is enough. |
| `GOOGLE_MAPS_API_KEY` | Optional; falls back to Nominatim for geocoding. |

Set automatically by the Dockerfile: `HOST=0.0.0.0`, `PORT=3000`,
`HUMSAFAR_PYTHON=python3`, `NODE_ENV=production`.

**Do not set `HUMSAFAR_BACKEND_URL`** unless the agent runs outside the
container. The server derives it from the port it actually bound, which matters
because Render and Railway both *assign* `PORT` — the agent's own default of
`http://127.0.0.1:3000` would then point at nothing, and every run would publish
zero events to a dashboard waiting for them. That failure only appears once
deployed, which is how it was found.

---

## Render

1. New → Web Service → connect the repo.
2. Runtime **Docker** (it will find the `Dockerfile`).
3. Add the environment variables above. Leave `PORT` alone — Render injects it.
4. Deploy.

Free tier sleeps after inactivity and takes ~30s to wake. **Hit the URL a few
minutes before demoing**, or the first judge to click gets a spinner.

## Railway

1. New Project → Deploy from GitHub repo.
2. It detects the `Dockerfile` automatically.
3. Add the environment variables; Railway injects `PORT`.
4. Generate a domain under Settings → Networking.

## Locally, exactly as deployed

```bash
npm --prefix frontend run build
INTERNAL_API_TOKEN=local-token SESSION_SECRET=local-secret \
  HOST=0.0.0.0 PORT=3199 node backend/src/server.js
```

Then open `http://127.0.0.1:3199`. Verify the boundary holds:

```bash
curl -s -c jar.txt http://127.0.0.1:3199/ -o /dev/null

# a browser session starts a run
curl -s -b jar.txt -X POST http://127.0.0.1:3199/api/runs \
  -H 'content-type: application/json' \
  -d '{"goal":"Goa beach trip for 3 days","budget":"25000"}'   # 202

# and cannot mint a card
curl -s -b jar.txt -X POST http://127.0.0.1:3199/api/scoped-cards \
  -H 'content-type: application/json' \
  -d '{"mandateId":"x","merchant":"y","amountCap":100}'        # 401
```

A full run was verified this way end to end: 52 events, terminating in
`final_receipt` with 4 `card_issued` and 4 `purchase_result`, ₹19,200 of
₹25,000, driven entirely through cookie auth.

---

## Before demoing

- [ ] `/health` returns `{"status":"ok"}`
- [ ] The app shell sets a `humsafar_session` cookie
- [ ] A run reaches `final_receipt` on the deployed URL
- [ ] `/api/scoped-cards` returns 401 from the browser
- [ ] The service is warm (free tiers sleep)
