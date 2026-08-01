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
