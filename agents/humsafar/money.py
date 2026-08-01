"""Money arithmetic for Humsafar.

Every rupee amount inside the agent core is stored as an integer number of
paise. Budget allocation is the one place in this project where a rounding
error is a real bug: floats would let four allocations that "look right" sum
to a paisa over the user's ceiling, and `scopedCardService.mintScopedCard`
rejects any amountCap with more than two decimal places. Integers make both
problems impossible by construction.

Rupees appear only at the boundary (event payloads and the scoped-card API).
"""

from decimal import Decimal, InvalidOperation
from typing import Sequence

PAISE_PER_RUPEE = 100


def to_paise(rupees) -> int:
    """Convert a rupee amount to integer paise.

    Uses Decimal so that "199.99" does not become 19998 paise. Rejects amounts
    finer than a paisa instead of silently truncating them.
    """
    try:
        amount = Decimal(str(rupees))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{rupees!r} is not a valid rupee amount") from exc

    if not amount.is_finite():
        raise ValueError(f"{rupees!r} is not a finite rupee amount")

    paise = amount * PAISE_PER_RUPEE
    if paise != paise.to_integral_value():
        raise ValueError(f"{rupees!r} is finer than one paisa")

    return int(paise)


def to_rupees(paise: int) -> float:
    """Convert integer paise to a rupee float with exactly two decimals.

    Safe to hand straight to json.dumps: the value always serialises with at
    most two decimal places, which is what the scoped-card validator requires.
    """
    if not isinstance(paise, int) or isinstance(paise, bool):
        raise TypeError(f"paise must be an int, got {type(paise).__name__}")
    return float(Decimal(paise) / PAISE_PER_RUPEE)


def format_inr(paise: int) -> str:
    """Human-readable amount for agent dialogue and logs."""
    return f"Rs {to_rupees(paise):,.2f}"


def split_proportionally(total_paise: int, weights: Sequence[int]) -> list[int]:
    """Split `total_paise` across `weights`, losing nothing to rounding.

    Uses the largest-remainder method: every share gets the floor of its exact
    proportion, then the leftover paise go one at a time to the shares with the
    biggest truncated remainder. Guarantees `sum(result) == total_paise`, which
    is what keeps a distributed remainder from pushing the plan over budget.

    Ties are broken by the larger weight, then by position, so the result is
    deterministic — a negotiation that replays identically is far easier to
    debug mid-demo than one that drifts.
    """
    if total_paise < 0:
        raise ValueError("total_paise must not be negative")
    if any(w < 0 for w in weights):
        raise ValueError("weights must not be negative")

    if not weights:
        if total_paise:
            raise ValueError("cannot split a non-zero total across zero shares")
        return []

    total_weight = sum(weights)
    if total_weight == 0:
        # No agent asked for anything: spread evenly rather than crash, so an
        # empty negotiation still produces a valid (zero-ish) plan.
        return split_proportionally(total_paise, [1] * len(weights))

    shares = []
    remainders = []
    for index, weight in enumerate(weights):
        exact = total_paise * weight
        shares.append(exact // total_weight)
        remainders.append((exact % total_weight, weight, -index))

    leftover = total_paise - sum(shares)
    for _, _, negative_index in sorted(remainders, reverse=True)[:leftover]:
        shares[-negative_index] += 1

    return shares
