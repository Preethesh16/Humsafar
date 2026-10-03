# Deploy to Render — 10 minutes

Everything in the repo is ready. This is the part no agent can do for you: it
needs your GitHub login and your Prava keys.

---

## 1. Create the service

1. **render.com** → sign in with **GitHub**
2. **New +** → **Web Service** → pick the **Humsafar** repo
3. Branch: **main** (merge the PR first) — Language/Runtime: **Docker**.
   Render finds the `Dockerfile` on its own; leave build and start commands blank.
4. Instance type **Free**, region **Singapore** (closest to the judges).

## 2. Environment variables

Add these under **Environment**. Copy the secret values out of your local
`.env` — do not retype them, and do not paste them into any chat.

| Variable | Where it comes from |
|---|---|
| `PRAVA_SECRET_KEY` | local `.env` — the account that owns our four mandates |
| `PRAVA_BASE_URL` | local `.env` (`https://sandbox.api.prava.space`) |
| `PRAVA_TEST_CUSTOMER_ID` | local `.env` (`humsafar-demo-user`) |
| `PRAVA_TEST_CUSTOMER_EMAIL` | local `.env` |
| `OPENAI_API_KEY` | local `.env` — without it the agents fall back to templated dialogue |
| `GEOAPIFY_API_KEY` | local `.env` — **without it the whole mapped itinerary 503s** |
| `DUFFEL_ACCESS_TOKEN` | local `.env` |
| `PRAVA_MANDATE_MERCHANTS_JSON` | literally `{}` |
| `HUMSAFAR_MAX_CONCURRENT_RUNS` | `2` |
| `INTERNAL_API_TOKEN` | **generate a fresh one** (see below) |
| `SESSION_SECRET` | **generate a fresh one** (see below) |
| `PUBLIC_BASE_URL` | your Render URL — add it after the first deploy, then redeploy |

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Do not set `PORT`** — Render assigns it, and a fixed value means the health
check never passes.
**Do not set `HUMSAFAR_BACKEND_URL`** — the server derives it from the port it
actually bound. A stale value makes every run publish its events into the void
and the dashboard sits blank through a successful run.
**Leave `HUMSAFAR_LIVE_CARDS` unset.** Agent mandate charges hit the Visa
credential fault; on the deployed demo they would only fill the receipt with
red failures.

## 3. Deploy, then verify

```bash
curl https://YOUR-URL.onrender.com/health          # {"status":"ok"}
curl -I https://YOUR-URL.onrender.com/ | grep -i set-cookie   # humsafar_session
```

Then open the URL, plan a trip, and confirm it reaches the receipt.

## 4. Before demoing

- **Wake it first.** The free tier sleeps after 15 minutes idle and takes ~30s
  to start. Hit the URL a few minutes before, or point
  [cron-job.org](https://cron-job.org) at `/health` every 10 minutes.
- Set `PUBLIC_BASE_URL` to the real URL and redeploy — Prava rejects a
  non-https `callback_url`, so the payment return only works once this is set.
- Re-sync mandates after any restart; the registry is in memory:

```bash
curl -X POST https://YOUR-URL.onrender.com/api/prava/mandates/sync \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"customerId":"humsafar-demo-user"}'
```

## If the build fails

- **Out of memory during `npm run build`** — free tier has 512MB. Retry; it is
  usually transient.
- **Health check failing** — you set `PORT`. Remove it.
- **Blank dashboard through a whole run** — you set `HUMSAFAR_BACKEND_URL`.
  Remove it.
- **Itinerary shows 503** — `GEOAPIFY_API_KEY` is missing.
