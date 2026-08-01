"""Goal parsing — the Intent Agent and its deterministic guard rail.

`discovery.categories_for_goal` is a keyword matcher. It works for "Goa trip"
and falls apart on "set up my first apartment for Rs 20k" or "throw a birthday
under Rs 8k" — goals the product claims to serve. Reading an arbitrary goal is
genuinely a language problem, so it is the one place a model earns its place.

What the model returns is treated as a *suggestion under validation*:

* Categories outside the locked four are dropped. The schema constrains them and
  this drops them again, because a schema is a contract with the model and
  validation is a contract with ourselves.
* Weights are clamped to [0, 1]; anything non-finite becomes neutral.
* An empty or unusable result falls back to the keyword parser, so a goal always
  produces a runnable roster.

**Where the weights actually go.** A parsed priority is not decoration: it makes
an emphasised category concede less during negotiation and win surplus upgrades
sooner. But it never becomes an amount — it enters the engine as a bounded
multiplier alongside slack, and every rupee is still computed deterministically.
"I care about the food" changes who gives ground, not what anything costs.
"""

from dataclasses import dataclass, field
from typing import Optional

from .discovery import categories_for_goal, is_travel_goal
from .models import WIRE_CATEGORIES

NEUTRAL_WEIGHT = 0.5

# How far a stated priority is allowed to bend the negotiation. At 0.6, a
# maximally-emphasised category concedes 60% less than its slack alone would
# suggest. Bounded on purpose: user emphasis should tilt the outcome, not let
# one category ignore the budget.
PRIORITY_INFLUENCE = 0.6


@dataclass
class GoalIntent:
    """A validated reading of the user's goal."""

    categories: list[str]
    weights: dict[str, float] = field(default_factory=dict)
    summary: str = ""
    source: str = "keyword"

    def weight_for(self, category: str) -> float:
        return self.weights.get(category, NEUTRAL_WEIGHT)

    def concession_multiplier(self, category: str) -> float:
        """How willing this category is to give ground. Lower = more stubborn.

        Neutral (0.5) leaves behaviour exactly as it was before intent parsing
        existed, so a run without a model is unchanged.
        """
        delta = self.weight_for(category) - NEUTRAL_WEIGHT
        return max(0.05, 1.0 - (delta * 2.0 * PRIORITY_INFLUENCE))

    def upgrade_multiplier(self, category: str) -> float:
        """How strongly surplus budget should favour this category."""
        delta = self.weight_for(category) - NEUTRAL_WEIGHT
        return max(0.05, 1.0 + (delta * 2.0 * PRIORITY_INFLUENCE))


def keyword_intent(goal: str) -> GoalIntent:
    categories = categories_for_goal(goal)
    return GoalIntent(
        categories=categories,
        weights={c: NEUTRAL_WEIGHT for c in categories},
        summary=goal,
        source="keyword",
    )


def validate_plan(plan) -> Optional[GoalIntent]:
    """Turn a model GoalPlan into a GoalIntent, or None if unusable."""
    rows = getattr(plan, "categories", None)
    if not isinstance(rows, list) or not rows:
        return None

    categories: list[str] = []
    weights: dict[str, float] = {}

    for row in rows:
        category = getattr(row, "category", None)
        if category not in WIRE_CATEGORIES or category in weights:
            continue

        raw = getattr(row, "weight", NEUTRAL_WEIGHT)
        try:
            weight = float(raw)
        except (TypeError, ValueError):
            weight = NEUTRAL_WEIGHT
        if weight != weight or weight in (float("inf"), float("-inf")):
            weight = NEUTRAL_WEIGHT

        categories.append(category)
        weights[category] = min(1.0, max(0.0, weight))

    if not categories:
        return None

    summary = getattr(plan, "summary", "") or ""
    return GoalIntent(
        categories=categories,
        weights=weights,
        summary=str(summary),
        source="openai",
    )


def parse_intent(goal: str, runtime=None) -> GoalIntent:
    """Read a goal into a specialist roster and per-category priorities.

    Always returns a usable intent. The model is asked first when available;
    anything short of a clean, validated answer falls back to keywords.
    """
    if runtime is None or not getattr(runtime, "available", False):
        return keyword_intent(goal)

    prompt = (
        f"User goal: {goal!r}\n\n"
        "Which specialist buying agents does this goal need, and how strongly "
        "does the user emphasise each one? Omit categories the goal does not "
        "need. Do not mention any amount of money."
    )
    plan = runtime.ask("intent", prompt)
    if plan is None:
        return keyword_intent(goal)

    validated = validate_plan(plan)
    if validated is None:
        return keyword_intent(goal)

    return _restore_dropped(validated, goal)


def _restore_dropped(intent: GoalIntent, goal: str) -> GoalIntent:
    """Add back categories the keyword parser is confident the goal needs.

    Roster selection turned out to be the unreliable half of goal parsing. On
    "Plan my Goa trip, I really care about eating well" the same model returned
    all four categories once and only two the next time — reading the emphasis
    on food as permission to drop flights and stay. A trip with no flights and
    nowhere to sleep is not a plan, and it silently left most of the budget
    unspent.

    So the model's *priorities* are trusted and its *omissions* are not: any
    category the keyword parser would have selected is restored at neutral
    weight. Goals the keyword parser has no opinion about are still entirely
    the model's call, which is what keeps arbitrary goals working.
    """
    # Only when the goal is *confidently* a journey. `categories_for_goal`
    # falls back to the full roster whenever it has no opinion, so keying off
    # that instead would restore all four categories for every goal and destroy
    # the narrowing this agent exists to do.
    if not is_travel_goal(goal):
        return intent

    missing = [c for c in WIRE_CATEGORIES if c not in intent.weights]
    if not missing:
        return intent

    categories = list(intent.categories) + missing
    weights = dict(intent.weights)
    for category in missing:
        weights[category] = NEUTRAL_WEIGHT

    return GoalIntent(
        categories=categories,
        weights=weights,
        summary=intent.summary,
        source=intent.source,
    )
