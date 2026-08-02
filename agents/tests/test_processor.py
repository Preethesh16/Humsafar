"""Step 4 of Prava's end-to-end sandbox flow.

Prava's own definition (2026-08-02): the card must be presented at a real
merchant, and the decline that follows IS the expected result. These tests
guard the one thing that would make that worthless — an outcome the code
assumed rather than observed.
"""

import unittest

from humsafar.cards import StubScopedCardClient
from humsafar.checkout import LiveCheckout
from humsafar.models import Option
from humsafar.money import to_paise
from humsafar.processor import DeclinedByTestCard, ManualProcessor, MerchantAttempt
from humsafar.reporting import NullReporter


def option(category="stay"):
    return Option(category, "Anjuna", "room", to_paise(11200), 4.5, "fixture", "Anjuna")


def card():
    c = StubScopedCardClient().mint("Anjuna", to_paise(11200))
    c["mandateId"] = "mdt_test"
    return c


class MerchantAttemptTest(unittest.TestCase):
    def test_an_unattributed_checkout_is_rejected(self):
        with self.assertRaises(ValueError):
            MerchantAttempt(merchant="  ", outcome="DECLINED", observed="card declined")

    def test_an_unrecorded_message_is_rejected(self):
        """A claim about a checkout is worth nothing without what it said."""
        with self.assertRaises(ValueError):
            MerchantAttempt(merchant="Shop", outcome="DECLINED", observed="")

    def test_an_invented_outcome_is_rejected(self):
        for bad in ("declined", "ok", "PENDING", ""):
            with self.assertRaises(ValueError):
                MerchantAttempt(merchant="Shop", outcome=bad, observed="x")


class ManualProcessorTest(unittest.TestCase):
    def test_a_missing_observation_raises_rather_than_assuming(self):
        """The failure mode this whole module exists to prevent."""
        with self.assertRaises(LookupError):
            ManualProcessor().charge(option(), card())

    def test_a_recorded_decline_is_reported_verbatim(self):
        processor = ManualProcessor()
        processor.record(
            "stay",
            MerchantAttempt("Decathlon", "DECLINED", "Your card was declined.", "att_9"),
        )

        outcome, detail = processor.charge(option(), card())

        self.assertEqual(outcome, "DECLINED")
        self.assertIn("Decathlon", detail)
        self.assertIn("Your card was declined.", detail)
        self.assertIn("att_9", detail)


class LiveCheckoutWithProcessorTest(unittest.TestCase):
    def test_a_declined_merchant_result_is_reported_to_prava(self):
        reporter = NullReporter()
        checkout = LiveCheckout(
            reporter=reporter,
            processor=DeclinedByTestCard("Decathlon", "Card declined — test card"),
        )

        result = checkout.pay(option(), card())

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["source"], "sandbox")
        self.assertIn("Decathlon", result["detail"])
        self.assertEqual([c["outcome"] for c in reporter.calls], ["DECLINED"])

    def test_no_processor_still_reports_nothing_and_claims_nothing(self):
        """Unchanged behaviour: without a merchant attempt, say so."""
        reporter = NullReporter()
        result = LiveCheckout(reporter=reporter).pay(option(), card())

        self.assertIn("NO merchant order", result["detail"])
        self.assertEqual(reporter.calls, [])

    def test_an_approved_result_is_only_ever_a_recorded_one(self):
        reporter = NullReporter()
        processor = ManualProcessor(
            {"stay": MerchantAttempt("Shop", "APPROVED", "Order confirmed", "ord_1")}
        )

        result = LiveCheckout(reporter=reporter, processor=processor).pay(option(), card())

        self.assertEqual(result["status"], "success")
        self.assertEqual([c["outcome"] for c in reporter.calls], ["APPROVED"])
        self.assertIn("Order confirmed", result["detail"])


if __name__ == "__main__":
    unittest.main()


class SimulatedMerchantTest(unittest.TestCase):
    """Prava's sanctioned route for steps 4-5: no sandbox merchant exists, so
    the merchant step is simulated. The parts either side are real."""

    def test_it_can_only_ever_decline(self):
        from humsafar.processor import SimulatedMerchant

        outcome, _ = SimulatedMerchant("Example Store").charge(option(), card())
        self.assertEqual(outcome, "DECLINED")

    def test_every_detail_says_simulated_and_names_the_merchant(self):
        from humsafar.processor import SimulatedMerchant

        _, detail = SimulatedMerchant("Example Store").charge(option(), card())
        self.assertIn("SIMULATED", detail)
        self.assertIn("Example Store", detail)
        self.assertIn("the storefront is not", detail)

    def test_a_blank_merchant_is_refused_even_simulated(self):
        from humsafar.processor import SimulatedMerchant

        with self.assertRaises(ValueError):
            SimulatedMerchant("   ")

    def test_it_reports_declined_to_prava(self):
        from humsafar.processor import SimulatedMerchant

        reporter = NullReporter()
        LiveCheckout(reporter=reporter, processor=SimulatedMerchant("Example Store")).pay(
            option(), card()
        )
        self.assertEqual([c["outcome"] for c in reporter.calls], ["DECLINED"])
