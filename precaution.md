# Humsafar — Sandbox and Demo Precautions

> Operational runbook for the Prava hackathon flow. Read this before touching
> sandbox credentials, creating a session, running a mandate charge, recording
> the demo, or describing a payment result. Last reviewed: 2026-08-01.

## Source hierarchy

When sources disagree, use this order:

1. Current Prava API documentation and the current dashboard response.
2. A written answer from a named Prava team member about our exact flow.
3. The Builder Handbook and live Devfolio submission state.
4. This runbook and the project Markdown files.
5. Other participants' Discord messages.

The supplied Discord export contains duplicated sections, collapsed threads
whose answers are missing, questions with no answer, and participant guesses.
Only explicit answers from Prava staff are treated as evidence here. Never turn
an unanswered Discord question into an implementation assumption.

## Non-negotiable rules

- Keep the dual-key roles separate: `sk_test_...` is
  `PRAVA_SECRET_KEY` for server-to-server Bearer authentication only;
  `pk_test_...` is the publishable/browser SDK key. The current REST backend
  needs the secret key; do not substitute the publishable key in its place.
- Use Prava **SDK/API in sandbox**. Prava MCP and CLI are production-only and
  are not the Humsafar integration path.
- Never commit, paste, print, record, or screenshot an API key, the team test
  card, an OTP, a virtual card token, CVV, expiry, or encrypted credential.
- Never log a complete session, payment-result, or mandate-charge response.
  Log only sanitized status, error code, response ID, mandate ID and transaction
  ID where necessary. Treat token, CVV and expiry as transient secrets.
- Never describe fixture behavior as Prava enforcement. Never describe a
  sandbox result as production or real-money activity.
- Never report `APPROVED` unless an actual merchant/test-processor checkout
  returned an approved result. Reporting is reconciliation, not checkout.
- Stop the demo if an over-cap request is authorized. Do not reinterpret or
  hide a result that contradicts the safety claim.

## Confirmed issues from the support transcript

| Issue builders encountered | Precaution for Humsafar |
|---|---|
| Sandbox cards do not settle on real merchant production checkouts. Prava staff said reaching checkout and receiving the expected test-card decline is a valid sandbox exercise. | Show it as a **genuine Prava sandbox checkout attempt that was declined because it is a sandbox credential**. Do not call it a completed booking or order. Report `DECLINED`, not `APPROVED`, if that is the actual result. |
| No reliable public Prava sandbox merchant/store was identified. Staff also warned that creating a dummy Stripe store does not guarantee it will consume Prava sandbox cards. | Validate one merchant path early. Keep the merchant attempt separate from fixture purchases. Do not promise a successful merchant order unless one is observed end to end. |
| The SDK/API integration does not include Prava's browser harness. The harness is associated with the production MCP/CLI path. | Use manual checkout or our own carefully scoped browser automation. Do not claim Prava bypasses bot checks for our REST integration. Keep a manual fallback and stop on CAPTCHA or merchant terms that prohibit automation. |
| Builders got stuck at the passkey step. Sandbox uses a real WebAuthn prompt and sessions expire. | Use a supported current browser on a device with working WebAuthn. Have the hosted page open and the cardholder ready before creating the session. Complete issuer verification first on a new device, then register/verify the passkey. Recreate expired sessions instead of retrying stale URLs. |
| Prava's hosted payment/passkey surface did not work reliably in this Linux browser, while the same short-lived URL completed on a passkey-capable Android phone. | Create the hosted session from the backend, then open/share only that short-lived `iframeUrl` to the cardholder's phone. Complete card entry, test OTP, and Android passkey on the phone. Never automate or relay OTP, biometric, PIN, or screen-lock data. The passkey belongs to that phone/account. |
| A participant reported that the SDK-template session body was outdated. Another reported a broken guide link. | Treat current API reference pages and observed responses as authoritative. Compare every request field with the current Create Session reference; do not copy the template blindly. Capture sanitized `X-Response-ID` values for support. |
| A participant did not copy a newly created API key and was unsure how to recover it. | Copy a new key once into a local secret manager and the gitignored `.env`; never into chat or Markdown. If lost, rotate/create a replacement rather than trying to recover or guess it. Run `npm run prava:verify` before any session creation. |
| Session allowance/rate limits were unclear, and `TRIES_EXHAUSTED` was reported as a possible failure. | Do not use retry loops against session or charge endpoints. Use deliberate single calls, bounded retries only for transient transport errors, and preserve the response ID. The assigned team card also has a 30-transaction daily ceiling, so use fixtures for ordinary development. |
| Production card geography is restricted, while sandbox is available without a supported-region real card. | Stay in sandbox. Do not let production onboarding, regional card support, or real money enter the critical path. |
| No confirmed Python SDK answer appeared in the exported conversation. | Continue using the existing tested REST client. Do not block on a Python SDK or claim one exists/does not exist without current documentation. |

## Track and participation precautions

- A Prava team member explicitly said a sandbox flow is sufficient for Visa
  track eligibility. That removes any need for production, but it does not
  remove the need to demonstrate permissions, controls and the exact observed
  transaction outcome.
- Confirm every listed teammate is individually accepted, has joined the team,
  and has completed RSVP/check-in. Other builders discovered too late that an
  accepted team does not automatically make an unaccepted individual eligible.
- Only the team administrator should publish the final Devfolio project. Verify
  the status says **Submitted**, not Draft.
- Keep commit history and the disclosure section ready to show that judged code
  was produced inside the official build window. Planning material created
  earlier must be disclosed separately from implementation.
- Check each participant's OpenAI billing/credit state individually. Discord
  reports about rollout timing are not proof that a particular account received
  credit; missing-credit escalation belongs in the organizer's designated
  thread.
- Do not switch Humsafar to MCP merely because standard code-mode clients can
  call it. Staff confirmed MCP/CLI are production-oriented and the typed output
  schemas were still roadmap work; SDK/API sandbox remains our chosen path.

## Before the first sandbox call

- [ ] Confirm the current branch is the correct personal branch and the working
  tree contains no unrelated changes.
- [ ] Confirm `.env` is ignored with `git check-ignore .env`.
- [ ] Put only the sandbox key and non-secret configuration in `.env`; do not
  store the team card in repository files.
- [ ] Run `npm run prava:verify`. It must return `environment: "sandbox"` and
  `authentication: "ok"` before any session is created.
- [ ] Confirm `PRAVA_BASE_URL` is exactly the sandbox API origin and the key is
  a sandbox key.
- [ ] Confirm the latest card details privately from the official team email or
  dashboard. If official messages conflict, ask Prava support; do not guess.
- [ ] Restart stale backend/frontend processes after pulling changes.
- [ ] Prepare a redacted evidence folder outside the public repo. Screenshots
  must be reviewed before sharing.

## Mandate ceremony precautions

- [ ] Create the session only when the cardholder and supported browser are
  ready; the hosted session expires after 15 minutes.
- [ ] Keep `HUMSAFAR_ENABLE_PRAVA_PHONE_APPROVAL=false` except during an
  attended sandbox ceremony. The receipt button is an operator opt-in, not a
  background startup action.
- [ ] The browser may submit only its run ID. Resolve the amount from that
  run's authoritative final receipt and pin customer, merchant and product on
  the server; never accept a browser-supplied amount. Reject any returned URL
  outside the exact HTTPS `sandbox.collect.prava.space` origin.
- [ ] Generate the QR in memory from the short-lived hosted URL. Do not persist,
  log, commit, analytics-track or include that URL in a screenshot intended for
  publication.
- [ ] Reuse an unexpired hosted session after a double-click. Do not turn a UI
  retry into a session-creation loop.
- [ ] Poll payment status only from the backend and return a sanitized stage.
  Never send the session ID, token, CVV, expiry or raw payment result to React.
  `awaiting_result` means credentials are ready for merchant checkout; it does
  not mean the payment completed.
- [ ] For this workstation, treat Linux as the operator/backend surface and a
  passkey-capable phone as the Prava hosted-approval surface. Do not burn
  sessions repeatedly trying to force WebAuthn through the Linux browser.
- [ ] Use the Prava-hosted secure page. Never collect the team card in our own
  React UI, CLI, logs, screenshots, or test fixtures.
- [ ] Verify merchant name, merchant URL, currency, item description, approved
  amount and one-time frequency before the human approves.
- [ ] Treat passkey approval as permission for those exact terms, not blanket
  approval for the full trip.
- [ ] After approval, list/sync mandates and verify `status=active`,
  `state=available`, the expected merchant and the approved amount.
- [ ] Remember that backend sync updates the backend's in-memory registry only.
  The separate Python agent still needs a safe merchant-to-mandate resolver or
  explicitly supplied local mapping before `--live-cards` can work.

## Over-cap proof precautions

- [ ] Use a mandate created for the exact selected merchant. A wrong-merchant
  failure proves merchant scoping, not amount-cap enforcement.
- [ ] Attempt the cap proof before a successful one-time charge only if Prava
  confirms a failed attempt leaves the mandate usable. Otherwise use a separate
  proof mandate and checkout mandate.
- [ ] Use a fresh idempotency reference. Never reuse the valid-charge reference
  for the proof attempt.
- [ ] Read the structured failed-charge fields. Only the observed
  `THRESHOLD_EXCEEDED` decline supports the card-network cap claim.
- [ ] Keep `MANDATE_NOT_ACTIVE`, `MANDATE_MERCHANT_NOT_ALLOWED`,
  `TRIES_EXHAUSTED`, authentication errors and transport failures distinct.
- [ ] Do not log the raw response. Preserve only sanitized fields and the
  response ID.

## Checkout and reporting precautions

- [ ] Credential issuance is not a purchase. A payment session is not an order.
- [ ] Send ephemeral credentials only to the selected checkout boundary. Never
  store them, add them to an event, include them in a receipt, or serialize them
  in an exception.
- [ ] Record the merchant/processor's actual outcome before reporting anything
  to Prava.
- [ ] If the real merchant rejects the sandbox credential as expected, report
  `DECLINED` and display "Prava sandbox checkout attempt — expected test-card
  decline". This is evidence of the sandbox path, not a completed booking.
- [ ] If no merchant attempt occurs, do not call the report endpoint and state
  "credential issued; checkout not attempted".
- [ ] If Prava gives a written hackathon-specific simulator procedure, preserve
  that message and label its result as simulated/sandbox—not a merchant order.
- [ ] A one-time mandate reported `APPROVED` becomes consumed. Do not schedule
  another charge against it.
- [ ] Before a deliberate charge, test the local report adapter with Prava's
  exact wire names (`txn_status`, `txn_type`, `amount_paid`). A legacy alias
  mismatch once caused the backend to overwrite those fields with `undefined`;
  regression tests now lock the documented contract.
- [ ] `FETCH_AGENTIC_CREDS_ERROR` happens before credentials exist. Record it as
  a credential-generation failure, leave checkout/report untouched, and do not
  hide it with an automatic retry—sandbox attempts are scarce.
- [ ] The assigned sandbox card ending `2341` has repeatedly completed identity
  and mandate setup but failed credential generation across ₹50–₹28,800, INR/USD
  and both mandate-charge/full-checkout paths. Do not diagnose it as an amount
  problem or spend more attempts on client-side permutations; request a
  replacement test card from Prava with the sanitized response ID.
- [ ] The receipt phone QR is deliberately mandate setup. It may say “Trip budget
  authorized” only after an exact active/available mandate appears. It must never
  say paid, charged or booked until a real merchant/test processor outcome exists.

## Approval and multi-process precautions

- [ ] Approval must be correlated to a `runId`/`approvalRequestId`, the exact
  allocation version or digest, and an expiry time.
- [ ] Approval is one-shot. Consume and clear it before minting credentials so
  a stale approval cannot authorize a later run.
- [ ] Decline or timeout must mint nothing.
- [ ] Protect state-changing approval and payment routes with
  `INTERNAL_API_TOKEN`; never place the Prava key in request bodies.
- [ ] Do not assume environment variables loaded by `npm run start:sandbox`
  are visible to the separately launched Python process.

## Honest UI and demo language

Use these exact distinctions:

| Evidence | Allowed label | Never say |
|---|---|---|
| Local fixture checkout | `fixture / simulated; no payment attempted` | live, sandbox transaction, order placed |
| Prava session or mandate approved | `Prava sandbox authorization` | purchase complete |
| Prava credential issued | `Prava sandbox credential issued` | merchant charged, booking complete |
| Prava refuses credential issuance before checkout | `Prava sandbox credential request refused — no checkout` | merchant decline, checkout attempted, money moved |
| Real merchant rejects sandbox credential | `Prava sandbox checkout attempt — declined as expected` | successful order, money moved |
| Merchant/test processor actually approves and Prava is truthfully reconciled | `completed sandbox checkout` plus the exact merchant/test qualification | production, real-money order |

If only one category exercises Prava and the other three use fixtures, call the
run **mixed-mode** and label every purchase independently. Do not let the final
receipt inherit a success/source label from another line.

## Demo-day checklist

- [ ] Treat the earlier published deadline as the cutoff unless the live
  Devfolio countdown clearly confirms otherwise; publish, do not leave a draft.
- [ ] Verify every teammate is accepted, added to the team and RSVP/check-in is
  complete. Only the team admin submits.
- [ ] Restart all long-running processes after the final pull.
- [ ] Run Node, Python, frontend render and production-build tests.
- [ ] Run a secret scan over tracked files and the exact commits being pushed.
- [ ] Rehearse once with fixtures, then perform the minimum number of deliberate
  sandbox calls needed for evidence.
- [ ] Blur/redact card data, tokens, CVVs, expiry, session tokens, API keys,
  personal email and unnecessary IDs from screenshots/video.
- [ ] Keep sanitized response IDs and timestamps privately for support/judges.
- [ ] Describe what worked, what failed and what was simulated without changing
  terminology between the UI, video, README and Devfolio write-up.

## Free public-data services

- Public/free does not mean unlimited or production-backed. Nominatim calls
  must remain directly user-triggered, identified, cached, serialized and below
  one request per second. Never build browser autocomplete against the public
  endpoint. Keep `HUMSAFAR_NOMINATIM_URL` switchable and self-host before scale.
- Open-Meteo's no-key API is non-commercial, attributed and rate-limited, with
  no uptime guarantee. Do not describe it as a free production SLA.
- OpenStreetMap/Overpass, GTFS and routing data can inform a plan; they do not
  prove ticket/room/table availability. A provider handoff is not a booking.
- Never scrape IRCTC or automate around a provider's access controls. Rail
  ticketing stays on an official or authorized surface until a contract exists.

## Open questions requiring written Prava confirmation

1. Does a failed over-cap mandate charge consume any one-time use/attempt limit,
   or can the same mandate safely mint a valid credential afterward?
2. For hackathon judging, is an expected real-merchant decline using a sandbox
   credential sufficient transaction evidence for Prava Overall and Visa, or is
   a Prava-provided simulator/approved test merchant expected?
3. If no merchant processor accepts sandbox credentials, what exact outcome
   should be sent to the mandate report endpoint? The public REST guide says to
   report only after checkout.
4. Is there a currently supported sandbox merchant or sanctioned dummy
   processor that returns a genuine approval/decline outcome?

Until those are answered, use separate proof and checkout mandates, never
fabricate `APPROVED`, and present the observed sandbox outcome exactly as it is.

## References

- `brainstorming.md` — product, rules and demo context.
- `INTERFACES.md` — locked cross-team contracts.
- `progress-preethesh.md` — current integration decisions and observed gaps.
- Prava docs: `https://docs.prava.space/api-reference/testing`
- Prava REST walkthrough: `https://docs.prava.space/guides/rest-checkout-walkthrough`
- Prava mandate charge: `https://docs.prava.space/api-reference/mandate-charge`
- Prava mandate report: `https://docs.prava.space/api-reference/mandate-report`
