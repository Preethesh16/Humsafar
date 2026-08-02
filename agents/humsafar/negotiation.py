"""The negotiation engine — multi-round budget contention.

This is the part brainstorming.md refuses to leave hand-wavy. The exit
condition is the rule locked in INTERFACES.md §5:

  1. Clean exit — the proposed split sums to <= budget and no agent's stated
     minimum viable ask has been violated.
  2. After 5 rounds without (1), the mediator forces a compromise.

Between those two, agents concede gradually rather than all at once. That is
not theatre for the demo: time-dependent concession is the standard model of
how bargaining actually resolves, and it means the split visibly converges
instead of snapping to an answer in one step. The schedule below closes the
gap fully by round 3, which leaves real headroom before the round-5 fallback.

The engine holds no opinions about transport or LLMs — it reports through
callbacks — so the whole thing is testable offline in milliseconds.
"""

import os
from typing import Callable, Optional

from .discovery import DiscoveryProvider
from .intent import GoalIntent
from .mediator import Mediator, _distribute_capped
from .models import NegotiationResult, Option, RoundRecord, Specialist
from .money import format_inr

MAX_ROUNDS = 5

# How many opening rounds get model-written dialogue. Round 1 is where the
# agents state their case and the model earns its place; the later rounds are
# concessions, and the deterministic concession line ("Fine — I'll give up the
# Taj and take Anjuna Beach Resort, that's Rs 4,800 back on the table") is
# already the most concrete text in the transcript.
#
# Was 1 while the account sat on a 50-requests-per-day free tier — a full run
# cost 10 calls, so narrating every round meant five runs before the demo died.
# Prava announced on 2026-08-02 that the OpenAI hackathon credit is now at max
# tier with the rate limit removed, so that constraint is gone.
#
# 2 covers the opening statements AND the round where agents actually concede,
# which is the part worth hearing. Later rounds stay templated: by then the
# deterministic concession line ("Fine — I'll give up the Taj and take Anjuna
# Beach Resort, that's Rs 4,800 back on the table") is more concrete than
# anything a model adds.
NARRATED_ROUNDS = int(os.environ.get("HUMSAFAR_NARRATED_ROUNDS", "2"))

# Fraction of the outstanding gap the agents collectively close in each round.
# Ramps to 1.0 so the negotiation always converges by round 3 whenever the
# budget can actually cover everyone's floor.
CONCESSION_SCHEDULE: tuple[float, ...] = (0.6, 0.8, 1.0, 1.0, 1.0)

DISPLAY_NAMES = {
    "flights": "Journey Agent",
    "stay": "Stay Agent",
    "food": "Food Agent",
    "guide": "Guide Agent",
}

MessageSink = Callable[[str, str], None]
SplitSink = Callable[[dict[str, int], int], None]


def build_specialists(
    categories: list[str],
    provider: DiscoveryProvider,
    goal: str,
    ask_strategy: Optional[Callable[[str, list[Option]], int]] = None,
) -> list[Specialist]:
    """Create one specialist per category, grounded in real discovered options.

    A specialist's floor is the cheapest thing it found; its opening ask is the
    best-rated thing it found. Both come from the option list rather than from
    a model's imagination, so the mediator's grounding check has something
    factual to check against.

    `ask_strategy` lets the LLM state the opening ask instead (see llm.py).
    A model-stated ask is exactly the case the grounding check exists for.
    """
    specialists: list[Specialist] = []
    for category in categories:
        options = provider.discover(category, goal)
        if not options:
            continue

        minimum = min(o.price_paise for o in options)
        preferred = max(options, key=lambda o: (o.rating, -o.price_paise))
        opening = preferred.price_paise
        if ask_strategy is not None:
            opening = max(minimum, ask_strategy(category, options))

        specialists.append(
            Specialist(
                category=category,
                options=options,
                minimum_paise=minimum,
                ideal_paise=preferred.price_paise,
                ask_paise=opening,
                opening_ask_paise=opening,
                display_name=DISPLAY_NAMES.get(category, f"{category.title()} Agent"),
            )
        )
    return specialists


class NegotiationEngine:
    def __init__(
        self,
        specialists: list[Specialist],
        budget_paise: int,
        mediator: Mediator,
        on_message: Optional[MessageSink] = None,
        on_split: Optional[SplitSink] = None,
        narrator=None,
        intent=None,
    ) -> None:
        self.specialists = specialists
        self.budget_paise = budget_paise
        self.mediator = mediator
        self.on_message = on_message or (lambda agent, text: None)
        self.on_split = on_split or (lambda allocations, rnd: None)
        self.narrator = narrator
        # A neutral intent leaves every multiplier at 1.0, so a run without goal
        # parsing behaves exactly as it did before intent existed.
        self.intent = intent if intent is not None else GoalIntent(
            categories=[s.category for s in specialists]
        )

    def run(self) -> NegotiationResult:
        rounds: list[RoundRecord] = []

        if not self.specialists:
            return NegotiationResult({}, rounds, "converged", self.budget_paise)

        self._ground_opening_asks()

        for number in range(1, MAX_ROUNDS + 1):
            record = self._open_round(number)
            rounds.append(record)

            if self._has_converged(record):
                self._say(
                    "mediator",
                    f"Agreed. The split sums to {format_inr(record.total_asked_paise)} against a "
                    f"{format_inr(self.budget_paise)} budget, and every agent is above its floor. "
                    f"Locking it in.",
                    record,
                )
                allocations = {s.category: s.ask_paise for s in self.specialists}
                for note in self.mediator.allocate_surplus(
                    self.specialists, allocations, self.budget_paise, self.intent
                ):
                    self._say("mediator", note, record)
                if allocations != record.asks_paise:
                    self.on_split(allocations, record.number)

                result = NegotiationResult(allocations, rounds, "converged", self.budget_paise)
                self.mediator.verify(result)
                self._explain(result, record)
                return result

            if number < MAX_ROUNDS:
                self._concede(number, record)

        allocations, exit_reason, statement = self.mediator.forced_compromise(
            self.specialists, self.budget_paise
        )
        self._say("mediator", statement, rounds[-1])
        self.on_split(allocations, MAX_ROUNDS)

        result = NegotiationResult(allocations, rounds, exit_reason, self.budget_paise)
        self.mediator.verify(result)
        return result

    # -- rounds ---------------------------------------------------------

    def _ground_opening_asks(self) -> None:
        for specialist in self.specialists:
            objection = self.mediator.check_grounding(specialist)
            if objection:
                self._say("mediator", objection, None)

    def _open_round(self, number: int) -> RoundRecord:
        asks = {s.category: s.ask_paise for s in self.specialists}
        total = sum(asks.values())
        record = RoundRecord(
            number=number,
            asks_paise=asks,
            total_asked_paise=total,
            over_budget_paise=max(0, total - self.budget_paise),
        )

        # Fetch the whole round's dialogue at once. The specialists argue
        # independently, so waiting for them one after another just adds their
        # latencies together — see AgentRuntime.ask_many.
        spoken = self._argue_round(record)
        for specialist in self.specialists:
            text = spoken.get(specialist.category) or self._default_argument(specialist, record)
            self._say(specialist.category, text, record)

        self.on_split(asks, number)
        return record

    def _has_converged(self, record: RoundRecord) -> bool:
        """INTERFACES.md §5 rule 1, both conditions checked explicitly."""
        fits_budget = record.total_asked_paise <= self.budget_paise
        floors_respected = all(s.ask_paise >= s.minimum_paise for s in self.specialists)
        return fits_budget and floors_respected

    def _concede(self, number: int, record: RoundRecord) -> None:
        """Move every agent partway toward its floor, in proportion to slack.

        Agents with more room to give concede more of the gap. An agent already
        at its floor concedes nothing — that is what "minimum viable ask" means,
        and it is why the engine can never negotiate someone below the price of
        the cheapest real option in their category.
        """
        gap = record.over_budget_paise
        slacks = [s.slack_paise for s in self.specialists]
        total_slack = sum(slacks)

        if gap <= 0 or total_slack <= 0:
            if total_slack <= 0:
                self._say(
                    "mediator",
                    "Every agent is at its floor and we are still over budget. No further "
                    "concession is possible — I'll settle this myself.",
                    record,
                )
            return

        rate = CONCESSION_SCHEDULE[min(number, len(CONCESSION_SCHEDULE)) - 1]
        target = int(min(gap, total_slack) * rate)

        # Slack says how much an agent *can* give up; the user's stated priority
        # says how willing it should be. A category the user emphasised concedes
        # less of the same slack. Caps stay at raw slack, so priority can never
        # push anyone below their floor — it only reorders who gives ground.
        weights = [
            max(0, int(s.slack_paise * self.intent.concession_multiplier(s.category)))
            for s in self.specialists
        ]
        concessions = _distribute_capped(target, weights, slacks)

        self._say(
            "mediator",
            f"We're {format_inr(gap)} over. I need {format_inr(target)} back this round — "
            f"weighted by who has the most room, not split evenly.",
            record,
        )

        for specialist, concession in zip(self.specialists, concessions):
            if concession <= 0:
                continue
            before = specialist.ask_paise
            specialist.ask_paise -= concession
            self._say(specialist.category, self._concede_text(specialist, before), record)

    def _explain(self, result: NegotiationResult, record: RoundRecord) -> None:
        """Let the mediator explain a settlement it did not choose.

        Purely additive: the deterministic "Agreed. The split sums to ..." line
        has already been said, so a missing or rejected model response costs the
        run nothing.
        """
        if self.narrator is None:
            return
        explain = getattr(self.narrator, "explain_settlement", None)
        if explain is None:
            return

        text = explain(
            self.specialists,
            result.allocations_paise,
            self.budget_paise,
            result.exit_reason,
            len(result.rounds),
        )
        if text:
            self._say("mediator", text, record)

    def _concede_text(self, specialist: Specialist, before: int) -> str:
        """Snap a conceded ask down to something the agent can actually buy.

        Without this the negotiation is decorative: an agent argues its way to
        a slice of, say, Rs 12,955, then buys the best option that fits at
        Rs 8,900 and quietly strands Rs 4,055. Every ask is therefore pinned to
        the price of a real option, so conceding means *downgrading your pick*
        and the agreed split is exactly what gets bought.
        """
        held = specialist.options and max(
            (o for o in specialist.options if o.price_paise <= before),
            key=lambda o: (o.rating, -o.price_paise),
            default=None,
        )
        target = specialist.cheapest_within(specialist.ask_paise)
        if target is None:
            specialist.ask_paise = specialist.minimum_paise
            return (
                f"That takes me under my floor. I'm at "
                f"{format_inr(specialist.minimum_paise)} and I cannot go lower."
            )

        specialist.ask_paise = target.price_paise
        given_up = before - specialist.ask_paise

        if held is not None and held.vendor != target.vendor:
            return (
                f"Fine — I'll give up {held.vendor} and take {target.vendor} at "
                f"{format_inr(target.price_paise)}. That's {format_inr(given_up)} back on the "
                f"table, and it's the last downgrade I'm happy about."
            )
        return (
            f"Dropping {format_inr(given_up)} to {format_inr(specialist.ask_paise)}. "
            f"Below {format_inr(specialist.minimum_paise)} there's nothing left to buy."
        )

    # -- dialogue -------------------------------------------------------

    def _argue_round(self, record: RoundRecord) -> dict[str, Optional[str]]:
        """Model dialogue for every specialist this round, or empty on fallback."""
        if self.narrator is None or record.number > NARRATED_ROUNDS:
            return {}

        batch = getattr(self.narrator, "argue_many", None)
        if batch is not None:
            return batch(self.specialists, record, self.budget_paise) or {}

        # A narrator without the batch method (a test double, say) still works.
        return {
            s.category: self.narrator.argue(s, record, self.budget_paise)
            for s in self.specialists
        }

    def _default_argument(self, specialist: Specialist, record: RoundRecord) -> str:
        """Deterministic fallback dialogue.

        Used whenever the LLM is unavailable or slow. The numbers are the real
        ones either way — only the prose changes — so a dead API key costs the
        demo some personality, never its correctness.
        """
        best = max(specialist.options, key=lambda o: (o.rating, -o.price_paise))
        if record.number == 1:
            return (
                f"I need {format_inr(specialist.ask_paise)} for {best.vendor} — {best.description}. "
                f"My floor is {format_inr(specialist.minimum_paise)}; below that the only thing "
                f"left in this category is a worse trip."
            )
        if record.over_budget_paise > 0:
            return (
                f"Still holding at {format_inr(specialist.ask_paise)}. We're "
                f"{format_inr(record.over_budget_paise)} over, and I'd rather someone with more "
                f"slack than me gives it up first."
            )
        return f"I'm at {format_inr(specialist.ask_paise)} and that works. No objection."

    def _say(self, agent: str, text: str, record: Optional[RoundRecord]) -> None:
        if record is not None:
            record.messages.append((agent, text))
        self.on_message(agent, text)
