"""LLM narration for the negotiation.

The division of labour is the single most important thing in this file:

    The model decides what an agent SAYS.
    The engine decides what an agent GETS.

Every rupee in this system comes from deterministic integer arithmetic in
negotiation.py and mediator.py. The model is handed the numbers and asked to
argue for them in character. It cannot move a rupee, and a hallucinated figure
in its prose can never become a hallucinated figure on a card.

That split also buys resilience. No API key, no credit, a rate limit, a slow
response — any of these degrade the demo to templated dialogue with identical
numbers, instead of killing it. brainstorming.md §2 adopted exactly this
pattern for external integrations; reasoning is no different.

Model choice follows brainstorming.md §4: a cheap model for the specialists'
back-and-forth, a stronger one reserved for the mediator's final arbitration.
"""

import os
import sys
from typing import Optional

from .models import RoundRecord, Specialist
from .money import format_inr

SPECIALIST_MODEL = os.environ.get("HUMSAFAR_SPECIALIST_MODEL", "gpt-4.1-mini")
MEDIATOR_MODEL = os.environ.get("HUMSAFAR_MEDIATOR_MODEL", "gpt-4.1")

SYSTEM_PROMPT = (
    "You are a specialist buying agent in a team that shares one fixed budget. "
    "You argue for your category's share in one or two short sentences — direct, "
    "specific, a little territorial, never rude. "
    "You MUST use the exact figures given to you and invent no others. "
    "Never mention being an AI or a language model. No preamble, no quotes."
)


class Narrator:
    """Optional LLM voice over a deterministic negotiation."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = SPECIALIST_MODEL,
        timeout: float = 8.0,
        enabled: bool = True,
    ) -> None:
        self.model = model
        self.timeout = timeout
        self.calls = 0
        self.degradations = 0
        self._client = None

        key = api_key or os.environ.get("OPENAI_API_KEY")
        if not enabled or not key:
            self._unavailable("no OPENAI_API_KEY set" if enabled else "narration disabled")
            return

        try:
            from openai import OpenAI

            self._client = OpenAI(api_key=key, timeout=timeout)
        except Exception as exc:  # noqa: BLE001 - any import/config failure degrades
            self._unavailable(f"openai client unavailable: {exc}")

    @property
    def available(self) -> bool:
        return self._client is not None

    def argue(
        self, specialist: Specialist, record: RoundRecord, budget_paise: int
    ) -> Optional[str]:
        """Return in-character dialogue, or None to use the deterministic text."""
        if not self.available:
            return None

        best = max(specialist.options, key=lambda o: (o.rating, -o.price_paise))
        others = ", ".join(
            f"{category} wants {format_inr(amount)}"
            for category, amount in record.asks_paise.items()
            if category != specialist.category
        )
        prompt = (
            f"You are the {specialist.display_name} on a shared budget of {format_inr(budget_paise)}.\n"
            f"Negotiation round {record.number}.\n"
            f"Your current ask: {format_inr(specialist.ask_paise)}.\n"
            f"Your absolute floor: {format_inr(specialist.minimum_paise)} "
            f"(the cheapest real option you found).\n"
            f"Your preferred option: {best.vendor} — {best.description} at {format_inr(best.price_paise)}.\n"
            f"Other agents: {others or 'none'}.\n"
            f"The table is currently {format_inr(record.over_budget_paise)} over budget.\n"
            f"Argue for your share in at most two sentences."
        )

        try:
            self.calls += 1
            response = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=120,
                temperature=0.8,
            )
            text = (response.choices[0].message.content or "").strip()
            return text or None
        except Exception as exc:  # noqa: BLE001 - never let narration break a run
            self._unavailable(f"call failed: {exc}")
            return None

    def _unavailable(self, reason: str) -> None:
        if self._client is not None or self.degradations == 0:
            print(f"[llm] using deterministic dialogue ({reason})", file=sys.stderr)
        self._client = None
        self.degradations += 1
