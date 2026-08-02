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

from .destinations import build_inventory, parse_destination
from .models import Option
from .money import to_paise


class DiscoveryProvider(Protocol):
    """What the orchestrator needs from any source of purchasable options."""

    def discover(self, category: str, goal: str) -> list[Option]:
        ...


class FixtureDiscovery:
    """Realistic offline options, shaped like the real partner APIs.

    Marked `source="fixture"` without exception — INTERFACES.md §3 requires it,
    and it is what keeps the submission's disclosure section honest.
    """

    def __init__(
        self,
        days: int = 3,
        origin: str = "Bengaluru",
        travel_mode: str = "flight",
    ) -> None:
        self.days = days
        self.origin = origin
        self.travel_mode = travel_mode

    def discover(self, category: str, goal: str) -> list[Option]:
        # The goal is no longer ignored. It used to be: every request returned
        # the same Bengaluru->Goa inventory, so a Jaipur trip came back with
        # BLR-GOI flights and a hotel in Anjuna. Discovery now answers the
        # question that was actually asked.
        destination = parse_destination(goal)
        rows = build_inventory(
            destination,
            self.days,
            self.origin,
            travel_mode=self.travel_mode,
        ).get(category, [])
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
        query: Optional[dict] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.fallback = fallback if fallback is not None else FixtureDiscovery()
        self.sources: dict[str, str] = {}
        self.query = query or {}

    def discover(self, category: str, goal: str) -> list[Option]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        request = urllib.request.Request(
            f"{self.base_url}/api/discovery/{category}",
            data=json.dumps({"goal": goal, **self.query}).encode("utf-8"),
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

        # `source: "fixture"` means the backend had no real inventory — its
        # Duffel token is absent, or the category has no live provider at all.
        # Its fallback set is Goa-only, so accepting it would answer a Udaipur
        # request with Zostel Goa and GoGoa Bikes. Both sets are fixtures; the
        # local one at least matches the destination that was asked for.
        #
        # A `live` response is always preferred, whatever it contains.
        if source != "live":
            self.sources[category] = "fixture"
            return self.fallback.discover(category, goal)

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
    #
    # `text` was lost when is_travel_goal() was extracted from this function,
    # which turned every non-travel goal into a NameError and killed the run.
    # Every test used a travel goal, so nothing caught it. Preethesh fixed the
    # same line independently; this keeps the None guard, which his `goal.lower()`
    # would raise on.
    text = (goal or "").lower()
    selected = [c for c in ("food", "guide") if c in text]
    return selected or ["flights", "stay", "food", "guide"]
