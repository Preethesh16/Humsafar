"""Option discovery for the specialist agents.

Preethesh owns the live integrations (Duffel for flights/stay, plus the
Viator/OpenTable-shaped fixtures for guide/food). Per INTERFACES.md, the agent
core builds against a provider interface so negotiation work is not blocked on
those landing, and swaps to live data by passing a different provider — no
change to the orchestrator or the engine.

Every option carries `source`, so the dashboard and the submission can state
honestly which numbers were live and which were fixtures.
"""

import json
import sys
import urllib.error
import urllib.request
from typing import Optional, Protocol

from .models import Option
from .money import to_paise


class DiscoveryProvider(Protocol):
    """What the orchestrator needs from any source of purchasable options."""

    def discover(self, category: str, goal: str) -> list[Option]:
        ...


# Prices are realistic mid-2026 Bengaluru->Goa weekend numbers. They are shaped
# so the categories genuinely contend for a Rs 30,000 pot: the cheapest viable
# set fits easily, but every agent's *preferred* option does not, which is the
# whole point of the negotiation.
_FIXTURES: dict[str, list[tuple[str, str, str, str, float]]] = {
    "flights": [
        ("IndiGo", "6E-6423 BLR-GOI return, 1 checked bag", "IndiGo", "6500.00", 4.1),
        ("SpiceJet", "SG-482 BLR-GOI return, late arrival", "SpiceJet", "7400.00", 3.8),
        ("Akasa Air", "QP-1382 BLR-GOI return, morning out", "Akasa Air", "8200.00", 4.3),
        ("Air India Express", "IX-1128 BLR-GOI return, direct", "Air India Express", "9800.00", 4.4),
        ("Air India", "BLR-GOI return, flexible fare", "Air India", "11800.00", 4.6),
    ],
    "stay": [
        ("Zostel Goa", "2 nights, private twin, Anjuna", "Zostel Goa", "5400.00", 4.0),
        ("The Hosteller", "2 nights, deluxe double, Vagator", "The Hosteller", "8900.00", 4.2),
        ("Anjuna Beach Resort", "2 nights, pool-view room", "Anjuna Beach Resort", "11200.00", 4.5),
        ("Casa Vagator", "2 nights, sea-view room, breakfast", "Casa Vagator", "14500.00", 4.7),
        ("Taj Holiday Village", "2 nights, garden villa", "Taj Holiday Village", "16000.00", 4.8),
    ],
    "food": [
        ("Local shacks", "2 days, beach shack meals for two", "Local Shacks", "2400.00", 3.9),
        ("Fisherman's Wharf", "lunch and dinner for two", "Fisherman's Wharf", "3200.00", 4.1),
        ("Gunpowder Assagao", "dinner for two + one lunch", "Gunpowder Assagao", "4200.00", 4.5),
        ("Thalassa Vagator", "sunset dinner for two, reserved", "Thalassa Vagator", "5200.00", 4.4),
    ],
    "guide": [
        ("GoGoa Bikes", "2-day scooter rental + fuel", "GoGoa Bikes", "1800.00", 4.0),
        ("Spice Plantation Tour", "half day, guided, lunch included", "Spice Plantation Tour", "2600.00", 4.2),
        ("Dudhsagar Day Trip", "guided falls trip, shared jeep", "Dudhsagar Day Trip", "3600.00", 4.6),
        ("Sunset Cruise + Old Goa", "private guide, half day", "Sunset Cruise Old Goa", "4500.00", 4.5),
    ],
}


class FixtureDiscovery:
    """Realistic offline options, shaped like the real partner APIs.

    Marked `source="fixture"` without exception — INTERFACES.md §3 requires it,
    and it is what keeps the submission's disclosure section honest.
    """

    def discover(self, category: str, goal: str) -> list[Option]:
        rows = _FIXTURES.get(category, [])
        return [
            Option(
                category=category,
                vendor=vendor,
                description=description,
                price_paise=to_paise(price),
                rating=rating,
                source="fixture",
                merchant=merchant,
            )
            for vendor, description, merchant, price, rating in rows
        ]


class BackendDiscovery:
    """Options from `POST /api/discovery/:category` (Preethesh's service).

    That route returns the Section 4 `{ data, source }` envelope, with Duffel
    behind a fixture fallback for flights and stay. Two shape differences from
    the local fixtures are handled here:

    * **`merchant` is not in the response.** `vendor` is used as the merchant
      identifier, since that is what a mandate is registered against.
    * **Flight offers carry no `rating`.** They are treated as unrated (0.0)
      rather than given an invented score, which means the flights agent
      prefers the cheapest offer and the mediator will not spend surplus
      "upgrading" it. That is the correct behaviour when we have no evidence a
      pricier offer is better — inventing a rating to make the demo livelier
      would be fabricating data.

    Falls back to fixtures if the backend is unreachable, so discovery can
    never be the thing that kills a run.
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3000",
        token: Optional[str] = None,
        timeout: float = 15.0,
        fallback: Optional[DiscoveryProvider] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.fallback = fallback if fallback is not None else FixtureDiscovery()
        self.sources: dict[str, str] = {}

    def discover(self, category: str, goal: str) -> list[Option]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        request = urllib.request.Request(
            f"{self.base_url}/api/discovery/{category}",
            data=json.dumps({"goal": goal}).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"[discovery] {category}: falling back to fixtures ({exc})", file=sys.stderr)
            self.sources[category] = "fixture"
            return self.fallback.discover(category, goal)

        source = str(body.get("source", "fixture"))
        self.sources[category] = source

        options = []
        for row in body.get("data", []) or []:
            try:
                price = to_paise(row["price"])
            except (KeyError, ValueError, TypeError):
                continue
            if price <= 0:
                continue
            vendor = str(row.get("vendor") or "Unknown")
            options.append(
                Option(
                    category=category,
                    vendor=vendor,
                    description=str(row.get("description") or ""),
                    price_paise=price,
                    rating=float(row.get("rating") or 0.0),
                    source="live" if source == "live" else "fixture",
                    merchant=str(row.get("merchant") or vendor),
                )
            )

        if not options:
            print(f"[discovery] {category}: empty response, using fixtures", file=sys.stderr)
            self.sources[category] = "fixture"
            return self.fallback.discover(category, goal)

        return options


TRAVEL_WORDS = ("trip", "travel", "visit", "weekend", "holiday", "vacation", "goa")


def is_travel_goal(goal: str) -> bool:
    """True when the goal is unambiguously a journey.

    Distinct from `categories_for_goal`, which falls back to the full roster
    when it has no opinion at all. Callers that need to know the difference
    between "confidently a trip" and "no idea, default to everything" must use
    this — see `intent._restore_dropped`.
    """
    text = goal.lower()
    return any(word in text for word in TRAVEL_WORDS)


def categories_for_goal(goal: str) -> list[str]:
    """Pick the specialist set for a goal.

    Deliberately keyword-based rather than an LLM call: which agents exist is
    structural, and a hallucinated category would produce a split the locked
    event schema cannot even represent. The LLM's job in this system is
    argument, not arithmetic or wiring.
    """
    if is_travel_goal(goal):
        return ["flights", "stay", "food", "guide"]

    # Non-travel goals still run through the same engine; they just field a
    # smaller roster. The wire projection fills the unused categories with 0.
    selected = [c for c in ("food", "guide") if c in text]
    return selected or ["flights", "stay", "food", "guide"]
