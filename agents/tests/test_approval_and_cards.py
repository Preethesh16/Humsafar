"""Priority 1: approval gate, mandate resolution, credential hygiene, cap proof.

The negative tests are the point here. Approval that can be bypassed, a
credential that leaks into a receipt, or a refusal mislabelled as cap
enforcement are all failures that would survive a happy-path suite.
"""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from humsafar.approval import ApprovalRecord, AutoApproval, PolledApproval
from humsafar.cards import CREDENTIAL_FIELDS, REDACTED, ScopedCardClient, StubScopedCardClient
from humsafar.events import EventEmitter
from humsafar.guardian import Guardian
from humsafar.money import to_paise
from humsafar.orchestrator import Orchestrator, RunConfig, run_goal

DEAD_URL = "http://127.0.0.1:1"


class _Routes(BaseHTTPRequestHandler):
    table: dict = {}
    seen: list = []

    def _reply(self):
        for prefix, (status, payload) in self.table.items():
            if self.path.startswith(prefix):
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        type(self).seen.append(("GET", self.path))
        self._reply()

    def do_POST(self):  # noqa: N802
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        type(self).seen.append(("POST", self.path))
        self._reply()

    def log_message(self, *args):
        pass


class ServerCase(unittest.TestCase):
    table: dict = {}

    def setUp(self):
        handler = type("H", (_Routes,), {"table": dict(self.table), "seen": []})
        self.handler = handler
        self.server = HTTPServer(("127.0.0.1", 0), handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


# --------------------------------------------------------------------------
# Item 9 — credential hygiene
# --------------------------------------------------------------------------


class CredentialRedactionTest(unittest.TestCase):
    def test_every_credential_field_is_redacted(self):
        card = StubScopedCardClient().mint("m", to_paise(100))
        safe = card.safe()

        for field in CREDENTIAL_FIELDS:
            with self.subTest(field=field):
                self.assertEqual(safe[field], REDACTED)
                self.assertNotEqual(safe[field], card[field])

    def test_identifiers_survive_redaction(self):
        # precaution.md permits recording these; the report endpoint needs them.
        safe = StubScopedCardClient().mint("m", to_paise(100)).safe()

        self.assertTrue(safe["cardId"])
        self.assertTrue(safe["transactionId"])

    def test_printing_a_card_never_shows_a_credential(self):
        card = StubScopedCardClient().mint("m", to_paise(100))

        for rendered in (repr(card), str(card), f"{card}"):
            for field in CREDENTIAL_FIELDS:
                self.assertNotIn(card[field], rendered)

    def test_no_credential_field_reaches_any_event(self):
        emitter = EventEmitter(enabled=False)
        run_goal("Plan my Goa trip", "30000", emitter, overspend_agent="stay", fail_agent="guide")

        blob = json.dumps(emitter.sent)
        for needle in ("stub-token", "dynamicCvv", "cardToken", "expiryMonth"):
            with self.subTest(needle=needle):
                self.assertNotIn(needle, blob)


# --------------------------------------------------------------------------
# Item 6 — the cap proof
# --------------------------------------------------------------------------


class CapProofOrderingTest(unittest.TestCase):
    def test_the_over_cap_attempt_precedes_that_agents_own_mint(self):
        """Otherwise a max_charges:1 mandate is already spent and the refusal
        proves an exhausted use limit, not an amount cap."""
        emitter = EventEmitter(enabled=False)
        run_goal("Plan my Goa trip", "30000", emitter, overspend_agent="stay")

        blocked = next(
            i
            for i, e in enumerate(emitter.sent)
            if e["type"] == "blocked_attempt" and e["agent"] == "stay"
        )
        mints = [
            i
            for i, e in enumerate(emitter.sent)
            if e["type"] == "card_issued" and e["agent"] == "stay"
        ]

        self.assertTrue(mints, "stay never minted a card")
        self.assertTrue(all(blocked < m for m in mints))

    def test_the_attempt_targets_the_merchant_being_bought_from(self):
        """Aimed anywhere else it would be refused as MANDATE_MERCHANT_NOT_ALLOWED
        — a real refusal, but for entirely the wrong reason."""

        class Recording(StubScopedCardClient):
            def __init__(self):
                super().__init__()
                self.attempts = []

            def mint(self, merchant, amount_cap_paise):
                self.attempts.append((merchant, amount_cap_paise))
                return super().mint(merchant, amount_cap_paise)

        client = Recording()
        emitter = EventEmitter(enabled=False)
        report = Orchestrator(emitter, card_client=client).run(
            RunConfig(
                goal="Plan my Goa trip",
                budget_paise=to_paise(30000),
                overspend_agent="stay",
            )
        )

        stay = next(p for p in report.purchases if p.agent == "stay")
        slice_paise = report.negotiation.allocations_paise["stay"]
        over_cap = [
            merchant for merchant, amount in client.attempts if amount > slice_paise
        ]

        self.assertEqual(len(report.blocked), 1)
        self.assertEqual(over_cap, [stay.merchant])

    def test_the_purchase_still_succeeds_after_the_refused_attempt(self):
        report = run_goal(
            "Plan my Goa trip", "30000", EventEmitter(enabled=False), overspend_agent="stay"
        )

        stay = next(p for p in report.purchases if p.agent == "stay")
        self.assertEqual(stay.status, "success")
        self.assertTrue(report.within_budget)


class CapClassificationTest(unittest.TestCase):
    def test_only_threshold_exceeded_is_called_cap_enforcement(self):
        reason = Guardian.describe_card_block(
            "Stay Agent", to_paise("17920"), to_paise("11200"), "THRESHOLD_EXCEEDED"
        )

        self.assertIn("Blocked at the card level", reason)
        self.assertIn("THRESHOLD_EXCEEDED", reason)

    def test_other_refusals_are_explicitly_not_cap_enforcement(self):
        for code in ("MANDATE_NOT_ACTIVE", "MANDATE_MERCHANT_NOT_ALLOWED", "TRIES_EXHAUSTED", ""):
            with self.subTest(code=code):
                reason = Guardian.describe_card_block(
                    "Stay Agent", to_paise("17920"), to_paise("11200"), code
                )
                self.assertIn("NOT by the amount cap", reason)
                self.assertIn("must not be presented as the proof shot", reason)
                self.assertNotIn("Blocked at the card level", reason)

    def test_the_stub_reports_a_structured_code(self):
        client = StubScopedCardClient()
        client.authorize("m", to_paise("100"))

        refused = client.mint("m", to_paise("500"))

        self.assertFalse(refused.issued)
        self.assertEqual(refused.error_code, "THRESHOLD_EXCEEDED")
        self.assertIn("simulated", refused["error"])


# --------------------------------------------------------------------------
# Item 7 — mandate resolution
# --------------------------------------------------------------------------


class MandateResolverTest(ServerCase):
    table = {
        "/api/prava/mandates/resolve": (
            200,
            {"data": {"mandateId": "mandate_live_1", "merchant": "Taj Holiday Village"}, "source": "sandbox"},
        ),
        "/api/scoped-cards": (
            201,
            {
                "cardId": "instr_1",
                "cardToken": "tok",
                "transactionId": "txn_1",
                "dynamicCvv": "123",
                "expiryMonth": "12",
                "expiryYear": "30",
                "merchant": "Taj Holiday Village",
                "amountCap": 100.0,
                "status": "issued",
                "source": "sandbox",
            },
        ),
    }

    def test_the_backend_resolver_is_used_before_the_local_registry(self):
        client = ScopedCardClient(base_url=self.url, registry={})

        card = client.mint("Taj Holiday Village", to_paise(100))

        self.assertTrue(card.issued)
        self.assertTrue(any("resolve" in path for _, path in self.handler.seen))


class MandateResolverFallbackTest(unittest.TestCase):
    def test_an_unreachable_backend_falls_back_to_the_local_registry(self):
        client = ScopedCardClient(
            base_url=DEAD_URL, registry={"taj holiday village": "mandate_local"}, timeout=0.5
        )
        self.assertEqual(client._resolve_mandate("Taj Holiday Village"), "mandate_local")

    def test_an_unknown_merchant_refuses_to_mint(self):
        client = ScopedCardClient(base_url=DEAD_URL, registry={}, timeout=0.5)

        card = client.mint("nobody", to_paise(100))

        self.assertFalse(card.issued)
        self.assertIn("No approved mandate", card["error"])


# --------------------------------------------------------------------------
# Item 8 — the approval gate
# --------------------------------------------------------------------------


class AutoApprovalTest(unittest.TestCase):
    def test_it_declares_itself_non_human(self):
        self.assertFalse(AutoApproval().requires_human)

    def test_the_run_says_no_human_decision_was_taken(self):
        emitter = EventEmitter(enabled=False)
        run_goal("Plan my Goa trip", "30000", emitter)

        messages = " ".join(
            e["message"] for e in emitter.sent if e["type"] == "agent_message"
        )
        self.assertIn("auto-approved", messages)


class _FakeApproval:
    """Drives the orchestrator through a scripted approval outcome."""

    requires_human = True

    def __init__(self, status="approved", consumable=True, record=True):
        self.status = status
        self.consumable = consumable
        self.record = record
        self.consumed = 0
        self.choices = None

    def request(self, run_id, allocations_paise, choices=None):
        self.choices = choices
        if not self.record:
            return None
        return ApprovalRecord("req-1", run_id, "digest-abc", "pending", "later")

    def await_decision(self, record):
        record.status = self.status
        return record

    def consume(self, record):
        self.consumed += 1
        return self.consumable


class ApprovalGateTest(unittest.TestCase):
    def _run(self, approval):
        emitter = EventEmitter(enabled=False)
        orchestrator = Orchestrator(emitter, approval=approval)
        report = orchestrator.run(
            RunConfig(goal="Plan my Goa trip", budget_paise=to_paise(30000))
        )
        return report, emitter

    def test_an_approved_plan_mints(self):
        approval = _FakeApproval("approved")
        report, emitter = self._run(approval)

        self.assertTrue(report.approved)
        self.assertEqual(approval.consumed, 1)
        self.assertIn("card_issued", [e["type"] for e in emitter.sent])

    def test_a_declined_plan_mints_nothing(self):
        report, emitter = self._run(_FakeApproval("declined"))

        self.assertFalse(report.approved)
        self.assertEqual(report.purchases, [])
        self.assertNotIn("card_issued", [e["type"] for e in emitter.sent])

    def test_an_expired_plan_mints_nothing(self):
        report, emitter = self._run(_FakeApproval("expired"))

        self.assertFalse(report.approved)
        self.assertNotIn("card_issued", [e["type"] for e in emitter.sent])

    def test_a_failed_consume_mints_nothing(self):
        """A stale or already-used approval must not authorise this plan."""
        report, emitter = self._run(_FakeApproval("approved", consumable=False))

        self.assertFalse(report.approved)
        self.assertNotIn("card_issued", [e["type"] for e in emitter.sent])

    def test_an_unreachable_approval_service_is_not_consent(self):
        report, emitter = self._run(_FakeApproval(record=False))

        self.assertFalse(report.approved)
        self.assertNotIn("approval_requested", [e["type"] for e in emitter.sent])

    def test_consume_happens_before_the_first_mint(self):
        class Ordering(_FakeApproval):
            def __init__(self):
                super().__init__("approved")
                self.consumed_at = None

        approval = Ordering()
        emitter = EventEmitter(enabled=False)
        Orchestrator(emitter, approval=approval).run(
            RunConfig(goal="Plan my Goa trip", budget_paise=to_paise(30000))
        )

        types = [e["type"] for e in emitter.sent]
        self.assertLess(types.index("approval_given"), types.index("card_issued"))

    def test_approval_events_carry_the_run_and_digest(self):
        approval = _FakeApproval("approved")
        _, emitter = self._run(approval)

        requested = next(e for e in emitter.sent if e["type"] == "approval_requested")
        given = next(e for e in emitter.sent if e["type"] == "approval_given")

        self.assertEqual(requested["approvalRequestId"], "req-1")
        self.assertEqual(requested["digest"], "digest-abc")
        self.assertEqual(given["digest"], "digest-abc")
        self.assertTrue(requested["runId"])
        self.assertEqual(requested["choices"], approval.choices)
        self.assertEqual(set(approval.choices), {"flights", "stay", "food", "guide"})


class PolledApprovalTransportTest(unittest.TestCase):
    def test_an_unreachable_service_yields_no_record(self):
        approval = PolledApproval(base_url=DEAD_URL, timeout=0.5)

        self.assertIsNone(approval.request("run-1", {"flights": to_paise(1)}))
        self.assertIn("unreachable", approval.last_error)

    def test_consume_failure_is_reported_not_swallowed(self):
        approval = PolledApproval(base_url=DEAD_URL, timeout=0.5)
        record = ApprovalRecord("req-1", "run-1", "d", "approved")

        self.assertFalse(approval.consume(record))


class ApprovalRecordTest(unittest.TestCase):
    def test_settled_covers_every_terminal_status(self):
        for status in ("approved", "declined", "expired", "consumed"):
            self.assertTrue(ApprovalRecord("r", "run", "d", status).settled)

    def test_pending_is_not_settled(self):
        self.assertFalse(ApprovalRecord("r", "run", "d", "pending").settled)


if __name__ == "__main__":
    unittest.main()


class ObservedCapDeclineTest(unittest.TestCase):
    """Locked against what the sandbox actually returned on 2026-08-02.

    Charging Rs 160 against a Rs 100 mandate produced errorCode "DECLINED"
    with "Total amount 160.00 exceeds ..." in the message — not the
    THRESHOLD_EXCEEDED the docs name. A classifier that only accepted the
    documented code would have called a real cap decline "not cap enforcement".
    """

    REAL_MESSAGE = (
        "Visa did not return COMPLETED (status DECLINED): "
        "Total amount 160.00 exceeds the approved amount 100.00"
    )

    def test_the_real_sandbox_decline_counts_as_cap_enforcement(self):
        from humsafar.guardian import is_cap_decline

        self.assertTrue(is_cap_decline("DECLINED", self.REAL_MESSAGE))

    def test_the_documented_code_still_counts(self):
        from humsafar.guardian import is_cap_decline

        self.assertTrue(is_cap_decline("THRESHOLD_EXCEEDED", None))

    def test_a_bare_decline_without_an_amount_reason_does_not_count(self):
        from humsafar.guardian import is_cap_decline

        self.assertFalse(is_cap_decline("DECLINED", "Visa declined: insufficient funds"))
        self.assertFalse(is_cap_decline("DECLINED", None))

    def test_unrelated_failures_never_count(self):
        from humsafar.guardian import is_cap_decline

        for code in ("MANDATE_NOT_ACTIVE", "MANDATE_MERCHANT_NOT_ALLOWED", "TRIES_EXHAUSTED", ""):
            self.assertFalse(is_cap_decline(code, "some message"))

    def test_the_reason_text_reflects_the_real_decline(self):
        reason = Guardian.describe_card_block(
            "Stay Agent", to_paise("160"), to_paise("100"), "DECLINED", self.REAL_MESSAGE
        )
        self.assertIn("Blocked at the card level", reason)
