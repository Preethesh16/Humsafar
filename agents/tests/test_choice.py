"""The §6 human choice step.

The honesty rules are the point: an unrated list must never be sold as
"top rated", and a timed-out auto-pick must never be reported as a human
decision.
"""

import unittest

from humsafar.choice import (
    AutoChoice,
    Choice,
    option_id,
    rank_options,
    shortlist,
    to_wire,
)
from humsafar.events import EventEmitter
from humsafar.models import Option
from humsafar.money import to_paise
from humsafar.orchestrator import Orchestrator, RunConfig


def opt(vendor, price, rating=0.0, source="fixture", category="stay"):
    return Option(category, vendor, "desc", to_paise(price), rating, source, vendor)


class RankingHonestyTest(unittest.TestCase):
    def test_a_fully_rated_list_ranks_by_rating(self):
        ordered, basis = rank_options([opt("A", 100, 4.1), opt("B", 200, 4.8)])

        self.assertEqual(basis, "rating")
        self.assertEqual(ordered[0].vendor, "B")

    def test_an_unrated_list_ranks_by_price_and_says_so(self):
        """Duffel flight offers carry no rating. Calling that 'top rated' is a
        false claim, so the basis must switch."""
        ordered, basis = rank_options([opt("A", 900), opt("B", 300)])

        self.assertEqual(basis, "price")
        self.assertEqual(ordered[0].vendor, "B")

    def test_a_partially_rated_list_falls_back_to_price(self):
        _, basis = rank_options([opt("A", 100, 4.5), opt("B", 200)])
        self.assertEqual(basis, "price")

    def test_an_empty_list_is_price_ranked_not_crashed_on(self):
        ordered, basis = rank_options([])
        self.assertEqual((ordered, basis), ([], "price"))


class ShortlistTest(unittest.TestCase):
    def test_only_affordable_options_are_offered(self):
        picks = shortlist([opt("cheap", 100), opt("dear", 9000)], to_paise(500))

        self.assertEqual([o.vendor for o in picks], ["cheap"])

    def test_nothing_affordable_yields_nothing(self):
        self.assertEqual(shortlist([opt("dear", 9000)], to_paise(100)), [])


class WirePayloadTest(unittest.TestCase):
    def test_an_unrated_option_sends_null_not_zero(self):
        """A 0.0 rating means 'genuinely unrated', not 'rated zero'. Sending 0
        would let a UI render it as a real score."""
        payload = to_wire("flights", [opt("IndiGo", 6500, 0.0, "live")], to_paise(9800), 45)
        row = payload["options"][0]

        self.assertIsNone(row["rating"])
        self.assertIsNone(row["ratingBasis"])

    def test_a_fixture_score_is_labelled_as_a_fixture_score(self):
        payload = to_wire("stay", [opt("Anjuna", 11200, 4.5, "fixture")], to_paise(11200), 45)
        self.assertEqual(payload["options"][0]["ratingBasis"], "fixture-score")

    def test_live_options_are_marked_test_inventory(self):
        """Duffel test mode is a genuine live call returning test inventory.
        Calling it live alone would imply real bookable market data."""
        payload = to_wire("flights", [opt("IndiGo", 6500, 0.0, "live")], to_paise(9800), 45)
        self.assertEqual(payload["options"][0]["environment"], "test")

    def test_every_offered_price_fits_the_slice(self):
        picks = shortlist([opt("a", 100), opt("b", 400), opt("c", 9000)], to_paise(500))
        payload = to_wire("stay", picks, to_paise(500), 45)

        self.assertTrue(all(o["price"] <= payload["slice"] for o in payload["options"]))

    def test_option_ids_are_stable_and_unique(self):
        options = [opt("A", 100), opt("B", 200)]
        ids = [option_id("stay", o) for o in options]

        self.assertEqual(len(set(ids)), 2)
        self.assertEqual(ids[0], option_id("stay", options[0]))


class AutoChoiceTest(unittest.TestCase):
    def test_it_never_claims_a_human_chose(self):
        picked = AutoChoice().choose("stay", [opt("A", 100, 4.0)], to_paise(500))

        self.assertEqual(picked.chosen_by, "agent-timeout")
        self.assertFalse(picked.by_user)

    def test_nothing_affordable_returns_none(self):
        self.assertIsNone(AutoChoice().choose("stay", [opt("A", 9000)], to_paise(100)))


class _ScriptedChoice:
    """Picks a named vendor, as a user would."""

    interactive = True

    def __init__(self, vendor, chosen_by="user"):
        self.vendor = vendor
        self.chosen_by = chosen_by

    def choose(self, category, options, slice_paise):
        picks = shortlist(options, slice_paise)
        match = next((o for o in picks if o.vendor == self.vendor), None)
        return Choice(match, self.chosen_by) if match else None


class ChoiceDrivesThePurchaseTest(unittest.TestCase):
    def _run(self, choice):
        emitter = EventEmitter(enabled=False)
        report = Orchestrator(emitter, choice=choice).run(
            RunConfig(goal="Plan my Goa trip", budget_paise=to_paise(30000))
        )
        return report, emitter

    def test_the_user_choice_is_what_gets_bought(self):
        report, emitter = self._run(_ScriptedChoice("The Hosteller"))

        stay = next(p for p in report.purchases if p.agent == "stay")
        self.assertIn("The Hosteller", stay.description)
        self.assertTrue(report.within_budget)

    def test_a_choice_made_event_records_who_decided(self):
        _, emitter = self._run(_ScriptedChoice("The Hosteller"))

        made = [e for e in emitter.sent if e["type"] == "choice_made"]
        self.assertTrue(made)
        self.assertEqual({e["chosenBy"] for e in made}, {"user"})

    def test_a_timeout_is_recorded_as_agent_not_user(self):
        _, emitter = self._run(_ScriptedChoice("The Hosteller", chosen_by="agent-timeout"))

        made = next(e for e in emitter.sent if e["type"] == "choice_made")
        self.assertEqual(made["chosenBy"], "agent-timeout")

    def test_a_user_choice_can_never_exceed_its_slice(self):
        report, _ = self._run(_ScriptedChoice("Taj Holiday Village"))  # Rs 16,000

        stay_slice = report.negotiation.allocations_paise["stay"]
        stay = next(p for p in report.purchases if p.agent == "stay")
        self.assertLessEqual(stay.amount_paise, stay_slice)
        self.assertNotIn("Taj", stay.description)

    def test_default_behaviour_is_unchanged_without_a_choice_gate(self):
        emitter = EventEmitter(enabled=False)
        report = Orchestrator(emitter).run(
            RunConfig(goal="Plan my Goa trip", budget_paise=to_paise(30000))
        )
        self.assertEqual(report.total_spent_paise, to_paise("28800"))


if __name__ == "__main__":
    unittest.main()
