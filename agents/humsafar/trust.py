"""Pre-purchase trust check (Senso track).

brainstorming.md §2.3 wants one trust lookup per specialist before it buys, and
the Senso track requires the score to *materially influence* a decision rather
than just being logged. So this does change what gets bought: an option whose
merchant does not come back `allow` is skipped in favour of the next acceptable
option inside the same slice.

It deliberately does not hard-block. The backend's current `TrustService` is a
fixture heuristic that says so in its own `reason` string, and refusing to buy
on the strength of a placeholder would fail the demo for no real safety gain.
If every option is flagged, the agent proceeds and the reason is carried into
the purchase details, clearly labelled — an honest "flagged, bought anyway,
here's why" beats a silent block or a silent ignore.
"""

import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

from .models import Option


@dataclass
class TrustVerdict:
    merchant: str
    score: float
    decision: str
    reason: str
    source: str

    @property
    def allowed(self) -> bool:
        return self.decision == "allow"


UNAVAILABLE = TrustVerdict("", 0.0, "allow", "trust service unavailable; not enforced", "none")


class TrustClient:
    """Calls `POST /api/trust/check`."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3000",
        token: Optional[str] = None,
        timeout: float = 5.0,
        enabled: bool = True,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.enabled = enabled
        self.checks = 0

    def check(self, option: Option) -> TrustVerdict:
        if not self.enabled:
            return UNAVAILABLE

        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        payload = {"merchant": option.merchant}
        if option.rating:
            payload["rating"] = option.rating

        request = urllib.request.Request(
            f"{self.base_url}/api/trust/check",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            self.checks += 1
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError) as exc:
            # An unreachable trust service must never stop a purchase — it is an
            # advisory layer, and treating an outage as a refusal would hand any
            # flaky dependency a veto over the whole run.
            print(f"[trust] check skipped, not enforced: {exc}", file=sys.stderr)
            return UNAVAILABLE

        data = body.get("data", {}) if isinstance(body, dict) else {}
        return TrustVerdict(
            merchant=str(data.get("merchant", option.merchant)),
            score=float(data.get("score", 0.0)),
            decision=str(data.get("decision", "allow")),
            reason=str(data.get("reason", "")),
            source=str(body.get("source", "unknown")),
        )
