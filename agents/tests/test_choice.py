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


class DestinationAwarenessTest(unittest.TestCase):
    """Discovery used to ignore the goal entirely: a Jaipur request returned
    BLR-GOI flights and a hotel in Anjuna. That is worse than static — it
    claimed to have searched somewhere it had not."""

    def test_a_different_destination_returns_different_inventory(self):
        from humsafar.discovery import FixtureDiscovery

        goa = FixtureDiscovery().discover("flights", "Plan my Goa trip")
        jaipur = FixtureDiscovery().discover("flights", "Plan my Jaipur trip")

        self.assertIn("BLR-GOI", goa[0].description)
        self.assertIn("BLR-JAI", jaipur[0].description)

    def test_goa_stays_pinned_so_live_mandates_keep_resolving(self):
        from humsafar.discovery import FixtureDiscovery

        stay = FixtureDiscovery().discover("stay", "Plan my Goa trip")
        merchants = {o.merchant for o in stay}

        self.assertIn("Anjuna Beach Resort", merchants)
        self.assertIn("Taj Holiday Village", merchants)

    def test_every_mandate_backed_merchant_is_still_discoverable(self):
        """The four names the live Prava mandates are locked to.

        `listed` mandates are scoped to one merchant by exact name, so if any of
        these stops appearing, that agent's mint is refused with "No approved
        mandate registered for merchant" and the live run dies.

        The stay-only assertion above was not enough: three of these four can
        disappear while it still passes.
        """
        from humsafar.discovery import FixtureDiscovery

        provider = FixtureDiscovery(travel_mode="flight", stay_style="hotel")
        found = set()
        for category in ("flights", "stay", "food", "guide"):
            found |= {o.merchant for o in provider.discover(category, "Plan my Goa trip")}

        for merchant in (
            "Air India Express",
            "Anjuna Beach Resort",
            "Gunpowder Assagao",
            "Dudhsagar Day Trip",
        ):
            self.assertIn(merchant, found, f"{merchant!r} has no mandate-resolvable listing")

    def test_the_pin_needs_flight_and_hotel_and_says_so_when_it_does_not(self):
        """Documents the trap that silently broke live cards.

        `FixtureDiscovery` defaults to flight/hotel, so the pin fires and the
        test above passes. The CLI and the browser now default *both* to
        "compare", which misses the guard — discovery then generates names like
        "Goa Grand" that no mandate covers, and all four mints are refused.

        Nothing changed in `destinations.py` when that broke; a default moved
        somewhere else. This test fails loudly if the pin's conditions drift
        again, rather than leaving it to be rediscovered against live Prava.
        """
        from humsafar.discovery import FixtureDiscovery

        pinned = FixtureDiscovery(travel_mode="flight", stay_style="hotel")
        compare = FixtureDiscovery(travel_mode="compare", stay_style="compare")

        pinned_stay = {o.merchant for o in pinned.discover("stay", "Plan my Goa trip")}
        compare_stay = {o.merchant for o in compare.discover("stay", "Plan my Goa trip")}

        self.assertIn("Anjuna Beach Resort", pinned_stay)
        self.assertNotIn(
            "Anjuna Beach Resort",
            compare_stay,
            "compare mode now hits the pin — update the live-run instructions in "
            "destinations.py, which tell operators they must pass --travel-mode flight",
        )

    def test_the_same_destination_is_deterministic(self):
        from humsafar.discovery import FixtureDiscovery

        first = FixtureDiscovery().discover("stay", "trip to Udaipur")
        second = FixtureDiscovery().discover("stay", "trip to Udaipur")

        self.assertEqual([o.price_paise for o in first], [o.price_paise for o in second])

    def test_an_unknown_city_still_produces_a_runnable_roster(self):
        from humsafar.discovery import FixtureDiscovery

        for category in ("flights", "stay", "food", "guide"):
            options = FixtureDiscovery().discover(category, "trip to Ziro")
            self.assertTrue(options, f"{category} produced nothing")

    def test_the_journey_shortlist_matches_the_users_transport_choice(self):
        from humsafar.discovery import FixtureDiscovery

        train = FixtureDiscovery(travel_mode="train").discover("flights", "trip to Goa")
        compare = FixtureDiscovery(travel_mode="compare").discover("flights", "trip to Goa")

        self.assertTrue(all("Rail" in option.vendor for option in train))
        self.assertTrue(any("Rail" in option.vendor for option in compare))
        self.assertTrue(any("Air" in option.vendor or option.vendor == "IndiGo" for option in compare))
        self.assertTrue(all(option.source == "fixture" for option in compare))

    def test_groups_can_compare_whole_homes_with_multiple_hotel_rooms(self):
        from humsafar.discovery import FixtureDiscovery

        stays = FixtureDiscovery(
            travelers=6,
            rooms=3,
            stay_style="compare",
        ).discover("stay", "trip to Goa")

        self.assertTrue(any("Entire-home" in option.vendor or "Villa" in option.vendor for option in stays))
        self.assertTrue(any("3 rooms" in option.description for option in stays))
        self.assertTrue(all("6 guests" in option.description for option in stays))

    def test_group_transport_and_food_are_not_priced_as_solo_options(self):
        from humsafar.discovery import FixtureDiscovery

        solo = FixtureDiscovery(travel_mode="train", travelers=1).discover("flights", "trip to Jaipur")
        group_provider = FixtureDiscovery(travel_mode="train", travelers=6)
        group_journey = group_provider.discover("flights", "trip to Jaipur")
        group_food = group_provider.discover("food", "trip to Jaipur")

        self.assertGreater(group_journey[0].price_paise, solo[0].price_paise * 5.5)
        self.assertIn("6 travellers", group_journey[0].description)
        self.assertTrue(all("6 travellers" in option.description for option in group_food))

    def test_an_entire_home_preference_does_not_claim_live_airbnb_inventory(self):
        from humsafar.discovery import FixtureDiscovery

        stays = FixtureDiscovery(
            travelers=5,
            rooms=3,
            stay_style="home",
        ).discover("stay", "trip to Jaipur")

        self.assertTrue(all("whole" in option.description for option in stays))
        self.assertTrue(all(option.source == "fixture" for option in stays))
        self.assertNotIn("Airbnb", " ".join(option.vendor for option in stays))


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


class NonTravelGoalTest(unittest.TestCase):
    """Regression: `categories_for_goal` lost its `text` local when
    `is_travel_goal` was extracted, so every non-travel goal raised NameError
    and killed the run. Every existing test used a travel goal, so nothing
    caught it — a judge typing "furnish my apartment" would have seen a crash.
    """

    def _run(self, goal):
        from humsafar.events import EventEmitter
        from humsafar.orchestrator import run_goal

        return run_goal(goal, "20000", EventEmitter(enabled=False))

    def test_a_non_travel_goal_completes_instead_of_crashing(self):
        for goal in ("Furnish my first apartment", "Throw a birthday party", "Stock my kitchen"):
            with self.subTest(goal=goal):
                report = self._run(goal)
                self.assertTrue(report.purchases)
                self.assertTrue(report.within_budget)

    def test_a_narrow_goal_fields_a_narrow_roster(self):
        report = self._run("A food tour of Lisbon")
        self.assertEqual({p.agent for p in report.purchases}, {"food"})

    def test_an_empty_goal_does_not_crash(self):
        self.assertTrue(self._run("").purchases)


class NoDestinationLeakTest(unittest.TestCase):
    """No real venue from one city may be offered in another.

    A Shillong trip used to recommend Gunpowder and Thalassa — real Goa
    restaurants, hardcoded into the generated inventory for every destination.
    Beyond looking like a demo scripted for one city, it asserts to the user
    that a specific real restaurant exists somewhere it does not, which is the
    same class of claim as inventing a rating.

    Goa is exempt: it returns the pinned GOA_INVENTORY, whose venues are real
    Goa places and are what the live Prava mandates are scoped to.
    """

    GOA_ONLY = ("Gunpowder", "Thalassa", "Local shacks", "Anjuna", "Vagator", "Zostel")

    def test_goa_venues_do_not_appear_in_other_cities(self):
        from humsafar.discovery import FixtureDiscovery

        for goal in ("trip to Shillong", "trip to Udaipur", "trip to Jaipur", "trip to Ziro"):
            for category in ("flights", "stay", "food", "guide"):
                for option in FixtureDiscovery().discover(category, goal):
                    for leaked in self.GOA_ONLY:
                        with self.subTest(goal=goal, category=category, venue=option.vendor):
                            self.assertNotIn(
                                leaked.lower(),
                                f"{option.vendor} {option.merchant}".lower(),
                                f"{goal}: {option.vendor!r} leaks a Goa-specific name",
                            )

    def test_goa_itself_still_returns_its_real_venues(self):
        from humsafar.discovery import FixtureDiscovery

        provider = FixtureDiscovery(travel_mode="flight", stay_style="hotel")
        food = {o.vendor for o in provider.discover("food", "Plan my Goa trip")}

        self.assertIn("Gunpowder Assagao", food)
