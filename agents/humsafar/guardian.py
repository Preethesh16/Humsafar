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


# Codes that mean the amount cap did the blocking, as opposed to the mandate
# being unusable for some other reason.
#
# `THRESHOLD_EXCEEDED` is what the docs name. What the sandbox actually returned
# on 2026-08-02, charging Rs 160 against a Rs 100 mandate, was:
#
#   errorCode:    "DECLINED"
#   errorMessage: "Visa did not return COMPLETED (status DECLINED):
#                  Total amount 160.00 exceeds ..."
#
# So a bare `DECLINED` is ambiguous — it is the generic Visa decline and could
# mean several things. It only counts as cap enforcement when the message says
# the amount was exceeded. Both are accepted because the documented code may
# well be what production returns; neither is assumed.
CAP_DECLINE_CODES = frozenset({"THRESHOLD_EXCEEDED"})
_AMBIGUOUS_DECLINE_CODES = frozenset({"DECLINED", "CHARGE_DECLINED"})
_EXCEEDED_PHRASES = ("exceeds", "exceeded", "over the approved", "above the approved")


def is_cap_decline(error_code: str, message: Optional[str] = None) -> bool:
    """True only when the refusal was demonstrably about the amount cap."""
    if error_code in CAP_DECLINE_CODES:
        return True
    if error_code in _AMBIGUOUS_DECLINE_CODES and message:
        lowered = message.lower()
        return any(phrase in lowered for phrase in _EXCEEDED_PHRASES)
    return False


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
        agent: str,
        attempted_paise: int,
        cap_paise: int,
        error_code: str = "",
        backend_error: Optional[str] = None,
    ) -> str:
        """Wording for a refusal Prava performed, named by its actual cause.

        Only `THRESHOLD_EXCEEDED` — the Visa decline Prava surfaces in a failed
        charge's `errorCode` — means the amount cap did the blocking. Everything
        else is a real refusal for a different reason, and calling it cap
        enforcement would be claiming a safety property we did not demonstrate.

        This distinction is the whole point of the proof shot. A mandate that is
        merely used up refusing a charge proves nothing about overspending.
        """
        detail = f" Prava said: {backend_error}" if backend_error else ""
        attempted = format_inr(attempted_paise)
        cap = format_inr(cap_paise)

        if is_cap_decline(error_code, backend_error):
            return (
                f"Blocked at the card level: {agent} attempted {attempted} against a card capped "
                f"at {cap}. The credential is merchant-locked and amount-capped, so the network "
                f"declined it (THRESHOLD_EXCEEDED).{detail}"
            )

        return (
            f"{agent}'s {attempted} attempt against a {cap} cap was refused, but NOT by the amount "
            f"cap — the reason was {error_code or 'unknown'}. This is not evidence of "
            f"card-level overspend protection and must not be presented as the proof shot.{detail}"
        )
