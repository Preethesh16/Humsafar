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

from typing import Protocol

from .cards import ScopedCard
from .models import Option


class CheckoutResult(dict):
    @property
    def ok(self) -> bool:
        return self.get("status") == "success"


class Checkout(Protocol):
    def pay(self, option: Option, card: ScopedCard) -> CheckoutResult:
        ...


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
