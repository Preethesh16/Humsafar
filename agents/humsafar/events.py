"""Emitting locked events to Preethesh's backend.

Two deliberate choices here:

**The schema is validated locally before anything is sent.** `eventSchema.js`
already rejects malformed events with a 400, but finding that out at demo time
is too late. The mirror below encodes the same rules so a shape mistake fails
in my unit tests instead. If Preethesh changes the schema, this file and
INTERFACES.md change together.

**A validation error raises; a network error does not.** A bad event shape is
my bug and should stop the build. A backend that is down is an environment
problem, and the agent run must survive it — the negotiation still happened,
the dashboard just missed it. This mirrors the credential-degradation pattern
the team adopted in brainstorming.md §2.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Optional

from .models import WIRE_CATEGORIES
from .money import to_rupees

VALID_MESSAGE_AGENTS = {"flights", "stay", "food", "guide", "mediator", "orchestrator"}
VALID_EVENT_TYPES = {
    "agent_message",
    "split_update",
    "approval_requested",
    "approval_given",
    "card_issued",
    "purchase_result",
    "blocked_attempt",
    "renegotiation_triggered",
    "final_receipt",
    "choice_requested",
    "choice_made",
}


class EventSchemaError(ValueError):
    """Raised when an event would be rejected by the backend validator."""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def wire_allocations(allocations_paise: dict[str, int]) -> dict[str, float]:
    """Project an allocation onto the four keys the locked schema requires.

    The engine supports any specialist roster; the event schema names exactly
    flights/stay/food/guide. Categories the goal did not use are sent as 0
    rather than omitted (the validator requires all four present), and any
    extra category is passed through as an additional key so no information is
    silently dropped on the way to the dashboard.
    """
    wire = {category: 0.0 for category in WIRE_CATEGORIES}
    for category, paise in allocations_paise.items():
        wire[category] = to_rupees(paise)
    return wire


def validate_event(event: dict) -> Optional[str]:
    """Mirror of backend/src/events/eventSchema.js. Returns an error or None."""
    if not isinstance(event, dict) or event.get("type") not in VALID_EVENT_TYPES:
        return "type must be a supported event type"

    kind = event["type"]
    if kind == "agent_message":
        if event.get("agent") not in VALID_MESSAGE_AGENTS:
            return "agent_message.agent is invalid"
        if not _non_empty(event.get("message")):
            return "agent_message.message is required"
        return _timestamp(event.get("timestamp"), "agent_message.timestamp")
    if kind == "split_update":
        if not _allocations(event.get("allocations")):
            return "split_update.allocations is invalid"
        if not _non_negative(event.get("totalBudget")):
            return "split_update.totalBudget is invalid"
        return None if _positive_int(event.get("round")) else "split_update.round is invalid"
    if kind == "approval_requested":
        return None if _allocations(event.get("allocations")) else "approval_requested.allocations is invalid"
    if kind == "approval_given":
        return _timestamp(event.get("timestamp"), "approval_given.timestamp")
    if kind == "card_issued":
        if not _non_empty(event.get("agent")):
            return "card_issued.agent is required"
        if not _non_empty(event.get("cardId")):
            return "card_issued.cardId is required"
        return None if _positive(event.get("amountCap")) else "card_issued.amountCap is invalid"
    if kind == "purchase_result":
        if not _non_empty(event.get("agent")):
            return "purchase_result.agent is required"
        if event.get("status") not in {"success", "failed"}:
            return "purchase_result.status is invalid"
        if not _non_negative(event.get("amount")):
            return "purchase_result.amount is invalid"
        if not _non_empty(event.get("merchant")):
            return "purchase_result.merchant is required"
        return None if _non_empty(event.get("details")) else "purchase_result.details is required"
    if kind == "blocked_attempt":
        if not _non_empty(event.get("agent")):
            return "blocked_attempt.agent is required"
        if not _non_negative(event.get("attemptedAmount")):
            return "blocked_attempt.attemptedAmount is invalid"
        if not _non_negative(event.get("cap")):
            return "blocked_attempt.cap is invalid"
        return None if _non_empty(event.get("reason")) else "blocked_attempt.reason is required"
    if kind in ("choice_requested", "choice_made"):
        # Additive §6 events. Validated loosely here because eventSchema.js does
        # not know them yet; tightened when Preethesh adds them.
        return None if _non_empty(event.get("runId")) else f"{kind}.runId is required"
    if kind == "renegotiation_triggered":
        if not _non_empty(event.get("agent")):
            return "renegotiation_triggered.agent is required"
        return None if _non_empty(event.get("reason")) else "renegotiation_triggered.reason is required"
    if kind == "final_receipt":
        if not isinstance(event.get("purchases"), list):
            return "final_receipt.purchases must be an array"
        if not _non_negative(event.get("totalSpent")):
            return "final_receipt.totalSpent is invalid"
        return None if _non_negative(event.get("budget")) else "final_receipt.budget is invalid"
    return "type must be a supported event type"


class EventEmitter:
    """Posts locked events to `POST /api/events`."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3000",
        token: Optional[str] = None,
        timeout: float = 3.0,
        enabled: bool = True,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.enabled = enabled
        self.sent: list[dict] = []
        self.delivery_failures = 0

    def emit(self, event: dict) -> None:
        error = validate_event(event)
        if error:
            raise EventSchemaError(f"{error}: {json.dumps(event, default=str)}")

        self.sent.append(event)
        if not self.enabled:
            return

        request = urllib.request.Request(
            f"{self.base_url}/api/events",
            data=json.dumps(event).encode("utf-8"),
            headers=self._headers(),
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                if response.status != 202:
                    self._degrade(f"backend returned {response.status}")
        except urllib.error.HTTPError as exc:
            # A 400 here means the mirror above has drifted from the backend —
            # worth shouting about, because it is a contract break, not an
            # outage.
            self._degrade(f"HTTP {exc.code} from backend: {exc.read()[:200]!r}")
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            self._degrade(f"backend unreachable: {exc}")

    # -- typed helpers --------------------------------------------------

    def agent_message(self, agent: str, message: str) -> None:
        self.emit(
            {
                "type": "agent_message",
                "agent": agent,
                "message": message,
                "timestamp": now_iso(),
            }
        )

    def split_update(self, allocations_paise: dict[str, int], budget_paise: int, rnd: int) -> None:
        self.emit(
            {
                "type": "split_update",
                "allocations": wire_allocations(allocations_paise),
                "totalBudget": to_rupees(budget_paise),
                "round": rnd,
            }
        )

    def approval_requested(
        self,
        allocations_paise: dict[str, int],
        run_id: str = "",
        approval_request_id: str = "",
        digest: str = "",
        expires_at: str = "",
    ) -> None:
        # runId / approvalRequestId / digest / expiresAt are documented in
        # INTERFACES.md §2 but not yet enforced by eventSchema.js, so they are
        # additive here — Deepthi needs them to correlate the approval UI with
        # the exact plan being approved.
        self.emit(
            {
                "type": "approval_requested",
                "allocations": wire_allocations(allocations_paise),
                "runId": run_id,
                "approvalRequestId": approval_request_id,
                "digest": digest,
                "expiresAt": expires_at,
            }
        )

    def approval_given(
        self, run_id: str = "", approval_request_id: str = "", digest: str = ""
    ) -> None:
        self.emit(
            {
                "type": "approval_given",
                "timestamp": now_iso(),
                "runId": run_id,
                "approvalRequestId": approval_request_id,
                "digest": digest,
            }
        )

    def card_issued(self, agent: str, card_id: str, amount_cap_paise: int) -> None:
        self.emit(
            {
                "type": "card_issued",
                "agent": agent,
                "cardId": card_id,
                "amountCap": to_rupees(amount_cap_paise),
            }
        )

    def purchase_result(
        self, agent: str, status: str, amount_paise: int, merchant: str, details: str
    ) -> None:
        self.emit(
            {
                "type": "purchase_result",
                "agent": agent,
                "status": status,
                "amount": to_rupees(amount_paise),
                "merchant": merchant,
                "details": details,
            }
        )

    def blocked_attempt(
        self, agent: str, attempted_paise: int, cap_paise: int, reason: str
    ) -> None:
        self.emit(
            {
                "type": "blocked_attempt",
                "agent": agent,
                "attemptedAmount": to_rupees(attempted_paise),
                "cap": to_rupees(cap_paise),
                "reason": reason,
            }
        )

    def choice_requested(self, run_id: str, payload: dict) -> None:
        """INTERFACES.md §6.1. Not in eventSchema.js yet, so it is additive."""
        self.emit({"type": "choice_requested", "runId": run_id, **payload})

    def choice_made(
        self, run_id: str, agent: str, option_id: str, vendor: str, price_paise: int, chosen_by: str
    ) -> None:
        """§6.2. `chosenBy` is not decoration: a timed-out auto-pick must never
        be presented as a human decision."""
        self.emit(
            {
                "type": "choice_made",
                "runId": run_id,
                "agent": agent,
                "optionId": option_id,
                "vendor": vendor,
                "price": to_rupees(price_paise),
                "chosenBy": chosen_by,
            }
        )

    def renegotiation_triggered(self, agent: str, reason: str) -> None:
        self.emit({"type": "renegotiation_triggered", "agent": agent, "reason": reason})

    def final_receipt(self, purchases: list[dict], total_spent_paise: int, budget_paise: int) -> None:
        self.emit(
            {
                "type": "final_receipt",
                "purchases": purchases,
                "totalSpent": to_rupees(total_spent_paise),
                "budget": to_rupees(budget_paise),
            }
        )

    # -- internals ------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _degrade(self, reason: str) -> None:
        self.delivery_failures += 1
        if self.delivery_failures == 1:
            print(f"[events] streaming degraded, run continues: {reason}", file=sys.stderr)


def _non_empty(value) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _timestamp(value, field: str) -> Optional[str]:
    """Match the backend's `Number.isFinite(Date.parse(value))` check.

    Python's fromisoformat is stricter than Date.parse, but everything this
    package emits comes from now_iso(), so the strictness only ever catches a
    genuinely malformed timestamp rather than rejecting a valid one.
    """
    if not _non_empty(value):
        return f"{field} must be an ISO timestamp"
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return f"{field} must be an ISO timestamp"
    return None


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _non_negative(value) -> bool:
    return _number(value) and value >= 0


def _positive(value) -> bool:
    return _number(value) and value > 0


def _positive_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _allocations(value) -> bool:
    return isinstance(value, dict) and all(_non_negative(value.get(key)) for key in WIRE_CATEGORIES)
