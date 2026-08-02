# Prava sandbox — verified evidence record

Captured 2026-08-02 against `https://sandbox.api.prava.space`, merchant account
`humsafar1`, customer `humsafar-demo-user`.

**Purpose.** `submission.md` writes every payment claim twice — `[A] charge
landed` and `[B] no charge`. This file exists so whoever fills those in uses the
exact observed facts rather than a summary, and so nothing is claimed that a
judge could not verify in the Prava dashboard.

Everything below was observed in an API response or the dashboard. Nothing is
inferred. No credential value appears here.

> **README correction needed.** The status table currently reads *"Prava
> customer, mandates, credentials — Not yet created. Zero mandates. No session,
> credential or transaction has been created."* That was true when written and
> is now wrong in our favour. See "What to change" at the end.

---

## 1. What is proven

### 1.1 A human approved a mandate with a passkey

Five mandates were created through Prava's hosted page: card entry, issuer OTP,
and a Visa payment-passkey ceremony ending in **"Mandate created"**.

| Merchant | Cap | Scope |
|---|---|---|
| Air India Express | ₹9,800 | `listed` |
| Anjuna Beach Resort | ₹11,200 | `listed` |
| Gunpowder Assagao | ₹4,200 | `listed` |
| Dudhsagar Day Trip | ₹3,600 | `listed` |
| Duffel | ₹100 | `listed` |

Verified with `npm run prava:verify` →
`{"environment":"sandbox","authentication":"ok","customer":"found","mandateCount":N}`
and by `GET /v1/mandates`, which returned `status: active`, `state: available`,
`merchantScope: listed`.

The passkey ceremony **failed on Linux desktop** ("Verification Unavailable")
and succeeded on a phone. Linux browsers generally expose no platform
authenticator. This matches the reports from other teams in Prava's Discord.

### 1.2 A complete four-agent run issued four real credentials ← strongest artefact

Prava dashboard, **2 Aug 15:30 IST**, four rows seconds apart, each
`Creds_Generated`:

| Order ID | Amount | Agent |
|---|---|---|
| `ord_01KZ0YNW1FCJNS4E…` | ₹9,800 | flights |
| `ord_01KZ0YNXA9R8D9A4…` | ₹11,200 | stay |
| `ord_01KZ0YNY1HEJ0BVF…` | ₹4,200 | food |
| `ord_01KZ0YNYQY8ACJYF…` | ₹3,600 | guide |

Total **₹28,800** — exactly the split the agents negotiated on screen, each
credential merchant-locked to that agent's chosen vendor and capped at its own
slice. This is the whole product claim, in Prava's own records, from a single
run.

**Screenshot this block for the submission.** A judge can line these four
amounts up against the deliberation feed and the receipt.

Note for anyone reading the terminal output of that run: it printed
`FAIL Rs 0.00` for all four. That was a defect in our own `LiveCheckout`, which
reported `DECLINED` after the mints had already succeeded — mislabelling the
result and consuming the mandates. Fixed in `9cc1bc2`. **The dashboard is
authoritative; that run worked.**

### 1.3 A real merchant-scoped credential was issued

`POST /v1/mandates/{id}/charge` for ₹100 returned:

```
status:       awaiting_result
fetchStatus:  SUCCESS
transactionId: txn_01KZ0XD9RDRXGDP2JHFV47BTKK
credentials:  token, dynamicCvv, expiryMonth, expiryYear   (values never logged)
```

Repeated through the **full product path** — agent → backend resolver → Prava —
returning `transactionId: txn_01KZ0Z3FYYS1C0ZES9HEHSB6RR`, `status: issued`,
`source: sandbox`.

### 1.4 The card network refused an overspend ← the safety claim

Charging **₹160 against a ₹100 mandate**:

```
status:       failed
fetchStatus:  FAILURE
errorCode:    DECLINED
errorMessage: "Visa did not return COMPLETED (status DECLINED):
               Total amount 160.00 exceeds ..."
```

This is a genuine Visa decline, not a software check. It is the demo's core
proof: an agent physically cannot spend past its slice.

**Two findings from this, both now encoded in the agent core:**

1. **The code is `DECLINED`, not the documented `THRESHOLD_EXCEEDED`.** A
   classifier accepting only the documented code would have called a real cap
   decline "not evidence of overspend protection". `guardian.is_cap_decline()`
   accepts either, and still refuses to treat a bare `DECLINED` with no amount
   reason as cap enforcement.
2. **A refused charge does not consume the mandate** — `remaining` stayed
   `100.00`, `state` stayed `available`, `lastCharge` recorded `declined`. This
   is why the orchestrator attempts the over-cap charge *before* the real
   purchase: both fit on one `max_charges: 1` mandate.

---

## 2. What is NOT proven — do not claim these

- **No merchant order was placed.** Credentials were issued and merchant-locked;
  no goods or services were bought. The charge sits at `awaiting_result` and is
  deliberately left unreconciled, because reporting an outcome that never
  happened would fabricate a completed record.
- **No `APPROVED` was ever reported.** `LiveCheckout` reports only a genuine
  processor result; with no merchant wired it reports nothing at all.
- **Inventory is fixture data.** No `DUFFEL_ACCESS_TOKEN`, so flights and stays
  come from disclosed fixtures, not live availability.
- **Senso is not integrated.** `TrustService` is a local `rating/5` heuristic
  that labels itself a fixture. The Senso track must not be claimed.

The defensible headline is therefore:

> Four specialist agents negotiated one ₹30,000 budget into a ₹28,800 split, and
> each was issued a real merchant-scoped, amount-capped Prava sandbox credential
> for its own slice — all four visible in the Prava dashboard at 15:30 on 2 Aug.
> The card network refused a charge that exceeded an agent's slice. No merchant
> order was placed.

Prava staff (Sushant, Discord, 29 Jul) confirmed this class of flow is valid:
*"if a card is able to go as far in the flow and get an error due to test card,
that means it'll work fine on prod too."*

---

## 3. Open blocker — Prava-side, reported

From **15:49 IST** every charge fails with:

```
errorCode: FETCH_AGENTIC_CREDS_ERROR
message:   "Visa 400 —  Fetching cryptogram failed"
```

Including an identical ₹100 retry that had succeeded at ~15:20. All four
mandates remain `active`/`available` with full `remaining`, and a mandate
authorization at 15:45 succeeded — so this is not a quota and not the mandates.

Two other teams reported the identical error on 30 Jul in Prava's Discord
(toby, and Suman001 with a written bug report). Treating it as a known
intermittent sandbox fault; raised in the support channel.

**Consequence:** no *further* live runs are possible until this clears. It does
not affect the evidence above — the complete four-agent run at 15:30 and the cap
decline both landed before the fault began, and are visible in the dashboard.

---

## 4. Operational notes for whoever runs the live demo

- **A successful full-slice charge exhausts its mandate.** `approvedAmount` is a
  budget that `remaining` decrements, not a per-charge ceiling. One live run per
  set of mandates. Rehearse on stub cards.
- **Recurring mandates allow one charge per cycle.** A `monthly` mandate with
  `max_charges: 12` refuses a second same-day charge with *"Purchase already
  made in the current payment cycle"* — which is **not** cap enforcement and
  must never be shown as the proof shot.
- **Cancel stale mandates before a run.** `resolveMandate` fails closed on
  duplicates. `POST /v1/mandates/{id}/cancel` works.
- **Sessions expire in 15 minutes** and the passkey needs a phone. Have the
  device ready before creating the session.
- Sandbox issuer OTP is `456789`.

---

## 5. What to change in the README

The status table should become:

| Component | Status |
|---|---|
| Prava sandbox authentication | **Verified.** |
| Prava customer and mandates | **Created.** Five mandates approved by passkey, `active`/`available`. |
| Scoped credential issuance | **Verified.** Real credentials issued; transaction ids above. |
| Network cap enforcement | **Verified.** Visa declined ₹160 against a ₹100 mandate. |
| Merchant order | **Not performed.** No goods purchased; charge left unreconciled. |
| Duffel flights/stays | **Not configured.** Disclosed fixtures. |

And the line *"no real payment has been made yet"* should become: *"real Prava
sandbox credentials were issued and a real overspend was refused by the card
network; no merchant order was placed."*
