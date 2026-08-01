"""Core data shapes for the agent layer.

Kept deliberately plain (dataclasses, no framework types) so the negotiation
engine stays unit-testable without a network, an LLM, or the backend running.
"""

from dataclasses import dataclass, field
from typing import Literal, Optional

from .money import format_inr

# The four categories the locked event schema in INTERFACES.md understands.
# The engine itself works with any set of specialists; this tuple is only used
# where the wire format demands these exact keys.
WIRE_CATEGORIES: tuple[str, ...] = ("flights", "stay", "food", "guide")

ExitReason = Literal["converged", "forced_compromise", "budget_below_floor"]


@dataclass(frozen=True)
class Option:
    """One purchasable option a specialist discovered in its category."""

    category: str
    vendor: str
    description: str
    price_paise: int
    rating: float
    source: Literal["live", "fixture"]
    merchant: str

    def __str__(self) -> str:
        return f"{self.vendor} — {self.description} ({format_inr(self.price_paise)}, {self.rating}/5)"


@dataclass
class Specialist:
    """A buyer agent negotiating for one category.

    `minimum_paise` and `ideal_paise` are both derived from options the agent
    actually found — never invented — which is what lets the mediator check
    that nobody is inflating their need.
    """

    category: str
    options: list[Option]
    minimum_paise: int
    ideal_paise: int
    ask_paise: int
    opening_ask_paise: int
    display_name: str

    @property
    def slack_paise(self) -> int:
        """How much this agent can still concede before it can't do its job."""
        return max(0, self.ask_paise - self.minimum_paise)

    @property
    def ceiling_paise(self) -> int:
        """The most expensive real option found — the grounding ceiling."""
        return max((o.price_paise for o in self.options), default=0)

    def cheapest_within(self, budget_paise: int) -> Optional[Option]:
        """Best-rated option that fits the given budget, else None."""
        affordable = [o for o in self.options if o.price_paise <= budget_paise]
        if not affordable:
            return None
        return max(affordable, key=lambda o: (o.rating, -o.price_paise))


@dataclass
class RoundRecord:
    """One round of the negotiation, kept for the audit trail."""

    number: int
    asks_paise: dict[str, int]
    total_asked_paise: int
    over_budget_paise: int
    messages: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class NegotiationResult:
    allocations_paise: dict[str, int]
    rounds: list[RoundRecord]
    exit_reason: ExitReason
    budget_paise: int

    @property
    def total_allocated_paise(self) -> int:
        return sum(self.allocations_paise.values())


@dataclass
class Purchase:
    """A completed (or failed) purchase by one specialist."""

    agent: str
    merchant: str
    description: str
    amount_paise: int
    status: Literal["success", "failed"]
    card_id: str
    source: Literal["live", "fixture"]
    detail: str
