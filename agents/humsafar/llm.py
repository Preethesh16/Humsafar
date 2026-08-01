"""Agent narration over a deterministic negotiation.

The division of labour is the single most important thing in this file:

    The model decides what an agent SAYS.
    The engine decides what an agent GETS.

Every rupee comes from integer arithmetic in `money.py`, `negotiation.py` and
`mediator.py`. The model is handed the real figures and asked to argue for them
in character. It cannot move money, and — because of `mentions_only` below — it
cannot even *claim* a figure it wasn't given.

That last part matters more than it sounds. Instructing a model not to invent
numbers is not a guarantee; checking its output is. If a specialist says
"I need Rs 14,000" when the engine gave it Rs 11,200, the line is discarded and
the deterministic sentence is used instead. The audience sees slightly duller
prose; they never see a wrong number attributed to an agent.

Resilience falls out of the same design: no key, a dead key, a rate limit or a
timeout degrades to templated dialogue with **identical** numbers.
"""

import re
from typing import Iterable, Optional

from .ai import AgentRuntime
from .models import RoundRecord, Specialist
from .money import format_inr, to_rupees

# Numbers introduced by a currency marker are always checked. Bare numbers are
# only checked above this threshold, so "2 nights", "round 3" and a 4.6 rating
# stay legal while an invented price does not.
BARE_NUMBER_FLOOR = 1000.0

_CURRENCY_AMOUNT = re.compile(r"(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)", re.IGNORECASE)
_ANY_NUMBER = re.compile(r"\b(\d[\d,]*(?:\.\d+)?)\b")


def _as_float(token: str) -> Optional[float]:
    try:
        return round(float(token.replace(",", "")), 2)
    except (TypeError, ValueError):
        return None


def mentions_only(text: str, allowed_paise: Iterable[int]) -> bool:
    """True if every monetary figure in `text` was one we supplied.

    Currency-marked numbers are always validated. Bare numbers are validated
    only above `BARE_NUMBER_FLOOR`, which keeps counts, rounds and ratings out
    of scope without letting an invented price through.
    """
    allowed = {round(to_rupees(p), 2) for p in allowed_paise}
    # An agent may restate a figure without decimals ("Rs 11,200").
    allowed |= {round(v) for v in allowed}

    for match in _CURRENCY_AMOUNT.finditer(text):
        value = _as_float(match.group(1))
        if value is None or value not in allowed:
            return False

    for match in _ANY_NUMBER.finditer(text):
        value = _as_float(match.group(1))
        if value is None or value < BARE_NUMBER_FLOOR:
            continue
        if value not in allowed:
            return False

    return True


class Narrator:
    """Optional OpenAI voice over a deterministic negotiation."""

    def __init__(
        self,
        runtime: Optional[AgentRuntime] = None,
        enabled: bool = True,
        api_key: Optional[str] = None,
    ) -> None:
        self.runtime = runtime if runtime is not None else AgentRuntime(
            api_key=api_key, enabled=enabled
        )
        self.rejected = 0

    @property
    def available(self) -> bool:
        return bool(getattr(self.runtime, "available", False))

    # -- specialists ------------------------------------------------------

    def argue(
        self, specialist: Specialist, record: RoundRecord, budget_paise: int
    ) -> Optional[str]:
        """In-character dialogue for one specialist, or None for the fallback."""
        if not self.available:
            return None

        best = max(specialist.options, key=lambda o: (o.rating, -o.price_paise))
        allowed = self._allowed_figures(specialist, record, budget_paise)

        others = "; ".join(
            f"{category} is asking {format_inr(amount)}"
            for category, amount in record.asks_paise.items()
            if category != specialist.category
        )
        prompt = (
            f"Shared budget: {format_inr(budget_paise)}. Negotiation round {record.number}.\n"
            f"Your current ask: {format_inr(specialist.ask_paise)}.\n"
            f"Your floor (cheapest real option you found): {format_inr(specialist.minimum_paise)}.\n"
            f"Your preferred option: {best.vendor} — {best.description} "
            f"at {format_inr(best.price_paise)}.\n"
            f"Other agents: {others or 'none'}.\n"
            f"The table is currently {format_inr(record.over_budget_paise)} over budget.\n"
            "Argue for your share."
        )

        return self._speak(specialist.category, prompt, allowed)

    # -- mediator ---------------------------------------------------------

    def explain_settlement(
        self,
        specialists: list[Specialist],
        allocations: dict[str, int],
        budget_paise: int,
        exit_reason: str,
        rounds: int,
    ) -> Optional[str]:
        """The mediator explaining an outcome the engine chose."""
        if not self.available:
            return None

        lines = []
        allowed: set[int] = {budget_paise, sum(allocations.values())}
        for specialist in specialists:
            final = allocations.get(specialist.category, 0)
            allowed |= {final, specialist.opening_ask_paise, specialist.minimum_paise}
            lines.append(
                f"{specialist.display_name}: opened at "
                f"{format_inr(specialist.opening_ask_paise)}, floor "
                f"{format_inr(specialist.minimum_paise)}, settled at {format_inr(final)}"
            )

        prompt = (
            f"Budget: {format_inr(budget_paise)}. Settled after {rounds} round(s) "
            f"({exit_reason}). Total allocated: {format_inr(sum(allocations.values()))}.\n"
            + "\n".join(lines)
            + "\nExplain why this settlement is fair."
        )

        return self._speak("mediator", prompt, allowed)

    # -- internals --------------------------------------------------------

    def _allowed_figures(
        self, specialist: Specialist, record: RoundRecord, budget_paise: int
    ) -> set[int]:
        allowed = {
            budget_paise,
            record.over_budget_paise,
            record.total_asked_paise,
            specialist.ask_paise,
            specialist.minimum_paise,
            specialist.opening_ask_paise,
        }
        allowed |= set(record.asks_paise.values())
        allowed |= {o.price_paise for o in specialist.options}
        return allowed

    def _speak(self, agent_key: str, prompt: str, allowed: Iterable[int]) -> Optional[str]:
        output = self.runtime.ask(agent_key, prompt)
        if output is None:
            return None

        text = (getattr(output, "message", "") or "").strip()
        if not text:
            return None

        if not mentions_only(text, allowed):
            # The model stated a figure it was never given. Discard the line
            # rather than let a wrong number reach the screen with an agent's
            # name on it.
            self.rejected += 1
            return None

        return text
