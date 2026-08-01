"""The Mediator / Arbiter.

The mediator never negotiates for itself. It does three jobs:

1. **Grounding** — stops an agent asking for more money than any option it
   actually found. This is the "no agent inflates its need" check from
   brainstorming.md §2.
2. **Arbitration** — when the agents cannot converge on their own, it applies
   the forced-compromise rule locked in INTERFACES.md §5.
3. **Verification** — a final invariant check that the plan fits the budget,
   run before a single rupee is committed.

All of it is deterministic. The LLM writes what the agents *say*; it never
decides what anyone *gets*. A hallucinated number here would be a real
overspend, and "the model decided" is not an answer anyone wants to give a
judge — or a user.
"""

from .models import NegotiationResult, Specialist
from .money import format_inr, split_proportionally


class Mediator:
    display_name = "Mediator"

    def check_grounding(self, specialist: Specialist) -> str | None:
        """Trim an ask that exceeds every real option in that category.

        Returns the mediator's on-the-record objection, or None if the ask was
        already grounded.
        """
        ceiling = specialist.ceiling_paise
        if ceiling <= 0 or specialist.ask_paise <= ceiling:
            return None

        inflated_by = specialist.ask_paise - ceiling
        specialist.ask_paise = ceiling
        if specialist.opening_ask_paise > ceiling:
            specialist.opening_ask_paise = ceiling

        return (
            f"{specialist.display_name} asked for {format_inr(specialist.ask_paise + inflated_by)}, "
            f"but the most expensive option it actually found is {format_inr(ceiling)}. "
            f"Trimming the ask by {format_inr(inflated_by)} — nobody bids above their own menu."
        )

    def forced_compromise(
        self, specialists: list[Specialist], budget_paise: int
    ) -> tuple[dict[str, int], str, str]:
        """Settle a negotiation that would not converge on its own.

        Implements INTERFACES.md §5 rule 2: every agent gets its stated minimum
        first, then the leftover is distributed proportionally to each agent's
        *original* requested share — so an agent that argued harder still gets
        proportionally more of what's left, it just doesn't get its full ask.

        Returns `(allocations, exit_reason, mediator_statement)`.
        """
        minimums = [s.minimum_paise for s in specialists]
        floor = sum(minimums)

        if floor > budget_paise:
            # The locked rule does not cover this case, and taken literally it
            # would hand out more money than the user has. See the amendment
            # note in INTERFACES.md §5: below the viable floor we scale the
            # minimums down to fit exactly, and say so out loud rather than
            # quietly shipping a plan nobody can actually deliver.
            scaled = split_proportionally(budget_paise, minimums)
            allocations = {s.category: amount for s, amount in zip(specialists, scaled)}
            statement = (
                f"This budget is below what this plan needs. The cheapest viable option in every "
                f"category already comes to {format_inr(floor)}, and the budget is "
                f"{format_inr(budget_paise)}. I am scaling every agent down proportionally to fit "
                f"{format_inr(budget_paise)} exactly — expect at least one category to come back "
                f"unbuyable. Raising the budget by {format_inr(floor - budget_paise)} would fix it."
            )
            return allocations, "budget_below_floor", statement

        remainder = budget_paise - floor
        # Weight the leftover by what each agent originally asked for, but never
        # push anyone above their own opening ask — money parked above an
        # agent's ask is money no other agent can use.
        headroom = [max(0, s.opening_ask_paise - s.minimum_paise) for s in specialists]
        extra = _distribute_capped(remainder, [s.opening_ask_paise for s in specialists], headroom)

        allocations = {
            s.category: minimum + bonus
            for s, minimum, bonus in zip(specialists, minimums, extra)
        }
        statement = (
            f"Five rounds and no agreement, so I'm settling it. Everyone gets their stated floor "
            f"first ({format_inr(floor)} in total), and the remaining {format_inr(remainder)} is "
            f"split by how hard each of you argued for it — not equally. That fits "
            f"{format_inr(budget_paise)} exactly."
        )
        return allocations, "forced_compromise", statement

    def allocate_surplus(
        self,
        specialists: list[Specialist],
        allocations: dict[str, int],
        budget_paise: int,
        intent=None,
    ) -> list[str]:
        """Put leftover budget where it buys the most, one upgrade at a time.

        Once every ask is pinned to a real option price, a converged split
        usually leaves money on the table — nobody's next option up happened to
        fit the gap. Rather than strand it, the mediator awards it greedily to
        whichever agent's upgrade delivers the most rating per extra rupee.

        Only strict improvements are considered, and each pass raises exactly
        one agent to a strictly more expensive option, so the loop always ends.
        Returns the mediator's statements, in order.
        """
        notes: list[str] = []

        while True:
            leftover = budget_paise - sum(allocations.values())
            if leftover <= 0:
                break

            best: tuple[float, str, Specialist, int, str] | None = None
            for specialist in specialists:
                current_paise = allocations[specialist.category]
                current = specialist.cheapest_within(current_paise)
                current_rating = current.rating if current else 0.0

                for option in specialist.options:
                    extra = option.price_paise - current_paise
                    gain = option.rating - current_rating
                    if extra <= 0 or extra > leftover or gain <= 0:
                        continue
                    # Rating gained per rupee, tilted by how much the user
                    # emphasised this category. A neutral priority multiplies by
                    # 1.0, so surplus behaves exactly as before when no goal
                    # parsing ran.
                    score = gain / extra
                    if intent is not None:
                        score *= intent.upgrade_multiplier(specialist.category)
                    candidate = (score, specialist.category, specialist, option.price_paise, option.vendor)
                    # Highest score wins; category name breaks ties so a replay
                    # of the same negotiation produces the same plan.
                    if best is None or (score, specialist.category) > (best[0], best[1]):
                        best = candidate

            if best is None:
                break

            _, category, specialist, price, vendor = best
            spent = price - allocations[category]
            allocations[category] = price
            notes.append(
                f"{format_inr(leftover)} was still unspent, and {specialist.display_name} had the "
                f"best use for it — upgrading to {vendor} for {format_inr(spent)} more."
            )

        return notes

    def verify(self, result: NegotiationResult) -> None:
        """Last line of defence before any money moves.

        Raises rather than returning a flag: a plan that overspends must never
        reach the card-minting step, and there is no sensible way to continue.
        """
        total = result.total_allocated_paise
        if total > result.budget_paise:
            raise AssertionError(
                f"Allocation {format_inr(total)} exceeds budget {format_inr(result.budget_paise)}"
            )
        if any(amount < 0 for amount in result.allocations_paise.values()):
            raise AssertionError("Allocation contains a negative slice")


def _distribute_capped(pot: int, weights: list[int], caps: list[int]) -> list[int]:
    """Split `pot` by `weights`, respecting per-share `caps`.

    Anything a capped share cannot take is re-split among the shares that still
    have room, until the pot is exhausted or everyone is full. Always
    terminates: each pass either empties the pot or caps at least one more
    share.
    """
    awarded = [0] * len(weights)
    remaining = min(pot, sum(caps))
    open_indices = [i for i in range(len(weights)) if caps[i] > 0]

    while remaining > 0 and open_indices:
        shares = split_proportionally(remaining, [weights[i] for i in open_indices])
        progressed = False
        for index, share in zip(list(open_indices), shares):
            room = caps[index] - awarded[index]
            take = min(share, room)
            if take > 0:
                awarded[index] += take
                remaining -= take
                progressed = True
            if awarded[index] >= caps[index]:
                open_indices.remove(index)
        if not progressed:
            break

    return awarded
