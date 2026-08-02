import unittest

from humsafar.discovery import FixtureDiscovery
from humsafar.mediator import Mediator
from humsafar.models import Option, Specialist
from humsafar.money import to_paise
from humsafar.negotiation import MAX_ROUNDS, NegotiationEngine, build_specialists

GOAL = "Plan my Goa trip"
CATEGORIES = ["flights", "stay", "food", "guide"]


def engine_for(budget_rupees, categories=None):
    specialists = build_specialists(categories or CATEGORIES, FixtureDiscovery(), GOAL)
    return NegotiationEngine(specialists, to_paise(budget_rupees), Mediator()), specialists


def option(category, price, rating=4.0, vendor="V"):
    return Option(
        category=category,
        vendor=vendor,
        description="d",
        price_paise=to_paise(price),
        rating=rating,
        source="fixture",
        merchant=f"m-{vendor}",
    )


class ConvergenceTest(unittest.TestCase):
    def test_demo_budget_converges_cleanly(self):
        engine, _ = engine_for(30000)
        result = engine.run()

        self.assertEqual(result.exit_reason, "converged")
        self.assertLessEqual(result.total_allocated_paise, to_paise(30000))
        self.assertGreaterEqual(len(result.rounds), 1)

    def test_every_agent_lands_at_or_above_its_floor(self):
        engine, specialists = engine_for(30000)
        result = engine.run()

        for specialist in specialists:
            self.assertGreaterEqual(
                result.allocations_paise[specialist.category], specialist.minimum_paise
            )

    def test_never_exceeds_budget_across_a_wide_range(self):
        """The invariant the whole product rests on.

        Includes budgets below the sum of every category's cheapest option, so
        the infeasible path is covered too.
        """
        for budget in range(5000, 60001, 500):
            with self.subTest(budget=budget):
                engine, _ = engine_for(budget)
                result = engine.run()
                self.assertLessEqual(
                    result.total_allocated_paise,
                    to_paise(budget),
                    f"budget {budget} overspent via {result.exit_reason}",
                )
                self.assertTrue(all(v >= 0 for v in result.allocations_paise.values()))

    def test_stops_at_five_rounds(self):
        for budget in (8000, 12000, 16000, 30000, 45000):
            with self.subTest(budget=budget):
                engine, _ = engine_for(budget)
                result = engine.run()
                self.assertLessEqual(len(result.rounds), MAX_ROUNDS)

    def test_generous_budget_needs_no_concession(self):
        engine, _ = engine_for(60000)
        result = engine.run()
        self.assertEqual(len(result.rounds), 1)
        self.assertEqual(result.exit_reason, "converged")

    def test_budget_below_the_floor_is_reported_not_overspent(self):
        # Cheapest viable set is 6500 + 5400 + 2400 + 1800 = 16,100.
        engine, _ = engine_for(9000)
        result = engine.run()

        self.assertEqual(result.exit_reason, "budget_below_floor")
        self.assertEqual(result.total_allocated_paise, to_paise(9000))

    def test_asks_only_ever_decrease(self):
        engine, _ = engine_for(20000)
        result = engine.run()

        for category in CATEGORIES:
            asks = [r.asks_paise[category] for r in result.rounds]
            self.assertEqual(asks, sorted(asks, reverse=True), f"{category} asked for more mid-way")


class OpeningPositionTest(unittest.TestCase):
    """The one place model output changes an amount.

    A specialist chooses which option it opens the negotiation fighting for.
    Everything here exists to show the agency is real *and* that it cannot
    become a way for a model to state a figure: the strategy returns an index,
    and every price still comes from our own inventory.
    """

    @staticmethod
    def _picking(index, reason="because I say so"):
        """A strategy that always names the same position in each list."""

        def strategy(discovered):
            return {category: (index, reason) for category, _ in discovered}

        return strategy

    def _built(self, strategy, spoken=None):
        return build_specialists(
            CATEGORIES,
            FixtureDiscovery(),
            GOAL,
            ask_strategy=strategy,
            on_position=spoken,
        )

    def test_the_agents_choice_becomes_the_opening_ask(self):
        for specialist in self._built(self._picking(0)):
            self.assertEqual(
                specialist.ask_paise,
                specialist.options[0].price_paise,
                f"{specialist.category} ignored its own agent's pick",
            )

    def _split_at(self, budget, strategy):
        specialists = self._built(strategy) if strategy else build_specialists(
            CATEGORIES, FixtureDiscovery(), GOAL
        )
        return NegotiationEngine(specialists, to_paise(budget), Mediator()).run()

    def test_the_choice_genuinely_changes_the_split(self):
        """Otherwise the agency is decorative, which is the thing being fixed.

        Asserted at Rs 25,000, where the budget is a real constraint but not a
        binding one — agents opening cheap end up with flights Rs 11,800 /stay
        Rs 5,400, against Rs 8,200/Rs 8,900 from the engine's heuristic. That is
        a different trip, chosen by the agents.
        """
        chose = self._split_at(25000, self._picking(0))
        heuristic = self._split_at(25000, None)

        self.assertNotEqual(
            chose.allocations_paise,
            heuristic.allocations_paise,
            "the agents' opening choices made no difference to the final split",
        )

    def test_the_choice_survives_surplus_allocation_at_a_generous_budget(self):
        """The change that turned this from decoration into agency.

        Surplus allocation used to upgrade every agent toward its best-rated
        option, so an agent that deliberately opened cheap was pushed back up
        and its choice vanished from the receipt. Measured before the fix: the
        opening choice changed the final split in only one narrow band
        (Rs 18,000-19,000) and was washed out everywhere else.

        The mediator now refuses to spend an agent past the option it opened
        on. Under the engine's heuristic that is a no-op, because the opening
        ask is the best-rated option and the rating gain check already stopped
        there — which is why every pre-existing surplus test still passes.
        """
        chose = self._split_at(36000, self._picking(0))
        heuristic = self._split_at(36000, None)

        self.assertNotEqual(
            chose.allocations_paise,
            heuristic.allocations_paise,
            "surplus allocation washed the agents' choices out again",
        )
        # Agents that opened on the cheapest option get exactly that, and the
        # unspent remainder is simply not spent — nobody wanted it.
        self.assertLess(chose.total_allocated_paise, heuristic.total_allocated_paise)

    def test_no_agent_is_ever_funded_above_its_own_opening_ask(self):
        """The invariant that makes the choice stick, across the whole range."""
        for index in (0, 1):
            for budget in range(9000, 45001, 3000):
                specialists = self._built(self._picking(index))
                openings = {s.category: s.opening_ask_paise for s in specialists}
                result = NegotiationEngine(
                    specialists, to_paise(budget), Mediator()
                ).run()
                for category, amount in result.allocations_paise.items():
                    with self.subTest(index=index, budget=budget, category=category):
                        self.assertLessEqual(amount, openings[category])

    def test_an_out_of_range_pick_falls_back_instead_of_clamping(self):
        """Clamping would invent a choice nobody made."""
        picked = self._built(self._picking(99))
        heuristic = build_specialists(CATEGORIES, FixtureDiscovery(), GOAL)

        for chosen, default in zip(picked, heuristic):
            self.assertEqual(chosen.ask_paise, default.ask_paise)

    def test_a_strategy_that_raises_never_breaks_the_run(self):
        def explode(discovered):
            raise RuntimeError("model unavailable")

        specialists = self._built(explode)
        heuristic = build_specialists(CATEGORIES, FixtureDiscovery(), GOAL)

        self.assertEqual(len(specialists), len(heuristic))
        for chosen, default in zip(specialists, heuristic):
            self.assertEqual(chosen.ask_paise, default.ask_paise)

    def test_the_opening_ask_stays_inside_the_real_option_range(self):
        for index in (0, 1, 2, 99):
            for specialist in self._built(self._picking(index)):
                with self.subTest(index=index, category=specialist.category):
                    prices = [o.price_paise for o in specialist.options]
                    self.assertGreaterEqual(specialist.ask_paise, min(prices))
                    self.assertLessEqual(specialist.ask_paise, max(prices))

    def test_budget_safety_is_unaffected_by_agent_chosen_asks(self):
        """The invariant the product rests on, re-run with agents driving."""
        for index in (0, 1):
            for budget in range(5000, 60001, 2500):
                with self.subTest(index=index, budget=budget):
                    specialists = self._built(self._picking(index))
                    result = NegotiationEngine(
                        specialists, to_paise(budget), Mediator()
                    ).run()
                    self.assertLessEqual(
                        result.total_allocated_paise,
                        to_paise(budget),
                        f"budget {budget} overspent via {result.exit_reason}",
                    )

    def test_the_agents_reason_reaches_the_transcript(self):
        said = []
        self._built(
            self._picking(0, "the location is the whole point"),
            spoken=lambda agent, text: said.append((agent, text)),
        )

        self.assertEqual(len(said), len(CATEGORIES))
        for _, text in said:
            self.assertIn("opening on", text)
            self.assertIn("the location is the whole point", text)


class GroundingTest(unittest.TestCase):
    def test_mediator_trims_an_ask_above_every_real_option(self):
        specialist = Specialist(
            category="stay",
            options=[option("stay", "5000"), option("stay", "9000")],
            minimum_paise=to_paise("5000"),
            ideal_paise=to_paise("9000"),
            ask_paise=to_paise("25000"),  # inflated, e.g. by an LLM-stated ask
            opening_ask_paise=to_paise("25000"),
            display_name="Stay Agent",
        )

        objection = Mediator().check_grounding(specialist)

        self.assertIsNotNone(objection)
        self.assertEqual(specialist.ask_paise, to_paise("9000"))
        self.assertEqual(specialist.opening_ask_paise, to_paise("9000"))

    def test_a_grounded_ask_is_left_alone(self):
        specialist = Specialist(
            category="food",
            options=[option("food", "1000"), option("food", "2000")],
            minimum_paise=to_paise("1000"),
            ideal_paise=to_paise("2000"),
            ask_paise=to_paise("2000"),
            opening_ask_paise=to_paise("2000"),
            display_name="Food Agent",
        )

        self.assertIsNone(Mediator().check_grounding(specialist))
        self.assertEqual(specialist.ask_paise, to_paise("2000"))


class ForcedCompromiseTest(unittest.TestCase):
    def _specialists(self):
        return [
            Specialist(
                category="flights",
                options=[option("flights", "6000"), option("flights", "12000")],
                minimum_paise=to_paise("6000"),
                ideal_paise=to_paise("12000"),
                ask_paise=to_paise("12000"),
                opening_ask_paise=to_paise("12000"),
                display_name="Flights Agent",
            ),
            Specialist(
                category="stay",
                options=[option("stay", "4000"), option("stay", "8000")],
                minimum_paise=to_paise("4000"),
                ideal_paise=to_paise("8000"),
                ask_paise=to_paise("8000"),
                opening_ask_paise=to_paise("8000"),
                display_name="Stay Agent",
            ),
        ]

    def test_minimums_first_then_proportional_to_original_ask(self):
        specialists = self._specialists()
        budget = to_paise("15000")  # floor is 10,000, so 5,000 is shared out

        allocations, reason, statement = Mediator().forced_compromise(specialists, budget)

        self.assertEqual(reason, "forced_compromise")
        self.assertEqual(sum(allocations.values()), budget)
        # Flights asked 12,000 of the 20,000 total ask, so it takes 60% of the
        # 5,000 left after both floors are covered.
        self.assertEqual(allocations["flights"], to_paise("9000"))
        self.assertEqual(allocations["stay"], to_paise("6000"))
        self.assertIn("floor", statement)

    def test_nobody_is_pushed_above_their_own_opening_ask(self):
        specialists = self._specialists()
        allocations, _, _ = Mediator().forced_compromise(specialists, to_paise("19000"))

        for specialist in specialists:
            self.assertLessEqual(
                allocations[specialist.category], specialist.opening_ask_paise
            )

    def test_budget_under_the_floor_scales_down_instead_of_overspending(self):
        specialists = self._specialists()
        budget = to_paise("5000")  # floor is 10,000

        allocations, reason, statement = Mediator().forced_compromise(specialists, budget)

        self.assertEqual(reason, "budget_below_floor")
        self.assertEqual(sum(allocations.values()), budget)
        self.assertIn("below what this plan needs", statement)


class SurplusTest(unittest.TestCase):
    def test_leftover_budget_is_spent_on_the_best_upgrade(self):
        specialists = [
            Specialist(
                category="food",
                options=[option("food", "1000", 3.9), option("food", "1500", 4.6)],
                minimum_paise=to_paise("1000"),
                ideal_paise=to_paise("1500"),
                ask_paise=to_paise("1000"),
                opening_ask_paise=to_paise("1500"),
                display_name="Food Agent",
            )
        ]
        allocations = {"food": to_paise("1000")}

        notes = Mediator().allocate_surplus(specialists, allocations, to_paise("2000"))

        self.assertEqual(allocations["food"], to_paise("1500"))
        self.assertEqual(len(notes), 1)

    def test_never_spends_past_the_budget(self):
        specialists = [
            Specialist(
                category="food",
                options=[option("food", "1000", 3.9), option("food", "1900", 4.9)],
                minimum_paise=to_paise("1000"),
                ideal_paise=to_paise("1900"),
                ask_paise=to_paise("1000"),
                opening_ask_paise=to_paise("1900"),
                display_name="Food Agent",
            )
        ]
        allocations = {"food": to_paise("1000")}

        Mediator().allocate_surplus(specialists, allocations, to_paise("1500"))

        self.assertEqual(allocations["food"], to_paise("1000"))

    def test_does_not_pay_more_for_a_worse_option(self):
        specialists = [
            Specialist(
                category="food",
                options=[option("food", "1000", 4.5), option("food", "1200", 4.1)],
                minimum_paise=to_paise("1000"),
                ideal_paise=to_paise("1000"),
                ask_paise=to_paise("1000"),
                opening_ask_paise=to_paise("1000"),
                display_name="Food Agent",
            )
        ]
        allocations = {"food": to_paise("1000")}

        Mediator().allocate_surplus(specialists, allocations, to_paise("5000"))

        self.assertEqual(allocations["food"], to_paise("1000"))


if __name__ == "__main__":
    unittest.main()
