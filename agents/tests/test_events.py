"""Schema tests.

These exist because a malformed event is a 400 from the backend at the worst
possible moment. The rules mirrored here come from
`backend/src/events/eventSchema.js`; if that file changes, this one and
INTERFACES.md change with it.
"""

import unittest

from humsafar.events import EventEmitter, EventSchemaError, now_iso, validate_event, wire_allocations
from humsafar.money import to_paise


class WireAllocationsTest(unittest.TestCase):
    def test_fills_every_locked_category(self):
        wire = wire_allocations({"flights": to_paise("100.50")})

        self.assertEqual(set(wire), {"flights", "stay", "food", "guide"})
        self.assertEqual(wire["flights"], 100.50)
        self.assertEqual(wire["stay"], 0.0)

    def test_passes_through_extra_categories(self):
        wire = wire_allocations({"flights": 100, "gifts": 200})
        self.assertEqual(wire["gifts"], 2.0)

    def test_output_is_accepted_by_the_validator(self):
        event = {
            "type": "split_update",
            "allocations": wire_allocations({"flights": 1, "stay": 2, "food": 3, "guide": 4}),
            "totalBudget": 100.0,
            "round": 1,
        }
        self.assertIsNone(validate_event(event))


class ValidateEventTest(unittest.TestCase):
    def test_accepts_every_event_the_emitter_produces(self):
        emitter = EventEmitter(enabled=False)
        allocations = {"flights": to_paise(1), "stay": to_paise(2), "food": to_paise(3), "guide": to_paise(4)}

        emitter.agent_message("mediator", "settled")
        emitter.split_update(allocations, to_paise(100), 1)
        emitter.approval_requested(allocations)
        emitter.approval_given()
        emitter.card_issued("stay", "instr_1", to_paise(50))
        emitter.purchase_result("stay", "success", to_paise(40), "duffel-taj", "booked")
        emitter.blocked_attempt("stay", to_paise(90), to_paise(50), "over cap")
        emitter.renegotiation_triggered("stay", "booking failed")
        emitter.final_receipt([], to_paise(40), to_paise(100))

        self.assertEqual(len(emitter.sent), 9)
        for event in emitter.sent:
            self.assertIsNone(validate_event(event), event)

    def test_rejects_an_unknown_agent(self):
        self.assertIsNotNone(
            validate_event(
                {"type": "agent_message", "agent": "hotel", "message": "hi", "timestamp": now_iso()}
            )
        )

    def test_rejects_a_missing_allocation_key(self):
        self.assertIsNotNone(
            validate_event(
                {
                    "type": "split_update",
                    "allocations": {"flights": 1, "stay": 2, "food": 3},
                    "totalBudget": 10,
                    "round": 1,
                }
            )
        )

    def test_rejects_round_zero_and_non_integers(self):
        for bad in (0, -1, 1.5, "1"):
            with self.subTest(round=bad):
                self.assertIsNotNone(
                    validate_event(
                        {
                            "type": "split_update",
                            "allocations": {"flights": 1, "stay": 1, "food": 1, "guide": 1},
                            "totalBudget": 10,
                            "round": bad,
                        }
                    )
                )

    def test_rejects_a_zero_amount_cap(self):
        # positiveNumber, not nonNegativeNumber — a card capped at zero is a bug.
        self.assertIsNotNone(
            validate_event(
                {"type": "card_issued", "agent": "stay", "cardId": "c1", "amountCap": 0}
            )
        )

    def test_rejects_booleans_where_numbers_belong(self):
        # JS treats true as 1 under Number.isFinite only after coercion; the
        # backend uses Number.isFinite directly, which rejects booleans.
        self.assertIsNotNone(
            validate_event(
                {
                    "type": "purchase_result",
                    "agent": "stay",
                    "status": "success",
                    "amount": True,
                    "merchant": "m",
                    "details": "d",
                }
            )
        )

    def test_rejects_an_unsupported_type(self):
        self.assertIsNotNone(validate_event({"type": "agent_thought"}))
        self.assertIsNotNone(validate_event(None))

    def test_rejects_a_bad_timestamp(self):
        self.assertIsNotNone(
            validate_event({"type": "approval_given", "timestamp": "yesterday"})
        )


class EmitterBehaviourTest(unittest.TestCase):
    def test_a_bad_shape_raises_rather_than_being_posted(self):
        emitter = EventEmitter(enabled=False)
        with self.assertRaises(EventSchemaError):
            emitter.emit({"type": "agent_message", "agent": "nope", "message": "x"})

    def test_an_unreachable_backend_degrades_instead_of_raising(self):
        # Port 1 is reserved and refuses instantly, so this stays fast.
        emitter = EventEmitter(base_url="http://127.0.0.1:1", timeout=0.5)
        emitter.agent_message("orchestrator", "still running")

        self.assertEqual(emitter.delivery_failures, 1)
        self.assertEqual(len(emitter.sent), 1)

    def test_timestamps_are_iso_and_utc(self):
        stamp = now_iso()
        self.assertTrue(stamp.endswith("Z"))
        self.assertIsNone(validate_event({"type": "approval_given", "timestamp": stamp}))


if __name__ == "__main__":
    unittest.main()
