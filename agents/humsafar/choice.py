"""The human choice step — INTERFACES.md §6.

    negotiate → mediator finalises the split → [user picks one option per
    category] → mint scoped cards → buy

The split stays with the agents, because allocating a finite budget across
competing categories is the product. The *taste* decision goes to the user,
because two rooms at the same price are not interchangeable to a person and no
model can predict which one they want.

It sits after allocation and before minting, so the user can never pick
something the budget cannot cover, and no credential is ever minted for an
option that is about to change.

Three rules from §6 are enforced here rather than left to the caller:

* **Only options that fit the slice are offered.** The engine already decided
  the money; the user cannot spend past it.
* **Ranking is honest.** Rank by rating only where a real rating exists —
  Duffel flight offers have none. Otherwise rank by price and say so. "Top
  rated" over an unrated list is a false claim.
* **A timed-out auto-pick is never reported as a human decision.** `chosenBy`
  distinguishes `user` from `agent-timeout`, and the receipt carries it.
"""

import json
import hashlib
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

from .models import Option
from .money import to_rupees

DEFAULT_TIMEOUT_SECONDS = 45


@dataclass
class Choice:
    option: Option
    chosen_by: str  # "user" | "agent-timeout"

    @property
    def by_user(self) -> bool:
        return self.chosen_by == "user"


def option_id(category: str, option: Option) -> str:
    """Stable within a run, which is all §6.1 requires."""
    fingerprint = hashlib.sha256(
        f"{option.vendor}\0{option.description}\0{option.price_paise}".encode("utf-8")
    ).hexdigest()[:10]
    vendor = option.vendor.replace(" ", "-").lower()
    return f"{category}:{vendor}:{option.price_paise}:{fingerprint}"


def rank_options(options: list[Option]) -> tuple[list[Option], str]:
    """Order the shortlist and report the basis honestly.

    Returns `(ordered, ranking)` where ranking is "rating" or "price". A rating
    of 0.0 means genuinely unrated (see discovery.BackendDiscovery — Duffel
    flight offers carry none and we refuse to invent one), so a list with no
    real ratings must be ranked and labelled by price.
    """
    rated = [o for o in options if o.rating and o.rating > 0]
    if len(rated) == len(options) and options:
        return sorted(options, key=lambda o: (-o.rating, o.price_paise)), "rating"
    return sorted(options, key=lambda o: o.price_paise), "price"


def shortlist(options: list[Option], slice_paise: int, limit: int = 4) -> list[Option]:
    """Affordable options only, best first."""
    affordable = [o for o in options if o.price_paise <= slice_paise]
    ordered, _ = rank_options(affordable)
    return ordered[:limit]


def to_wire(category: str, options: list[Option], slice_paise: int, timeout: int) -> dict:
    """Build the `choice_requested` payload from §6.1."""
    ordered, ranking = rank_options(options)
    return {
        "agent": category,
        "slice": to_rupees(slice_paise),
        "options": [
            {
                "optionId": option_id(category, o),
                "vendor": o.vendor,
                "description": o.description,
                "price": to_rupees(o.price_paise),
                "currency": "INR",
                # null, never a fabricated score. A 0.0 rating from discovery
                # means "genuinely unrated", not "rated zero".
                "rating": o.rating if o.rating and o.rating > 0 else None,
                "ratingBasis": ("fixture-score" if o.source == "fixture" else "star")
                if o.rating and o.rating > 0
                else None,
                "photos": [],
                "source": o.source,
                "environment": "test" if o.source == "live" else None,
            }
            for o in ordered
        ],
        "ranking": ranking,
        "timeoutSeconds": timeout,
    }


class AutoChoice:
    """No human in the loop. Keeps the pre-§6 behaviour exactly.

    Reports `agent-timeout`, never `user`, so a run without a person involved
    can never be presented as one where somebody chose.
    """

    interactive = False

    def choose(self, category: str, options: list[Option], slice_paise: int) -> Optional[Choice]:
        picks = shortlist(options, slice_paise)
        return Choice(picks[0], "agent-timeout") if picks else None


class PolledChoice:
    """Waits for the user's pick via `POST /api/choices`, then times out.

    A live demo cannot hang, so the timeout is a hard guarantee: when it
    expires the agent takes the top-ranked affordable option and says so.
    """

    interactive = True

    def __init__(
        self,
        run_id: str,
        emitter,
        base_url: str = "http://127.0.0.1:3000",
        token: Optional[str] = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        poll_interval: float = 1.0,
    ) -> None:
        self.run_id = run_id
        self.emitter = emitter
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds
        self.poll_interval = poll_interval

    def choose(self, category: str, options: list[Option], slice_paise: int) -> Optional[Choice]:
        picks = shortlist(options, slice_paise)
        if not picks:
            return None

        self.emitter.choice_requested(
            self.run_id, to_wire(category, picks, slice_paise, self.timeout_seconds)
        )

        by_id = {option_id(category, o): o for o in picks}
        deadline = time.monotonic() + self.timeout_seconds

        while time.monotonic() < deadline:
            time.sleep(self.poll_interval)
            chosen = self._poll(category)
            if chosen and chosen in by_id:
                return Choice(by_id[chosen], "user")

        # Timed out. The top-ranked affordable option, honestly labelled.
        return Choice(picks[0], "agent-timeout")

    def _poll(self, category: str) -> Optional[str]:
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(
            f"{self.base_url}/api/choices?runId={self.run_id}&agent={category}",
            headers=headers,
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError):
            return None
        return (body.get("data") or {}).get("optionId")
