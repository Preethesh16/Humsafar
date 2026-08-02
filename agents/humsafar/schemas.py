"""Structured output schemas for the OpenAI agents.

These schemas are the first line of the safety story, and they are built around
one rule from `execution-plan.md`:

    **No model-facing schema may contain a money field.**

The model cannot state an allocation, a price, a floor, or a cap as structured
data, because there is nowhere in these types to put one. That is a stronger
guarantee than instructing it not to — an instruction can be ignored, a missing
field cannot be filled. Every rupee continues to come from the deterministic
engine in `money.py`, `negotiation.py` and `mediator.py`.

Categories are `Literal`-constrained so an unknown category cannot be returned
in the first place; `intent.py` re-validates anyway, because a schema is a
contract with the model and validation is a contract with ourselves.
"""

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["flights", "stay", "food", "guide"]


class CategoryPriority(BaseModel):
    """One category the goal needs, and how much the user seems to care."""

    category: Category
    weight: float = Field(
        description="How strongly the user emphasised this category, 0.0 to 1.0."
    )
    reason: str = Field(
        description="Short justification quoting the user's own emphasis. No amounts."
    )


class GoalPlan(BaseModel):
    """The Intent Agent's reading of an arbitrary goal.

    Deliberately carries no budget: the user's budget is supplied to the engine
    directly and must never round-trip through a model.
    """

    categories: list[CategoryPriority] = Field(
        description="Only the categories this goal actually needs. Omit the rest."
    )
    summary: str = Field(description="One sentence restating the goal in plain words.")


class OpeningPosition(BaseModel):
    """Which option a specialist opens the negotiation fighting for.

    This is the one place a model genuinely drives allocation, and it obeys the
    no-money rule by *construction* rather than by instruction: the agent picks
    an **option**, not an amount. The engine reads that option's price from its
    own inventory. There is no field here a rupee figure could go in, so a
    hallucinated number cannot become an opening ask — the worst a bad pick can
    do is name an option that exists, at a price we already knew.

    Contrast the rejected design, where the agent stated its ask as a number.
    That needed a money field, and every guarantee would then have rested on
    validating the figure afterwards instead of on it being unrepresentable.
    """

    option: int = Field(
        description="The number of the option you are fighting for, from the list given to you."
    )
    reason: str = Field(
        description="One sentence on why this option and not a cheaper one. Name no amounts."
    )


class AgentArgument(BaseModel):
    """A specialist agent's negotiating line.

    Free text, but validated afterwards: any rupee figure it mentions must
    already appear in the figures it was given. See `llm.py::mentions_only`.
    """

    message: str = Field(
        description="One or two sentences arguing for your share. Use only the figures provided."
    )


class MediatorSummary(BaseModel):
    """The mediator explaining a settlement it did not choose."""

    message: str = Field(
        description="Two or three sentences explaining the final split. Use only the figures provided."
    )
