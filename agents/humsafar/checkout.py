"""Executing a purchase once a scoped card exists.

Preethesh owns the live merchant integrations (Duffel for flights and stay).
This module is the seam the orchestrator buys through, so the agent core is not
blocked waiting for them and swaps to live checkout by passing a different
implementation.

`SimulatedCheckout` reports `source="fixture"` on every result, and the
orchestrator carries that straight into the `purchase_result` event. Nothing in
this file may ever describe itself as a completed live order — the handbook
treats a mocked payment presented as a real transaction as a disqualifier, and
the fix is to label it accurately, every time, by default.
"""

from typing import Optional, Protocol

from .cards import ScopedCard
from .models import Option


class CheckoutResult(dict):
    @property
    def ok(self) -> bool:
        return self.get("status") == "success"


class Checkout(Protocol):
    def pay(self, option: Option, card: ScopedCard) -> CheckoutResult:
        ...


class LiveCheckout:
    """Uses a real Prava credential, then reconciles the true outcome.

    Prava's charge endpoint mints a single-use credential and leaves the charge
    at `awaiting_result`. That is not a completed transaction — the credential
    is meant to be presented at a merchant checkout, and the *actual* processor
    result reported back via `mandate-report`. Until that happens the charge is
    unreconciled, which is exactly the gap between "created a payment session"
    and "completed an order" that the handbook calls out.

    So this class does the one thing the rest of the system was missing: it
    reports what really happened.

    **It will never report APPROVED without a genuine processor result.** With
    no merchant integration wired, `processor` is None, the honest outcome is
    DECLINED, and the result is labelled `sandbox` — credentials issued, no
    merchant checkout attempted. Reporting APPROVED here would manufacture a
    completed Prava record with nothing behind it, which is the precise failure
    `precaution.md` forbids.
    """

    def __init__(self, reporter, processor=None) -> None:
        self.reporter = reporter
        self.processor = processor
        self.reported: list[tuple[str, str]] = []

    def pay(self, option: Option, card: ScopedCard) -> CheckoutResult:
        if not card.issued:
            return CheckoutResult(
                status="failed",
                source="sandbox",
                detail=f"No usable card: {card.get('error', 'card was not issued')}",
            )

        if self.processor is None:
            # No merchant was attempted, so there is no processor result to
            # report. Reporting DECLINED would state that a checkout happened
            # and failed — which is not true, and it consumes the mandate:
            # measured on 2026-08-02, a reported decline drove `remaining` to
            # 0.00 and the mandate to `consumed` on all four merchants.
            #
            # The charge stays at `awaiting_result`, which is the accurate
            # state: authority was delegated and locked, nothing was bought.
            return CheckoutResult(
                status="success",
                source="sandbox",
                authorized=True,
                detail=(
                    f"Prava sandbox credential issued for {option.vendor}, merchant-locked and "
                    f"capped at this agent's slice. Authority delegated — NO merchant order was "
                    f"placed, and the charge is intentionally left unreconciled."
                ),
            )

        outcome, detail = self.processor.charge(option, card)
        settled = self.reporter.report(
            mandate_id=card.get("mandateId", ""),
            transaction_id=card.get("transactionId", ""),
            outcome=outcome,
            amount=card.get("amountCap"),
        )
        self.reported.append((card.get("transactionId", ""), outcome))

        return CheckoutResult(
            status="success" if outcome == "APPROVED" else "failed",
            source="sandbox",
            authorized=True,
            detail=f"{detail}{'' if settled else ' (reconciliation call failed)'}",
        )


class SimulatedCheckout:
    """Offline checkout. Always labelled as simulated."""

    def __init__(self, fail_categories: tuple[str, ...] = ()) -> None:
        # Used by the demo's partial-failure beat: a booking that falls over
        # after the card was issued, so the orchestrator has to recover.
        self.fail_categories = set(fail_categories)
        self.failed_once: set[str] = set()

    def pay(self, option: Option, card: ScopedCard) -> CheckoutResult:
        if not card.issued:
            return CheckoutResult(
                status="failed",
                source="fixture",
                detail=f"No usable card: {card.get('error', 'card was not issued')}",
            )

        if option.category in self.fail_categories and option.category not in self.failed_once:
            self.failed_once.add(option.category)
            return CheckoutResult(
                status="failed",
                source="fixture",
                detail=(
                    f"{option.vendor} released the hold before checkout completed "
                    f"(simulated failure — no live order was placed)"
                ),
            )

        return CheckoutResult(
            status="success",
            source="fixture",
            detail=(
                f"Simulated booking with {option.vendor}: {option.description} "
                f"(fixture data — not a live merchant order)"
            ),
        )
