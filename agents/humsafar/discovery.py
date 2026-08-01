"""Option discovery for the specialist agents.

Preethesh owns the live integrations (Duffel for flights/stay, plus the
Viator/OpenTable-shaped fixtures for guide/food). Per INTERFACES.md, the agent
core builds against a provider interface so negotiation work is not blocked on
those landing, and swaps to live data by passing a different provider — no
change to the orchestrator or the engine.

Every option carries `source`, so the dashboard and the submission can state
honestly which numbers were live and which were fixtures.
"""

from typing import Protocol

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
        ("IndiGo", "6E-6423 BLR-GOI return, 1 checked bag", "duffel-indigo", "6500.00", 4.1),
        ("SpiceJet", "SG-482 BLR-GOI return, late arrival", "duffel-spicejet", "7400.00", 3.8),
        ("Akasa Air", "QP-1382 BLR-GOI return, morning out", "duffel-akasa", "8200.00", 4.3),
        ("Air India Express", "IX-1128 BLR-GOI return, direct", "duffel-air-india-express", "9800.00", 4.4),
        ("Vistara", "UK-857 BLR-GOI return, flexible fare", "duffel-vistara", "11800.00", 4.6),
    ],
    "stay": [
        ("Zostel Goa", "2 nights, private twin, Anjuna", "duffel-zostel", "5400.00", 4.0),
        ("The Hosteller", "2 nights, deluxe double, Vagator", "duffel-hosteller", "8900.00", 4.2),
        ("Anjuna Beach Resort", "2 nights, pool-view room", "duffel-anjuna-beach", "11200.00", 4.5),
        ("Casa Vagator", "2 nights, sea-view room, breakfast", "duffel-casa-vagator", "14500.00", 4.7),
        ("Taj Holiday Village", "2 nights, garden villa", "duffel-taj", "16000.00", 4.8),
    ],
    "food": [
        ("Local shacks", "2 days, beach shack meals for two", "opentable-goa-shacks", "2400.00", 3.9),
        ("Fisherman's Wharf", "lunch and dinner for two", "opentable-fishermans-wharf", "3200.00", 4.1),
        ("Gunpowder Assagao", "dinner for two + one lunch", "opentable-gunpowder", "4200.00", 4.5),
        ("Thalassa Vagator", "sunset dinner for two, reserved", "opentable-thalassa", "5200.00", 4.4),
    ],
    "guide": [
        ("GoGoa Bikes", "2-day scooter rental + fuel", "viator-gogoa", "1800.00", 4.0),
        ("Spice Plantation Tour", "half day, guided, lunch included", "viator-spice-plantation", "2600.00", 4.2),
        ("Dudhsagar Day Trip", "guided falls trip, shared jeep", "viator-dudhsagar", "3600.00", 4.6),
        ("Sunset Cruise + Old Goa", "private guide, half day", "viator-oldgoa", "4500.00", 4.5),
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


def categories_for_goal(goal: str) -> list[str]:
    """Pick the specialist set for a goal.

    Deliberately keyword-based rather than an LLM call: which agents exist is
    structural, and a hallucinated category would produce a split the locked
    event schema cannot even represent. The LLM's job in this system is
    argument, not arithmetic or wiring.
    """
    text = goal.lower()
    stay_words = ("trip", "travel", "visit", "weekend", "holiday", "vacation", "goa")
    needs_travel = any(word in text for word in stay_words)

    if needs_travel:
        return ["flights", "stay", "food", "guide"]

    # Non-travel goals still run through the same engine; they just field a
    # smaller roster. The wire projection fills the unused categories with 0.
    selected = [c for c in ("food", "guide") if c in text]
    return selected or ["flights", "stay", "food", "guide"]
