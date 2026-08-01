"""Pre-mint intent and anomaly check.

brainstorming.md §2 is explicit that this is one internal check, not the
headline — the spend-firewall category is crowded and it is not what makes
Humsafar novel. So it stays small.

The important design decision here is about honesty, and it is worth being
blunt about because it directly affects what we claim on stage:

  * An **off-goal** purchase (wrong category, unknown merchant) is blocked
    here, in software, before a card is minted. That is a genuine second layer
    and we describe it as exactly that.
  * An **over-cap** purchase is deliberately NOT blocked here. It is allowed
    through to Prava so that the block happens at the card network, which is
    the thing the demo's proof shot claims. If this checker short-circuited it,
    we would be showing a software `if` statement while telling judges it was
    card-level enforcement — which is the "mocked payment presented as real"
    failure the organisers call a disqualifier risk.

`reason` strings name the layer that blocked, so the dashboard can never
accidentally overstate what happened.
"""

from dataclasses import dataclass
from typing import Optional

from .models import Option
from .money import format_inr


@dataclass
class GuardianVerdict:
    allowed: bool
    reason: str
    layer: str  # "guardian" for software checks, "none" when it defers


ALLOWED = GuardianVerdict(True, "Intent check passed", "none")


class Guardian:
    def __init__(self, known_merchants: set[str]) -> None:
        self.known_merchants = {m.strip().lower() for m in known_merchants}

    def check(
        self, category: str, option: Option, slice_paise: int, goal: str
    ) -> GuardianVerdict:
        """Run before minting a card for `option`."""
        if option.category != category:
            return GuardianVerdict(
                False,
                f"Blocked by the guardian check (software layer): {category} agent tried to buy a "
                f"{option.category} item — off-goal for {goal!r}.",
                "guardian",
            )

        if option.merchant.strip().lower() not in self.known_merchants:
            return GuardianVerdict(
                False,
                f"Blocked by the guardian check (software layer): {option.merchant} is not a "
                f"merchant discovered for this goal.",
                "guardian",
            )

        # Over-cap is intentionally allowed through to the card network. See the
        # module docstring — this is the honesty-critical line in this file.
        return ALLOWED

    @staticmethod
    def describe_card_block(
        agent: str, attempted_paise: int, cap_paise: int, backend_error: Optional[str]
    ) -> str:
        """Wording for a block that Prava (not this checker) performed."""
        detail = f" Prava said: {backend_error}" if backend_error else ""
        return (
            f"Blocked at the card level: {agent} attempted {format_inr(attempted_paise)} against a "
            f"card capped at {format_inr(cap_paise)}. The credential is merchant-locked and "
            f"amount-capped, so the charge could not be authorised.{detail}"
        )
