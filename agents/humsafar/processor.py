"""Step 4 of Prava's end-to-end sandbox flow — presenting the card at a merchant.

Prava spelled the required flow out on 2026-08-02:

    1. the agent discovers or decides on a product
    2. an approval is created for that specific purchase
    3. a one-time card is issued after approval
    4. **the card is presented at the end merchant's checkout**
    5. the merchant declines it, because it is a sandbox test card

Step 5 is the part people get wrong: **the decline is the expected result.** A
successful merchant order is not required and, with a sandbox card, is not
possible. What has to be demonstrated is that a real merchant checkout was
reached with a real Prava credential and gave a real answer.

Steps 1-3 already existed. Step 4 never happened: `LiveCheckout` had a
`processor` seam that was always `None`, so the run honestly said "no merchant
checkout was attempted" — correct at the time, and now the only gap.

A processor here returns `(outcome, detail)` where outcome is exactly
`"APPROVED"` or `"DECLINED"`. Nothing in this module may invent either: the
whole value of step 4 is that the answer came from somewhere else.
"""

from dataclasses import dataclass
from typing import Optional, Protocol

from .cards import ScopedCard
from .models import Option


class Processor(Protocol):
    def charge(self, option: Option, card: ScopedCard) -> tuple[str, str]:
        ...


@dataclass
class MerchantAttempt:
    """What a human observed when they presented the card at a checkout.

    Recorded rather than inferred. `merchant` and `observed` are required
    because a claim about a checkout is only worth anything if it names where
    it happened and what the page said.
    """

    merchant: str
    outcome: str  # "APPROVED" | "DECLINED"
    observed: str  # verbatim message from the merchant's checkout
    reference: str = ""  # order/attempt id if the merchant showed one

    def __post_init__(self) -> None:
        if self.outcome not in ("APPROVED", "DECLINED"):
            raise ValueError(f"outcome must be APPROVED or DECLINED, got {self.outcome!r}")
        if not self.merchant.strip():
            raise ValueError("merchant is required — an unattributed checkout proves nothing")
        if not self.observed.strip():
            raise ValueError("observed is required — record what the checkout actually said")


class ManualProcessor:
    """Records a checkout a person performed by hand.

    Prava's own guidance (via `precaution.md`) is that manual checkout is a
    valid route and that browser automation must stop at a CAPTCHA or terms
    that forbid it. So the supported path is deliberately the human one: mint
    the card, present it at a real merchant, read the page, record it here.

    This class does not talk to a merchant. It carries an observation that a
    human already made, so the outcome reported to Prava is something that
    genuinely happened rather than something the code assumed.
    """

    def __init__(self, attempts: Optional[dict[str, MerchantAttempt]] = None) -> None:
        # Keyed by category, so each agent's checkout is recorded separately.
        self.attempts = dict(attempts or {})

    def record(self, category: str, attempt: MerchantAttempt) -> None:
        self.attempts[category] = attempt

    def charge(self, option: Option, card: ScopedCard) -> tuple[str, str]:
        attempt = self.attempts.get(option.category)
        if attempt is None:
            # No observation for this category. Refusing here is the point: a
            # missing record must never become an assumed outcome.
            raise LookupError(
                f"No merchant attempt recorded for {option.category!r}. "
                f"Present the card at a checkout and record what it said."
            )

        detail = (
            f"Presented the Prava sandbox credential at {attempt.merchant} and the checkout "
            f"returned {attempt.outcome}: {attempt.observed}"
            + (f" (ref {attempt.reference})" if attempt.reference else "")
        )
        return attempt.outcome, detail


class DeclinedByTestCard(ManualProcessor):
    """The expected sandbox result, per Prava's step 5.

    Convenience for the common case: every category was presented at the same
    merchant and refused because the card is a test card. Still requires the
    merchant name and the observed message — the decline has to be real and
    attributable, not assumed because sandbox cards usually fail.
    """

    def __init__(self, merchant: str, observed: str, categories=("flights", "stay", "food", "guide")):
        super().__init__(
            {
                category: MerchantAttempt(merchant=merchant, outcome="DECLINED", observed=observed)
                for category in categories
            }
        )
