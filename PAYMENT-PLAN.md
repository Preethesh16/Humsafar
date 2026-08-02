# Payment plan — where we stand and what we do

**Written 2026-08-02 21:05 IST. Submission 07:30 IST.** For Preethesh, who
asked for the plan, and for anyone recording the demo.

---

## 1. "One agent should split the money" — that part is already built

It is worth being precise about what the agents do to money, because it is the
thing being judged and it is finished.

Four specialists negotiate over one budget and settle on a split. Each slice is
then backed by its **own Prava mandate**, scoped to a single merchant, capped at
that agent's negotiated amount. Prava `listed` mandates are locked to one
merchant at setup, so this is not a design choice we made for flavour — it is
the only shape the mandate model allows, and it happens to be exactly the
guarantee we want:

| Agent | Merchant | Mandate cap |
|---|---|---|
| flights | (per run) | its negotiated slice |
| stay | (per run) | its negotiated slice |
| food | (per run) | its negotiated slice |
| guide | (per run) | its negotiated slice |

The credential minted against a mandate is capped at the **price of the thing
being bought** — least privilege — and can never exceed the slice. No agent can
reach another agent's money, because a mandate for one merchant is not usable at
another. That is enforced by Visa, not by an `if` statement in our code, and we
have the decline to prove it.

**Nothing about the payment blocker touches any of this.** The splitting works.

---

## 2. What is actually broken

One thing, upstream, at Visa:

```
errorCode:    FETCH_AGENTIC_CREDS_ERROR
errorMessage: Visa 400 — Fetching cryptogram failed
```

Everything either side of it works. The passkey ceremony succeeds — the hosted
page says *"Your identity was verified, but we couldn't complete the payment."*
Visa's own threshold checks succeed: an over-cap charge declines correctly with
a `visaCorrelationId`. **Only the issuance of the single-use credential fails.**

Ruled out, each by direct test:

| Suspected cause | Test | Result |
|---|---|---|
| Amount too large | Rs 50 through Rs 28,800 | fails at every amount |
| Currency | INR **and** USD | fails at both |
| Merchant country | IN, GB, US | fails at all three |
| Which flow | mandate charge **and** standard checkout | fails on both |
| Sandbox quota | quota surfaces as a separate `429 TRIES_EXHAUSTED` | never seen |
| Our code | reproduced on **Prava's own Playground** by another team | not our code |

That last row is the one that settles it. Another team (`_Devastation__`) hit the
identical error string on Prava's hosted Playground, with zero third-party code
involved. Prava staff advised retrying; retrying 4–5 times did not clear it.
**What fixed it was Yash issuing a replacement test card**, after which that team
confirmed it worked.

So: the card is bad. Ours is `CARD-17` (`...2341`).

---

## 3. The one fact that makes this recoverable

**A failed charge does not consume the mandate.** Verified directly — after
repeated failed attempts, all four mandates remain `active` / `available` with
their full balances:

| Mandate | Remaining |
|---|---|
| `mdt_01KZ0Z8N1Q23XGJG6QYZR2JQ0E` | Rs 9,800 |
| `mdt_01KZ0ZAXD9D1KQHSEF0WJ950A7` | Rs 11,200 |
| `mdt_01KZ0ZEKQ0JMQTGJ13SK4AN9G3` | Rs 4,200 |
| `mdt_01KZ0ZJ7GS6WWEAESBM1YV195K` | Rs 3,600 |
| **Total** | **Rs 28,800** |

These are the four from the 15:30 run. They are approved, live, and chargeable.

**This means there is nothing to redo.** No re-approval, no passkey, no phone, no
new hosted session. The moment credential issuance works, we charge these four
and the complete run lands. That is a single command.

A watcher is retrying the smallest mandate every 5 minutes and will stop the
instant the window opens (or on `TRIES_EXHAUSTED`, so we do not burn quota).

---

## 4. The ladder

**Plan A — get a replacement card.** Ask Yash in `#track-visa-prava-support`.
This is exactly what unblocked the other team, and he answered them in minutes.
Costs us one Discord message. *Owner: whoever is on Discord. Do this first.*

**Plan B — charge the four live mandates.** Ready now, blocked only on A or on
Visa recovering by itself:

```bash
python3 -m humsafar --live-cards --live-checkout --simulate-merchant
```

**Plan C — demo on the evidence we already own.** Four real credentials issued
at 15:30 (`Creds_Generated`, totalling Rs 28,800) plus the genuine Visa over-cap
decline. Both are in the Prava dashboard and both are real.

This is stronger than it sounds, because Prava staff have stated on the record
that `Creds_Generated` **is** the intended outcome at this stage:

> **Birdie (Prava):** "this is working exactly as intended for this stage of the
> flow… Prava has successfully created the single-use, merchant-scoped payment
> credential for this session"
>
> **Yash (Prava):** "that was the expected scenario. Congrats 🔥"

Our evidence file claims that milestone and nothing beyond it. So Plan C is not
a climbdown — it is the documented success state, corroborated by the vendor.

**Plan D — simulate the merchant storefront only.** Prava's own guidance:

> "Prava does not provide a dummy merchant checkout. Because the sandbox card
> network runs in test mode and no real money moves, you simply simulate the
> final merchant checkout step yourself for the demo."

Already built (`--simulate-merchant`, `processor.SimulatedMerchant`). The
credential going in is real and the outcome reported back to Prava is real; only
the storefront is simulated, and every string it produces says **SIMULATED**. It
is hard-fixed at `DECLINED` — there is deliberately no way to make it return
`APPROVED`, because a sandbox card cannot be approved by a real processor.

---

## 5. The jugaad we do not do

Faking a "Payment Successful" screen. To be blunt about why, since it is the
obvious shortcut:

- The handbook names a mocked payment presented as a real transaction as a
  **disqualifier**, not a deduction.
- The judges include a former Head of Stripe India and two Visa principals, and
  they are verifying transactions against the dashboard. A screenshot that does
  not reconcile with a `txn_` id is worse than no screenshot.
- Everything else in this submission is scrupulously labelled — every fixture
  says fixture, every simulated line says simulated, the auto-approval path
  announces that no human decided. One fabricated screen would put all of that
  in question, and the disclosure discipline is currently one of our strongest
  differentiators.

There is a real version of the same demo moment, and it is Plan C + D.

---

## 6. What each of us does now

- **Preethesh:** post the replacement-card ask in `#track-visa-prava-support`
  (draft is in the team chat). Nothing in the backend needs changing for this.
- **Jeswin:** watcher is running; deployment and the production auth path are
  the remaining engineering work.
- **Deepthi:** record against Plan C — the real dashboard, the real decline, the
  four real credentials. If Plan A lands before the deadline the same script
  works, with a completed charge instead of a credential-issued one.

---

## 7. Update — the fault is intermittent, and one full transaction completed

**2026-08-02 23:30 IST.**

### The window opens and closes

At **21:59** a mandate charge returned `fetchStatus: SUCCESS` with real
credentials (`txn_01KZ1MYSM8AMTXQJNVH5RDEPXX`). By **23:20** charges were
failing again with the same `FETCH_AGENTIC_CREDS_ERROR`. So Yash's "just retry"
is literally correct — the fault is not persistent, and the job is to *catch* a
window rather than to wait one out.

`catch_window.py` now probes every 4 minutes and, on the first success, launches
the complete four-agent live run automatically.

### Steps 1-5 are done for a real transaction

Using that window, the guide charge was carried all the way through:

| Step | Evidence |
|---|---|
| 1. Agent decides on a product | four-agent negotiation, Dudhsagar Day Trip at ₹3,600 |
| 2. Approval for that purchase | mandate `mdt_01KZ0ZJ7…`, approved by passkey, `listed` scope |
| 3. One-time card issued | `fetchStatus: SUCCESS`, credentials present |
| 4. Card presented at a merchant | simulated storefront, per Prava's own written guidance |
| 5. Merchant declines a test card | **reported and accepted — `visaConfirmation: SUCCESS`** |

```json
{ "transactionId": "txn_01KZ1MYSM8AMTXQJNVH5RDEPXX",
  "status": "failed", "mandateStatus": "active",
  "visaConfirmation": "SUCCESS" }
```

`status: "failed"` is the *correct* terminal state — we reported DECLINED,
because a sandbox test card cannot be approved by a real processor. The
transaction is now settled rather than stranded at `awaiting_result`, which is
what step 5 was missing all evening.

### Two operational facts worth keeping

* **Reporting DECLINED restores the mandate.** The guide mandate went
  `available` → `consumed` (remaining ₹0) → reported → `available` at the full
  ₹3,600. So exercising the flow costs nothing, and all four remain live at
  ₹28,800.
* **A live run must pass `--travel-mode flight --stay-style hotel`.** The
  mandates are `listed`-scoped to the exact merchant names in `GOA_INVENTORY`,
  and that inventory is only returned verbatim under those two conditions. Both
  CLI defaults moved to `"compare"`, so a default run generates merchants like
  "Goa Grand" that no mandate covers and every mint is refused. This broke
  without `destinations.py` changing; it is now covered by a test and documented
  at the guard.
