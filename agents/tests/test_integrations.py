"""Tests for the two backend-backed integrations.

These run against a real HTTP server on a loopback port rather than a patched
urlopen, so they exercise the actual request/response path — including the
failure modes that matter most here, which are network ones.
"""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from humsafar.discovery import BackendDiscovery, FixtureDiscovery
from humsafar.events import EventEmitter
from humsafar.models import Option
from humsafar.money import to_paise
from humsafar.orchestrator import Orchestrator, RunConfig
from humsafar.trust import TrustClient, TrustVerdict

# A port that refuses instantly, so "backend is down" tests stay fast.
DEAD_URL = "http://127.0.0.1:1"


class _Handler(BaseHTTPRequestHandler):
    routes: dict = {}

    def do_POST(self):  # noqa: N802 - BaseHTTPRequestHandler's naming
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)

        for prefix, payload in self.routes.items():
            if self.path.startswith(prefix):
                body = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        self.send_response(404)
        self.end_headers()

    def log_message(self, *args):
        pass


class ServerCase(unittest.TestCase):
    routes: dict = {}

    def setUp(self):
        handler = type("Handler", (_Handler,), {"routes": self.routes})
        self.server = HTTPServer(("127.0.0.1", 0), handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class BackendDiscoveryParsingTest(ServerCase):
    routes = {
        "/api/discovery/": {
            "data": [
                # A Duffel-shaped flight offer: no rating, no merchant.
                {"id": "off_1", "category": "flights", "vendor": "IndiGo",
                 "description": "BLR-GOI", "price": 6200, "currency": "INR", "source": "live"},
                {"id": "off_2", "category": "flights", "vendor": "Vistara",
                 "description": "BLR-GOI", "price": 11800, "currency": "INR", "source": "live"},
            ],
            "source": "live",
        }
    }

    def test_parses_the_envelope(self):
        options = BackendDiscovery(base_url=self.url).discover("flights", "Goa")

        self.assertEqual(len(options), 2)
        self.assertEqual(options[0].vendor, "IndiGo")
        self.assertEqual(options[0].price_paise, to_paise(6200))
        self.assertEqual(options[0].source, "live")

    def test_vendor_stands_in_for_a_missing_merchant(self):
        options = BackendDiscovery(base_url=self.url).discover("flights", "Goa")
        self.assertEqual(options[0].merchant, "IndiGo")

    def test_a_missing_rating_is_zero_not_invented(self):
        options = BackendDiscovery(base_url=self.url).discover("flights", "Goa")
        self.assertTrue(all(o.rating == 0.0 for o in options))

    def test_records_the_source_it_actually_got(self):
        provider = BackendDiscovery(base_url=self.url)
        provider.discover("flights", "Goa")
        self.assertEqual(provider.sources["flights"], "live")


class BackendDiscoveryFallbackTest(unittest.TestCase):
    def test_an_unreachable_backend_falls_back_to_fixtures(self):
        provider = BackendDiscovery(base_url=DEAD_URL, timeout=0.5)

        options = provider.discover("stay", "Goa")

        self.assertTrue(options)
        self.assertEqual(provider.sources["stay"], "fixture")
        self.assertTrue(all(o.source == "fixture" for o in options))

    def test_the_fallback_is_never_reported_as_live(self):
        provider = BackendDiscovery(base_url=DEAD_URL, timeout=0.5)
        provider.discover("food", "Goa")
        self.assertNotEqual(provider.sources["food"], "live")


class BackendDiscoveryEmptyTest(ServerCase):
    routes = {"/api/discovery/": {"data": [], "source": "live"}}

    def test_an_empty_response_falls_back_rather_than_producing_no_agent(self):
        provider = BackendDiscovery(base_url=self.url, fallback=FixtureDiscovery())

        options = provider.discover("guide", "Goa")

        self.assertTrue(options)
        self.assertEqual(provider.sources["guide"], "fixture")


class BackendDiscoveryBadRowTest(ServerCase):
    routes = {
        "/api/discovery/": {
            "data": [
                {"vendor": "Broken", "price": None},
                {"vendor": "Free", "price": 0},
                {"vendor": "Good", "price": 1500, "rating": 4.2},
            ],
            "source": "live",
        }
    }

    def test_unusable_rows_are_dropped_not_crashed_on(self):
        options = BackendDiscovery(base_url=self.url).discover("food", "Goa")

        self.assertEqual(len(options), 1)
        self.assertEqual(options[0].vendor, "Good")


class TrustClientTest(ServerCase):
    routes = {
        "/api/trust/check": {
            "data": {"merchant": "m", "score": 0.4, "decision": "review", "reason": "fixture"},
            "source": "fixture",
        }
    }

    def test_reads_the_decision(self):
        verdict = TrustClient(base_url=self.url).check(
            Option("food", "V", "d", to_paise(100), 2.0, "fixture", "m")
        )

        self.assertFalse(verdict.allowed)
        self.assertEqual(verdict.decision, "review")
        self.assertEqual(verdict.source, "fixture")

    def test_disabled_client_makes_no_call(self):
        client = TrustClient(base_url=self.url, enabled=False)
        client.check(Option("food", "V", "d", to_paise(100), 2.0, "fixture", "m"))
        self.assertEqual(client.checks, 0)


class TrustOutageTest(unittest.TestCase):
    def test_an_outage_does_not_veto_a_purchase(self):
        """A flaky advisory service must never get a veto over the run."""
        verdict = TrustClient(base_url=DEAD_URL, timeout=0.5).check(
            Option("food", "V", "d", to_paise(100), 4.0, "fixture", "m")
        )

        self.assertTrue(verdict.allowed)
        self.assertEqual(verdict.source, "none")


class _StubTrust:
    """Flags one merchant, clears everything else."""

    def __init__(self, flagged: str) -> None:
        self.flagged = flagged
        self.checks = 0

    def check(self, option: Option) -> TrustVerdict:
        self.checks += 1
        if option.merchant == self.flagged:
            return TrustVerdict(option.merchant, 0.3, "review", "flagged", "fixture")
        return TrustVerdict(option.merchant, 0.9, "allow", "ok", "fixture")


class TrustInfluencesThePurchaseTest(unittest.TestCase):
    def test_a_flagged_merchant_loses_the_sale(self):
        emitter = EventEmitter(enabled=False)
        trust = _StubTrust("opentable-gunpowder")
        orchestrator = Orchestrator(emitter, trust=trust)

        report = orchestrator.run(RunConfig(goal="Plan my Goa trip", budget_paise=to_paise(30000)))

        food = next(p for p in report.purchases if p.agent == "food")
        self.assertNotEqual(food.merchant, "opentable-gunpowder")
        self.assertIn("trust", food.detail)

    def test_an_allowed_merchant_is_left_alone(self):
        emitter = EventEmitter(enabled=False)
        orchestrator = Orchestrator(emitter, trust=_StubTrust("nobody"))

        report = orchestrator.run(RunConfig(goal="Plan my Goa trip", budget_paise=to_paise(30000)))

        self.assertTrue(all(p.status == "success" for p in report.purchases))
        self.assertTrue(all("trust" not in p.detail for p in report.purchases))

    def test_the_switch_still_respects_the_slice(self):
        emitter = EventEmitter(enabled=False)
        orchestrator = Orchestrator(emitter, trust=_StubTrust("duffel-anjuna-beach"))

        report = orchestrator.run(RunConfig(goal="Plan my Goa trip", budget_paise=to_paise(30000)))

        self.assertTrue(report.within_budget)


if __name__ == "__main__":
    unittest.main()
