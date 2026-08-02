import unittest

from humsafar.cards import StubScopedCardClient, load_mandate_registry
from humsafar.checkout import SimulatedCheckout
from humsafar.events import EventEmitter, validate_event
from humsafar.guardian import Guardian
from humsafar.models import Option
from humsafar.money import to_paise
from humsafar.orchestrator import run_goal

GOAL = "Plan my Goa trip"


def run(budget="30000", **kwargs):
    emitter = EventEmitter(enabled=False)
    report = run_goal(GOAL, budget, emitter, **kwargs)
    return report, emitter


def types(emitter):
    return [event["type"] for event in emitter.sent]


class EndToEndTest(unittest.TestCase):
    def test_full_run_buys_every_category_within_budget(self):
        report, emitter = run()

        self.assertTrue(report.approved)
        self.assertEqual(len(report.purchases), 4)
        self.assertTrue(all(p.status == "success" for p in report.purchases))
        self.assertTrue(report.within_budget)
        self.assertLessEqual(report.total_spent_paise, to_paise("30000"))

    def test_every_emitted_event_is_valid(self):
        _, emitter = run(overspend_agent="stay", fail_agent="guide")

        self.assertGreater(len(emitter.sent), 20)
        for event in emitter.sent:
            self.assertIsNone(validate_event(event), event)

    def test_the_flow_happens_in_the_right_order(self):
        _, emitter = run()
        sequence = types(emitter)

        self.assertLess(
            sequence.index("approval_requested"),
            sequence.index("card_issued"),
            "a card was minted before approval was requested",
        )
        self.assertLess(sequence.index("approval_given"), sequence.index("card_issued"))
        self.assertLess(sequence.index("choice_made"), sequence.index("approval_requested"))
        self.assertEqual(sequence[-1], "final_receipt")

    def test_nothing_is_minted_without_approval(self):
        report, emitter = run(auto_approve=False)

        self.assertFalse(report.approved)
        self.assertNotIn("card_issued", types(emitter))
        self.assertEqual(report.purchases, [])

    def test_receipt_totals_match_the_purchases(self):
        report, emitter = run()
        receipt = emitter.sent[-1]

        self.assertEqual(receipt["type"], "final_receipt")
        self.assertAlmostEqual(
            receipt["totalSpent"], sum(p["amount"] for p in receipt["purchases"]), places=2
        )

    def test_no_card_token_ever_reaches_an_event(self):
        _, emitter = run(overspend_agent="stay", fail_agent="guide")
        blob = repr(emitter.sent)

        self.assertNotIn("cardToken", blob)
        self.assertNotIn("stub-token", blob)

    def test_user_scope_removes_an_agent_from_negotiation_and_checkout(self):
        report, emitter = run(categories=("flights", "stay", "food"))

        self.assertEqual({purchase.agent for purchase in report.purchases}, {"flights", "stay", "food"})
        self.assertNotIn("guide", report.negotiation.allocations_paise)
        messages = [event for event in emitter.sent if event["type"] == "agent_message"]
        self.assertFalse(any(event["agent"] == "guide" for event in messages))

    def test_advisory_food_reserves_budget_without_minting_or_booking(self):
        cards = StubScopedCardClient()
        report, emitter = run(
            categories=("flights", "stay", "food"),
            advisory_categories=("food",),
            card_client=cards,
        )

        food = next(purchase for purchase in report.purchases if purchase.agent == "food")
        self.assertEqual(food.amount_paise, 0)
        self.assertEqual(food.outcome, "advisory")
        self.assertIn("No card was minted", food.detail)
        self.assertEqual(len(cards.minted), 2)
        self.assertFalse(any(
            event["type"] == "card_issued" and event["agent"] == "food"
            for event in emitter.sent
        ))
        approval = next(event for event in emitter.sent if event["type"] == "approval_requested")
        self.assertGreater(approval["allocations"]["food"], 0)

    def test_advisory_guide_is_not_described_as_a_food_reservation(self):
        report, _ = run(
            categories=("stay", "guide"),
            advisory_categories=("guide",),
        )

        guide = next(purchase for purchase in report.purchases if purchase.agent == "guide")
        self.assertEqual(guide.outcome, "advisory")
        self.assertIn("activity suggestions", guide.detail)
        self.assertNotIn("restaurant", guide.detail)


class OverspendTest(unittest.TestCase):
    def test_an_over_slice_charge_is_refused(self):
        report, emitter = run(overspend_agent="stay")

        self.assertEqual(len(report.blocked), 1)
        self.assertIn("blocked_attempt", types(emitter))

        blocked = next(e for e in emitter.sent if e["type"] == "blocked_attempt")
        self.assertGreater(blocked["attemptedAmount"], blocked["cap"])

    def test_the_refusal_does_not_add_to_what_was_spent(self):
        report, _ = run(overspend_agent="stay")

        self.assertTrue(report.within_budget)
        self.assertEqual(len([p for p in report.purchases if p.status == "success"]), 4)

    def test_a_stub_refusal_is_labelled_as_simulated(self):
        # The stub must never be mistaken for card-network enforcement.
        _, emitter = run(overspend_agent="stay")
        blocked = next(e for e in emitter.sent if e["type"] == "blocked_attempt")

        self.assertIn("simulated", blocked["reason"].lower())


class RecoveryTest(unittest.TestCase):
    def test_a_failed_booking_renegotiates_only_its_own_slice(self):
        report, emitter = run(fail_agent="guide")

        self.assertEqual(report.renegotiated, ["guide"])
        self.assertIn("renegotiation_triggered", types(emitter))

        others = [p for p in report.purchases if p.agent != "guide"]
        self.assertTrue(all(p.status == "success" for p in others), "an unrelated slice was redone")
        event_types = types(emitter)
        self.assertEqual(event_types.count("approval_requested"), 2)
        renegotiated_at = event_types.index("renegotiation_triggered")
        second_approval_at = event_types.index("approval_requested", renegotiated_at)
        last_card_at = len(event_types) - 1 - event_types[::-1].index("card_issued")
        self.assertLess(second_approval_at, last_card_at)

    def test_recovery_stays_inside_the_budget(self):
        report, _ = run(fail_agent="stay")
        self.assertTrue(report.within_budget)

    def test_a_recovered_purchase_says_so(self):
        report, _ = run(fail_agent="guide")
        guide = next(p for p in report.purchases if p.agent == "guide")

        self.assertEqual(guide.status, "success")
        self.assertIn("Recovered", guide.detail)


class CredentialCeilingTest(unittest.TestCase):
    """What is minted must equal what the receipt says was spent.

    An audit flagged `mint(slice)` against `buy(price)` as a live money bug: the
    mandate charged more than the receipt showed. It is not — a sweep of
    Rs 13,000 to Rs 200,000 across the converged, recovery and forced-compromise
    paths found zero runs where the two differed, because allocation already
    clamps every slice to the price of the option that slice will buy. The
    equality held by construction, not by intent.

    That is precisely why it is worth a test. An invariant nothing asserts is
    one refactor away from being false, and the first place it would break is
    live Duffel inventory, where prices do not line up with allocation as
    neatly as fixtures do. Minting the price rather than the slice makes the
    credential least-privilege by design instead of by coincidence.

    The mandate ceiling is unaffected and stays at the slice — that is the cap
    the over-cap proof is fired against.
    """

    def _mints(self, **kwargs):
        cards = StubScopedCardClient()
        report, emitter = run(card_client=cards, checkout=SimulatedCheckout(), **kwargs)
        return report, emitter, dict(cards.minted)

    def test_the_credential_matches_what_was_actually_spent(self):
        report, _, minted = self._mints()

        for purchase in report.purchases:
            if purchase.status != "success":
                continue
            self.assertEqual(
                minted[purchase.merchant],
                purchase.amount_paise,
                f"{purchase.agent}: minted {minted[purchase.merchant]} but spent "
                f"{purchase.amount_paise} — the mandate and the receipt disagree",
            )

    def test_it_holds_through_a_recovery_too(self):
        report, _, minted = self._mints(fail_agent="guide")

        guide = next(p for p in report.purchases if p.agent == "guide")
        self.assertEqual(guide.status, "success")
        self.assertEqual(minted[guide.merchant], guide.amount_paise)

    def test_a_credential_never_exceeds_the_mandate_it_is_drawn_from(self):
        _, emitter, _ = self._mints()

        issued = [e for e in emitter.sent if e["type"] == "card_issued"]
        self.assertTrue(issued)
        for event in issued:
            # Both ceilings are now on the wire. They are equal today; the
            # assertion is `<=` because that is the guarantee, and an equality
            # assertion would fail the day allocation legitimately leaves slack.
            self.assertLessEqual(event["amountCap"], event["mandateCap"])
            self.assertIsNone(validate_event(event), event)


class TightBudgetTest(unittest.TestCase):
    def test_a_budget_below_the_floor_never_overspends(self):
        report, emitter = run(budget="9000")

        self.assertTrue(report.within_budget)
        for event in emitter.sent:
            self.assertIsNone(validate_event(event), event)

    def test_an_unbuyable_slice_is_reported_not_forced(self):
        report, _ = run(budget="9000")
        self.assertTrue(any(p.status == "failed" for p in report.purchases))


class CheckoutLabellingTest(unittest.TestCase):
    def test_simulated_checkout_never_claims_a_live_order(self):
        report, _ = run()
        for purchase in report.purchases:
            self.assertEqual(purchase.source, "fixture")
            self.assertIn("not a live merchant order", purchase.detail)

    def test_a_failed_booking_says_no_order_was_placed(self):
        checkout = SimulatedCheckout(fail_categories=("guide",))
        option = Option("guide", "V", "d", to_paise(100), 4.0, "fixture", "m")
        card = StubScopedCardClient().mint("m", to_paise(100))

        result = checkout.pay(option, card)

        self.assertFalse(result.ok)
        self.assertIn("no live order was placed", result["detail"])


class StubCardTest(unittest.TestCase):
    def test_the_first_cap_becomes_the_ceiling_for_that_merchant(self):
        client = StubScopedCardClient()

        first = client.mint("Taj Holiday Village", to_paise("5000"))
        over = client.mint("Taj Holiday Village", to_paise("8000"))
        under = client.mint("Taj Holiday Village", to_paise("4000"))

        self.assertTrue(first.issued)
        self.assertFalse(over.issued)
        self.assertTrue(under.issued)

    def test_the_token_is_redacted_when_printed(self):
        card = StubScopedCardClient().mint("m", to_paise(100))

        self.assertNotIn(card["cardToken"], repr(card))
        self.assertNotIn(card["cardToken"], str(card.safe()))

    def test_a_non_positive_cap_is_refused(self):
        self.assertFalse(StubScopedCardClient().mint("m", 0).issued)


class MandateRegistryTest(unittest.TestCase):
    def test_inverts_the_backend_mapping(self):
        registry = load_mandate_registry('{"mandate_1": "Taj Holiday Village", "mandate_2": "GoGoa Bikes"}')

        self.assertEqual(registry["taj holiday village"], "mandate_1")
        self.assertEqual(registry["gogoa bikes"], "mandate_2")

    def test_bad_json_degrades_to_empty(self):
        self.assertEqual(load_mandate_registry("{not json"), {})


class GuardianTest(unittest.TestCase):
    def test_an_off_category_purchase_is_blocked_in_software(self):
        guardian = Guardian({"m"})
        wrong = Option("food", "V", "d", to_paise(100), 4.0, "fixture", "m")

        verdict = guardian.check("stay", wrong, to_paise(500), GOAL)

        self.assertFalse(verdict.allowed)
        self.assertEqual(verdict.layer, "guardian")
        self.assertIn("software layer", verdict.reason)

    def test_an_unknown_merchant_is_blocked(self):
        guardian = Guardian({"known"})
        option = Option("stay", "V", "d", to_paise(100), 4.0, "fixture", "unknown")

        self.assertFalse(guardian.check("stay", option, to_paise(500), GOAL).allowed)

    def test_an_over_cap_amount_is_deliberately_left_to_the_card_network(self):
        """This must not become a software block — see guardian.py."""
        guardian = Guardian({"m"})
        option = Option("stay", "V", "d", to_paise("9000"), 4.0, "fixture", "m")

        verdict = guardian.check("stay", option, to_paise("100"), GOAL)

        self.assertTrue(verdict.allowed)
        self.assertEqual(verdict.layer, "none")


if __name__ == "__main__":
    unittest.main()
