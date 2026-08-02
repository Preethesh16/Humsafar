# Dynamic multi-page flow — what each person builds

Target flow, as requested:

```
1. /            concierge asks one simple trip question at a time
2. /deliberate  agents discover and negotiate, live
3. /choose      top recommendations per category, user picks
4. /approve     the exact plan, one approval
5. /receipt     credentials issued, per-line provenance
```

The full browser-to-agent flow is implemented. This file now records the
landed contract and the provider boundaries that still require credentials or
external APIs; it is no longer a handoff checklist.

---

## Status

| Piece | Owner | State |
|---|---|---|
| Choice step: shortlist, honest ranking, timeout, execute exactly the approved option | Jeswin + Preethesh | **Done** |
| `choice_requested` / `choice_made` events | Jeswin | **Done** |
| Run-scoped approval protocol | Jeswin + Preethesh | **Done** |
| Goal/budget already drive a run | Jeswin | **Done** — `run_goal(goal, budget, …)` |
| **`POST /api/runs`** — start a run from the browser | **Preethesh** | **Done** — structured trip context, provider discovery, status endpoint, one active run |
| **`POST` / `GET /api/choices`** | **Preethesh** | **Done** — offered-option validation, one-shot settlement, timeout conflicts |
| Duffel real inventory | Preethesh | **Done for test search** — server-side token, conversational/coordinate place resolution and labelled reference FX conversion; order creation remains outside the available account scope |
| Five-page journey | Deepthi + Preethesh | **Done** — native History API, no router dependency |
| Conversational destination, origin, transport, flexible/exact dates, party, trip scope, budget and vibe | Preethesh | **Done** — nine prompts, no IATA/coordinate knowledge required |
| User-controlled specialist roster | Preethesh + Jeswin | **Done** — Journey/Stay/Food/Things-to-do can be disabled; omitted agents receive no allocation, choice or checkout |
| Group-aware accommodation | Preethesh | **Done** — compare hotel rooms, hostels, homestays and whole-home/villa estimates using travellers and rooms |
| Cross-mode journey preference | Preethesh + Jeswin | **Done** — flight/train/bus/road/compare reaches the Journey Agent and mode-aware fallback |
| Keyless destination geocoding | Preethesh | **Done** — policy-compliant cached Nominatim fallback; Google is optional |
| Preference-driven local itinerary | Preethesh | **Done** — choose mapped places or “decide for me”; Geoapify clusters nearby stops, routes each day and finds meal possibilities; Open-Meteo adds exact-date weather |
| Hotel-based daily routing | Preethesh | **Done** — preview starts from the destination centre, then every day is recalculated to start/end at the selected stay |
| Mascot-guided trip quest | Preethesh + Deepthi | **Done** — Milo owns a full-size left rail from intake onward; receipt includes browser-only location, next-station distance, day-sized raised 3D levels, separated station markers, a route that paints as the transport runner moves, and persistent XP |
| Real merchant order creation | External/provider boundary | **Not done** — needs Duffel booking credentials, traveller details and processor integration |
| Food and activity booking providers | External/provider boundary | **Not connected** — mapped suggestions and cost bands are advisory; no card, reservation or payment is created |

Browser runs use backend discovery and trust checks by default. OpenAI narration
turns on when `OPENAI_API_KEY` exists. Prava card minting and live checkout stay
explicit environment opt-ins so merely opening the UI cannot consume a sandbox
mandate.

The local planner is exposed through `POST /api/itineraries/suggestions` and
`POST /api/itineraries/preview`. Provider keys remain on the backend. Place,
route and weather facts preserve their provider source; visit durations, entry
fees and meal costs are separately labelled planning estimates. A venue on a
map is not proof of availability or bookability.

---

## 1. Run API — landed

```
POST /api/runs
{ goal, budget, days, origin, destination, travelMode, dateFlexibility,
  departureDate?, returnDate?, travelers, rooms, includedCategories, stayStyle,
  originCode?, destinationCode?, latitude?, longitude? }
-> 202 { runId, status, trip, modes }

GET /api/runs/:runId
-> { runId, status: "running" | "complete" | "failed", trip, modes, ... }
```

The service spawns the existing CLI as a subprocess and returns immediately:

```js
spawn("python3", ["-m", "humsafar",
  "--goal", goal, "--budget", String(budget),
  "--run-id", runId, "--await-approval", "--await-choice"],
  { cwd: "agents", env: { ...process.env } });
```

Events already stream to the SSE hub, so the dashboard needs no new transport.
Keep one active run per browser session; reject a second with `409`.

**Do not** block the response on the run finishing — it waits for human
approval and can last minutes.

## 2. Choice API — landed

Locked in §6.3. `POST` accepts `{ runId, agent, optionId }` → `202`.
`GET /api/choices?runId&agent` → `{ data: { optionId } }` or `204` while the
user is still deciding. My `PolledChoice` already polls exactly that shape.

## 3. The five pages — landed

The five screens use the browser History API directly. This avoids a router
dependency and its unresolved 2026 advisory chain while preserving back/forward
navigation and direct URLs.

**`/` — concierge intake.** Humsafar asks destination, origin, travel mode,
dates/flexibility, party, which trip parts it should handle, accommodation style,
hard budget and trip vibe one at a time. Journey, Stay, Food and Things-to-do
are independent toggles; at least one must remain enabled. The user never needs
IATA codes or coordinates. A final plain-language brief is shown before
`POST /api/runs`, then the UI navigates to `/deliberate?runId=…`.

**`/deliberate`** — the current dashboard, unchanged. Auto-advance to `/choose`
on the first `choice_requested`.

**`/choose`** — the new page. One card per option from `choice_requested`:
vendor, description, price, and the rating **only when `rating !== null`**.

> Render the heading from `ranking`: *"Top rated"* when `ranking === "rating"`,
> *"Lowest price first"* when `"price"`. Never "top rated" over a price-ranked
> list — Duffel flight offers have no ratings and the payload sends `null`
> precisely so the UI cannot invent one.

Show the `timeoutSeconds` countdown. On expiry the agent picks and the receipt
will say `agent-timeout` — surface that, don't hide it.

**`/approve`** — reuse `ApprovalPanel`, driven by `approval_requested`.

**`/receipt`** — a truthful embedded receipt plus each line's `chosenBy`: *"you
chose this"* vs *"auto-selected on timeout"*. Fixture runs say **planned value**,
never spent. Above it, the trip quest turns the mapped itinerary into a raised
3D course with numbered stations, the next stop, distance from an optional
browser-only location, a transport-aware runner that paints each completed
segment, and session-persistent XP. Only the active day is drawn as a level;
completed and upcoming days stay in a compact day strip so shared return-to-base
coordinates cannot stack into marker blobs or crossing multi-day tracks. Nearby
stations are separated visually while preserving their real visit order. The
course is a game visualization rather than road geometry; opening directions
explicitly hands the real coordinates to Google Maps.

The same receipt contains an opt-in **Set up on phone** handoff for Prava
sandbox authorization. It performs no request on page load. A click asks the
same-origin backend for server-pinned Duffel/₹100 terms, accepts only an HTTPS
URL on `sandbox.collect.prava.space`, and generates the phone QR in the browser.
An unexpired ceremony is reused to prevent double-click waste. The cardholder
enters card, OTP and passkey only on Prava; this step creates authorization and
must never be represented as a purchase or booking.

## 4. Structured trip context — landed

The goal remains available to the Intent Agent, while provider-critical values
also travel as validated structured fields: origin/destination names,
travel-mode preference, exact or flexible dates, travellers and rooms. Airport
codes are optional provider details, never user requirements. The local fallback
uses requested origin, destination, duration and journey mode instead of
returning Bengaluru–Goa flights for every goal. `includedCategories` is an exact
user-owned roster override, so intent inference cannot silently restore an agent
the traveller disabled. Stay fixtures price hotel rooms by room count, hostel
beds by party size and entire homes/villas by whole-property capacity.

“Entire home / villa” means an **Airbnb-style search category**, not live Airbnb
inventory. Without an authorized property provider the cards remain labelled
fixture/search handoff and cannot be described as available or booked.

---

## The honest scheduling problem

Deadline is **Aug 3, 07:30 IST**. Still unstarted and **mandatory**: the demo
video, deployment, and hitting *Publish* on Devfolio. A draft is not a
submission.

The handbook is explicit that *"a narrow product built extremely well can be
stronger than a broad product with many unfinished features."* The current
single-page demo works, is honest, and has real Prava evidence behind it.

So: **build this in the order above, and stop wherever the clock says stop.**
Every piece is additive — if `/choose` is not ready, `AutoChoice` runs the old
path and the demo still works end to end. Nothing here can leave the product
broken, but abandoning the video to finish it would lose the event outright.
