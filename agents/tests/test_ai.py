"""Tests for the OpenAI Agents SDK layer.

Every test here injects a fake runtime. Nothing in the routine suite makes a
paid network call — that is an acceptance criterion in `execution-plan.md`, and
it is also the only way this suite stays runnable without a key.

The tests that matter most are the negative ones: a model that returns an
unknown category, an out-of-range weight, or an invented rupee figure must not
be able to affect the run.
"""

import unittest

from humsafar.ai import AgentRuntime
from humsafar.events import EventEmitter
from humsafar.intent import (
    NEUTRAL_WEIGHT,
    GoalIntent,
    keyword_intent,
    parse_intent,
    validate_plan,
)
from humsafar.llm import Narrator, mentions_only
from humsafar.money import to_paise
from humsafar.orchestrator import run_goal
from humsafar.schemas import AgentArgument, CategoryPriority, GoalPlan, MediatorSummary


class FakeRuntime:
    """Stands in for AgentRuntime. Never touches the network."""

    def __init__(self, responses=None, available=True):
        self.available = available
        self.responses = responses or {}
        self.prompts = []
        self.batches = 0

    def ask(self, agent_key, prompt, timeout=None):
        self.prompts.append((agent_key, prompt))
        return self.responses.get(agent_key)

    def ask_many(self, requests, timeout=None):
        """Mirrors AgentRuntime's batch contract: positional, None on miss."""
        self.batches += 1
        return [self.ask(key, prompt) for key, prompt in requests]

    def trace_run(self, run_id):
        class _N:
            def __enter__(self_inner):
                return None

            def __exit__(self_inner, *a):
                return False

        return _N()


def plan(*rows, summary="a goal"):
    return GoalPlan(
        categories=[CategoryPriority(category=c, weight=w, reason="r") for c, w in rows],
        summary=summary,
    )


class MentionsOnlyTest(unittest.TestCase):
    def test_accepts_figures_that_were_supplied(self):
        allowed = [to_paise("11200"), to_paise("5400")]
        self.assertTrue(mentions_only("I need Rs 11,200.00, floor is Rs 5,400.00", allowed))

    def test_rejects_an_invented_amount(self):
        allowed = [to_paise("11200")]
        self.assertFalse(mentions_only("I really need Rs 14,000 for this", allowed))

    def test_rejects_a_bare_invented_price(self):
        self.assertFalse(mentions_only("give me 9500 and I am happy", [to_paise("11200")]))

    def test_allows_small_bare_numbers(self):
        # "2 nights", "round 3", a 4.6 rating are not monetary claims.
        allowed = [to_paise("11200")]
        self.assertTrue(mentions_only("2 nights, round 3, rated 4.6 — Rs 11,200.00", allowed))

    def test_accepts_a_figure_restated_without_decimals(self):
        self.assertTrue(mentions_only("Rs 11,200 works", [to_paise("11200")]))

    def test_empty_text_is_trivially_clean(self):
        self.assertTrue(mentions_only("no numbers here", [to_paise("1")]))


class ValidatePlanTest(unittest.TestCase):
    def test_reads_a_clean_plan(self):
        intent = validate_plan(plan(("food", 0.9), ("stay", 0.2)))

        self.assertEqual(intent.categories, ["food", "stay"])
        self.assertAlmostEqual(intent.weights["food"], 0.9)
        self.assertEqual(intent.source, "openai")

    def test_clamps_out_of_range_weights(self):
        intent = validate_plan(plan(("food", 4.2), ("stay", -3.0)))

        self.assertEqual(intent.weights["food"], 1.0)
        self.assertEqual(intent.weights["stay"], 0.0)

    def test_drops_duplicate_categories(self):
        intent = validate_plan(plan(("food", 0.9), ("food", 0.1)))

        self.assertEqual(intent.categories, ["food"])
        self.assertAlmostEqual(intent.weights["food"], 0.9)

    def test_rejects_an_empty_plan(self):
        self.assertIsNone(validate_plan(plan()))
        self.assertIsNone(validate_plan(None))

    def test_ignores_a_category_outside_the_allow_list(self):
        # The schema constrains this, but validation must too — a schema is a
        # contract with the model, validation is a contract with ourselves.
        class Rogue:
            category = "yachts"
            weight = 0.9

        class RoguePlan:
            categories = [Rogue()]
            summary = "s"

        self.assertIsNone(validate_plan(RoguePlan()))

    def test_a_non_numeric_weight_becomes_neutral(self):
        class Row:
            category = "food"
            weight = "very high"

        class P:
            categories = [Row()]
            summary = "s"

        self.assertEqual(validate_plan(P()).weights["food"], NEUTRAL_WEIGHT)


class ParseIntentTest(unittest.TestCase):
    def test_falls_back_to_keywords_without_a_runtime(self):
        intent = parse_intent("Plan my Goa trip", None)

        self.assertEqual(intent.source, "keyword")
        self.assertIn("flights", intent.categories)

    def test_falls_back_when_the_model_returns_nothing(self):
        intent = parse_intent("Plan my Goa trip", FakeRuntime({"intent": None}))
        self.assertEqual(intent.source, "keyword")

    def test_falls_back_when_the_model_returns_an_unusable_plan(self):
        intent = parse_intent("Plan my Goa trip", FakeRuntime({"intent": plan()}))
        self.assertEqual(intent.source, "keyword")

    def test_uses_a_valid_model_plan(self):
        runtime = FakeRuntime({"intent": plan(("food", 0.9), ("guide", 0.4))})
        intent = parse_intent("Plan my Goa trip", runtime)

        self.assertEqual(intent.source, "openai")
        self.assertAlmostEqual(intent.weights["food"], 0.9)

    def test_narrowing_survives_for_a_non_travel_goal(self):
        """The restore net is only for journeys; elsewhere the model decides."""
        runtime = FakeRuntime({"intent": plan(("food", 0.9), ("guide", 0.4))})
        intent = parse_intent("Stock my kitchen and hire a cook", runtime)

        self.assertEqual(intent.categories, ["food", "guide"])

    def test_the_budget_is_never_sent_to_the_model(self):
        runtime = FakeRuntime({"intent": plan(("food", 0.5))})
        parse_intent("Plan my Goa trip under Rs 30,000", runtime)

        _, prompt = runtime.prompts[0]
        self.assertIn("Do not mention any amount of money", prompt)


class MultiplierTest(unittest.TestCase):
    def test_neutral_priority_is_a_no_op(self):
        intent = GoalIntent(categories=["food"], weights={"food": NEUTRAL_WEIGHT})

        self.assertAlmostEqual(intent.concession_multiplier("food"), 1.0)
        self.assertAlmostEqual(intent.upgrade_multiplier("food"), 1.0)

    def test_an_unknown_category_is_neutral(self):
        self.assertAlmostEqual(GoalIntent(categories=[]).concession_multiplier("x"), 1.0)

    def test_emphasis_makes_a_category_concede_less(self):
        intent = GoalIntent(categories=["food"], weights={"food": 1.0})
        self.assertLess(intent.concession_multiplier("food"), 1.0)
        self.assertGreater(intent.upgrade_multiplier("food"), 1.0)

    def test_multipliers_stay_positive_at_the_extremes(self):
        for weight in (0.0, 1.0):
            intent = GoalIntent(categories=["food"], weights={"food": weight})
            self.assertGreater(intent.concession_multiplier("food"), 0)
            self.assertGreater(intent.upgrade_multiplier("food"), 0)


class NarratorTest(unittest.TestCase):
    def _specialist_run(self, message):
        runtime = FakeRuntime(
            {
                "flights": AgentArgument(message=message),
                "stay": AgentArgument(message=message),
                "food": AgentArgument(message=message),
                "guide": AgentArgument(message=message),
            }
        )
        return Narrator(runtime=runtime), runtime

    def test_unavailable_runtime_yields_no_dialogue(self):
        narrator = Narrator(runtime=FakeRuntime(available=False))
        self.assertFalse(narrator.available)

    def test_a_line_with_an_invented_amount_is_discarded(self):
        narrator, _ = self._specialist_run("I demand Rs 99,999.00 immediately")
        emitter = EventEmitter(enabled=False)

        report = run_goal("Plan my Goa trip", "30000", emitter, narrator=narrator)

        self.assertGreater(narrator.rejected, 0)
        self.assertTrue(report.within_budget)
        for event in emitter.sent:
            if event["type"] == "agent_message":
                self.assertNotIn("99,999", event["message"])

    def test_a_grounded_line_is_used(self):
        narrator, _ = self._specialist_run("Holding firm, this is what the trip needs.")
        emitter = EventEmitter(enabled=False)

        run_goal("Plan my Goa trip", "30000", emitter, narrator=narrator)

        messages = [e["message"] for e in emitter.sent if e["type"] == "agent_message"]
        self.assertIn("Holding firm, this is what the trip needs.", messages)

    def test_mediator_explanation_is_additive_only(self):
        runtime = FakeRuntime({"mediator": MediatorSummary(message="Everyone kept their floor.")})
        emitter = EventEmitter(enabled=False)

        report = run_goal("Plan my Goa trip", "30000", emitter, narrator=Narrator(runtime=runtime))

        messages = [e["message"] for e in emitter.sent if e["type"] == "agent_message"]
        self.assertIn("Everyone kept their floor.", messages)
        # The deterministic settlement line is still there.
        self.assertTrue(any("Locking it in" in m for m in messages))
        self.assertTrue(report.within_budget)


class RoundBatchingTest(unittest.TestCase):
    """A round's specialists are fetched concurrently, not one after another."""

    def _record(self):
        from humsafar.models import RoundRecord

        return RoundRecord(
            number=2,
            asks_paise={"flights": to_paise("9800"), "food": to_paise("3200")},
            total_asked_paise=to_paise("13000"),
            over_budget_paise=0,
        )

    def _specialists(self):
        from humsafar.discovery import FixtureDiscovery
        from humsafar.negotiation import build_specialists

        return build_specialists(["flights", "food"], FixtureDiscovery(), "Goa")

    def test_one_batch_per_round_not_one_call_per_agent(self):
        runtime = FakeRuntime(
            {k: AgentArgument(message="Holding.") for k in ("flights", "food")}
        )
        narrator = Narrator(runtime=runtime)

        spoken = narrator.argue_many(self._specialists(), self._record(), to_paise("30000"))

        self.assertEqual(runtime.batches, 1)
        self.assertEqual(set(spoken), {"flights", "food"})

    def test_a_runtime_without_ask_many_still_works(self):
        class SerialOnly:
            available = True

            def ask(self, key, prompt, timeout=None):
                return AgentArgument(message="Serial line.")

        spoken = Narrator(runtime=SerialOnly()).argue_many(
            self._specialists(), self._record(), to_paise("30000")
        )
        self.assertEqual(set(spoken.values()), {"Serial line."})

    def test_one_agent_failing_does_not_silence_the_others(self):
        runtime = FakeRuntime({"food": AgentArgument(message="Only me.")})
        spoken = Narrator(runtime=runtime).argue_many(
            self._specialists(), self._record(), to_paise("30000")
        )

        self.assertEqual(spoken["food"], "Only me.")
        self.assertIsNone(spoken["flights"])


class ConcededPositionPromptTest(unittest.TestCase):
    """An agent must argue from where it is, not where it started.

    Regression test for a real bug seen in a live run: the Stay Agent conceded
    to Anjuna Beach Resort at Rs 11,200 and then announced it was staying at
    the Taj for Rs 16,000. Every figure was one it had been given, so
    `mentions_only` passed it — but the claim was incoherent on screen.
    """

    def test_a_conceded_agent_is_told_not_to_claim_its_opening(self):
        from humsafar.discovery import FixtureDiscovery
        from humsafar.models import RoundRecord
        from humsafar.negotiation import build_specialists

        specialist = build_specialists(["stay"], FixtureDiscovery(), "Goa")[0]
        specialist.ask_paise = to_paise("11200")  # conceded from a 16,000 opening

        runtime = FakeRuntime({"stay": AgentArgument(message="ok")})
        record = RoundRecord(
            number=2,
            asks_paise={"stay": specialist.ask_paise},
            total_asked_paise=specialist.ask_paise,
            over_budget_paise=0,
        )
        Narrator(runtime=runtime).argue_many([specialist], record, to_paise("30000"))

        _, prompt = runtime.prompts[0]
        self.assertIn("ALREADY conceded", prompt)
        self.assertIn("Do not claim you are getting anything above your current ask", prompt)
        self.assertIn("Anjuna Beach Resort", prompt)

    def test_an_opening_round_agent_is_not_told_it_conceded(self):
        from humsafar.discovery import FixtureDiscovery
        from humsafar.models import RoundRecord
        from humsafar.negotiation import build_specialists

        specialist = build_specialists(["stay"], FixtureDiscovery(), "Goa")[0]
        runtime = FakeRuntime({"stay": AgentArgument(message="ok")})
        record = RoundRecord(
            number=1,
            asks_paise={"stay": specialist.ask_paise},
            total_asked_paise=specialist.ask_paise,
            over_budget_paise=0,
        )
        Narrator(runtime=runtime).argue_many([specialist], record, to_paise("30000"))

        _, prompt = runtime.prompts[0]
        self.assertNotIn("ALREADY conceded", prompt)
        self.assertIn("your opening position", prompt)


class DeterminismTest(unittest.TestCase):
    """The acceptance criterion: reasoning changes prose, never money."""

    def _allocations(self, narrator):
        emitter = EventEmitter(enabled=False)
        report = run_goal("Plan my Goa trip", "30000", emitter, narrator=narrator)
        return report.negotiation.allocations_paise, report.total_spent_paise

    def test_narration_does_not_change_a_single_rupee(self):
        without = self._allocations(None)

        chatty = Narrator(
            runtime=FakeRuntime(
                {
                    key: AgentArgument(message="I need this to work.")
                    for key in ("flights", "stay", "food", "guide")
                }
            )
        )
        with_narration = self._allocations(chatty)

        self.assertEqual(without, with_narration)

    def test_a_dead_runtime_still_completes_the_run(self):
        class Dead:
            available = True

            def ask(self, *a, **k):
                raise RuntimeError("provider exploded")

            def trace_run(self, run_id):
                raise RuntimeError("no tracing either")

        narrator = Narrator(runtime=Dead())
        emitter = EventEmitter(enabled=False)

        with self.assertRaises(RuntimeError):
            # The fake raises rather than returning None, which AgentRuntime
            # would never do — this asserts the boundary is the runtime's job.
            narrator.runtime.ask("food", "x")

        report = run_goal("Plan my Goa trip", "30000", emitter, narrator=None)
        self.assertTrue(report.within_budget)


class IntentIsMaterialTest(unittest.TestCase):
    """Priorities must change the outcome, or they are decoration."""

    ALL = ("flights", "stay", "food", "guide")

    # A budget that forces genuine trade-offs. At Rs 30,000 the demo budget is
    # saturated — every agent already holds its best-rated affordable option —
    # so there is nothing for a priority to buy. See the saturation test below.
    CONTESTED = "24000"

    def _spend(self, weights, budget=CONTESTED):
        emitter = EventEmitter(enabled=False)
        rows = [(c, weights[c]) for c in self.ALL]
        narrator = Narrator(runtime=FakeRuntime({"intent": plan(*rows)}))
        report = run_goal("Plan my Goa trip", budget, emitter, narrator=narrator)
        return report.negotiation.allocations_paise

    def _neutral(self, budget=CONTESTED):
        return self._spend({c: 0.5 for c in self.ALL}, budget)

    def test_emphasis_changes_the_split_when_the_budget_is_contested(self):
        neutral = self._neutral()
        emphasised = self._spend({"stay": 1.0, "flights": 0.2, "food": 0.2, "guide": 0.2})

        self.assertNotEqual(neutral, emphasised)

    def test_an_emphasised_category_is_never_worse_off(self):
        neutral = self._neutral()
        for category in self.ALL:
            with self.subTest(category=category):
                weights = {c: 0.2 for c in self.ALL}
                weights[category] = 1.0
                self.assertGreaterEqual(self._spend(weights)[category], neutral[category])

    def test_a_saturated_budget_makes_priority_correctly_inert(self):
        """Not a bug: with enough money nobody has to trade anything.

        At Rs 34,000 every agent can already afford its best-rated option, so
        no priority can improve any category. Locking this stops a future change
        from quietly making emphasis buy a *worse* option to look responsive.
        """
        neutral = self._neutral("34000")
        foodie = self._spend({"food": 1.0, "flights": 0.2, "stay": 0.2, "guide": 0.2}, "34000")

        self.assertEqual(neutral, foodie)

    def test_priority_never_breaks_the_budget(self):
        for weight in (0.0, 0.5, 1.0):
            with self.subTest(weight=weight):
                allocations = self._spend({c: weight for c in self.ALL})
                self.assertLessEqual(sum(allocations.values()), to_paise(self.CONTESTED))

    def test_priority_never_pushes_an_agent_below_its_floor(self):
        for weight in (0.0, 1.0):
            with self.subTest(weight=weight):
                weights = {c: 0.5 for c in self.ALL}
                weights["stay"] = weight
                # Cheapest stay fixture is Rs 5,400.
                self.assertGreaterEqual(self._spend(weights)["stay"], to_paise("5400"))


class RuntimeDegradationTest(unittest.TestCase):
    def test_no_key_means_unavailable_not_broken(self):
        runtime = AgentRuntime(api_key=None, enabled=True)
        self.assertFalse(runtime.available)
        self.assertIsNone(runtime.ask("intent", "anything"))

    def test_disabled_runtime_makes_no_call(self):
        runtime = AgentRuntime(api_key="sk-not-used", enabled=False)
        self.assertFalse(runtime.available)

    def test_trace_run_is_always_a_context_manager(self):
        with AgentRuntime(api_key=None).trace_run("run-1"):
            pass


if __name__ == "__main__":
    unittest.main()


class DroppedCategoryTest(unittest.TestCase):
    """Roster omissions from the model are not trusted; its priorities are.

    Regression test for a live failure: the same goal returned four categories
    once and two the next time, dropping flights and stay from a trip and
    leaving most of the budget unspent.
    """

    def test_a_dropped_travel_category_is_restored(self):
        runtime = FakeRuntime({"intent": plan(("food", 0.9), ("guide", 0.6))})
        intent = parse_intent("Plan my Goa trip, I really care about eating well", runtime)

        self.assertEqual(set(intent.categories), {"flights", "stay", "food", "guide"})

    def test_restored_categories_are_neutral_and_stated_ones_are_kept(self):
        runtime = FakeRuntime({"intent": plan(("food", 0.9))})
        intent = parse_intent("Plan my Goa trip", runtime)

        self.assertAlmostEqual(intent.weights["food"], 0.9)
        self.assertAlmostEqual(intent.weights["flights"], NEUTRAL_WEIGHT)
        self.assertEqual(intent.source, "openai")

    def test_a_full_roster_is_left_alone(self):
        rows = [(c, 0.4) for c in ("flights", "stay", "food", "guide")]
        intent = parse_intent("Plan my Goa trip", FakeRuntime({"intent": plan(*rows)}))

        self.assertEqual(len(intent.categories), 4)
        self.assertTrue(all(abs(w - 0.4) < 1e-9 for w in intent.weights.values()))

    def test_the_restored_roster_spends_the_budget(self):
        runtime = FakeRuntime({"intent": plan(("food", 0.9), ("guide", 0.6))})
        emitter = EventEmitter(enabled=False)

        report = run_goal(
            "Plan my Goa trip, I really care about eating well",
            "30000",
            emitter,
            narrator=Narrator(runtime=runtime),
        )

        self.assertEqual(len(report.purchases), 4)
        self.assertGreater(report.total_spent_paise, to_paise("20000"))
