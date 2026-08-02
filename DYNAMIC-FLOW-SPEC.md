# Dynamic multi-page flow — what each person builds

Target flow, as requested:

```
1. /            user enters destination, budget, days
2. /deliberate  agents discover and negotiate, live
3. /choose      top recommendations per category, user picks
4. /approve     the exact plan, one approval
5. /receipt     credentials issued, per-line provenance
```

The agent core half is **done and on `main`**. This file states exactly what is
still missing so the three of us are not guessing at each other's boundaries
with the deadline this close.

---

## Status

| Piece | Owner | State |
|---|---|---|
| Choice step: shortlist, honest ranking, timeout, buy-exactly-what-was-chosen | Jeswin | **Done** — `agents/humsafar/choice.py`, 18 tests |
| `choice_requested` / `choice_made` events | Jeswin | **Done** |
| Run-scoped approval protocol | Jeswin + Preethesh | **Done** |
| Goal/budget already drive a run | Jeswin | **Done** — `run_goal(goal, budget, …)` |
| **`POST /api/runs`** — start a run from the browser | **Preethesh** | **MISSING — blocks everything below** |
| **`POST` / `GET /api/choices`** | **Preethesh** | **MISSING — blocks the choose page** |
| Duffel real inventory | Preethesh | Needs `DUFFEL_ACCESS_TOKEN` |
| Router + five pages | Deepthi | Not started |
| `days` / destination in the goal | Jeswin | See §4 |

**The keystone is `POST /api/runs`.** Today a run only starts from the CLI, so
no amount of frontend work can make the product dynamic until it exists.

---

## 1. Preethesh — `POST /api/runs`

```
POST /api/runs
{ goal: string, budget: number, days?: number, destination?: string }
-> 202 { runId }
```

Spawn the existing CLI as a subprocess and return immediately:

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

## 2. Preethesh — `/api/choices`

Locked in §6.3. `POST` accepts `{ runId, agent, optionId }` → `202`.
`GET /api/choices?runId&agent` → `{ data: { optionId } }` or `204` while the
user is still deciding. My `PolledChoice` already polls exactly that shape.

## 3. Deepthi — the five pages

Add `react-router-dom`; keep the existing theme and every provenance label
exactly as they are.

**`/` — intake.** Destination, budget, days. `POST /api/runs`, then navigate to
`/deliberate?runId=…`. This is the moment that makes the demo feel like a
product rather than a script — a judge can type their own trip.

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

**`/receipt`** — the existing receipt, plus each line's `chosenBy`: *"you chose
this"* vs *"auto-selected on timeout"*.

## 4. Jeswin — remaining

`days` and `destination` are not modelled yet. The goal string carries them
today (*"Plan my Goa trip"*), and the Intent Agent already parses arbitrary
goals. Cheapest correct route: the intake page composes a goal string —
`"Plan my {destination} trip for {days} days"` — and no schema changes. I will
add explicit fields only if Duffel needs structured dates, which it will for
real search.

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
