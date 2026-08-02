"""The human approval gate.

Approval used to be a boolean on `RunConfig`, which meant there was no boundary
for a dashboard to gate and nothing stopping a stale "yes" from authorising a
different plan. `INTERFACES.md` §7 replaced it with server state, and this is
the agent side of that protocol:

    create -> poll -> consume -> only then mint

Three properties matter, and all three are the backend's to enforce rather than
ours to promise:

* **The digest binds the decision to an exact plan.** It covers `runId`,
  allocations and choices. Change a price, an option or the run and the old
  approval no longer matches. The backend computes it; we never invent one.
* **Consumption is one-shot.** A second consume, an expiry, or a decline fails
  closed, so an approval cannot authorise a later plan.
* **Decline and timeout are identical to us.** Neither mints anything.

`AutoApproval` remains the default so keyless, backendless runs still work end
to end; it is explicitly *not* a human approval and says so.
"""

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

from .money import to_rupees


@dataclass
class ApprovalRecord:
    """The public approval record, as returned by the backend."""

    approval_request_id: str
    run_id: str
    digest: str
    status: str
    expires_at: str = ""

    @property
    def approved(self) -> bool:
        return self.status == "approved"

    @property
    def settled(self) -> bool:
        """True once no further polling can change the outcome."""
        return self.status in {"approved", "declined", "expired", "consumed"}


class AutoApproval:
    """Approves immediately, without a human. The zero-config default.

    Honest by construction: `requires_human` is False, and the orchestrator
    says so on the wire, so a fixture run can never be presented as one a
    person actually authorised.
    """

    requires_human = False

    def request(self, run_id: str, allocations_paise: dict[str, int]) -> Optional[ApprovalRecord]:
        return ApprovalRecord(
            approval_request_id="auto",
            run_id=run_id,
            digest="",
            status="approved",
        )

    def await_decision(self, record: ApprovalRecord) -> ApprovalRecord:
        return record

    def consume(self, record: ApprovalRecord) -> bool:
        return True


class PolledApproval:
    """Drives the §7 protocol against the backend."""

    requires_human = True

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3000",
        token: Optional[str] = None,
        ttl_seconds: int = 120,
        poll_interval: float = 1.0,
        timeout: float = 15.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.ttl_seconds = ttl_seconds
        self.poll_interval = poll_interval
        self.timeout = timeout
        self.last_error = ""

    # -- protocol --------------------------------------------------------

    def request(self, run_id: str, allocations_paise: dict[str, int]) -> Optional[ApprovalRecord]:
        body = self._call(
            "POST",
            "/api/approvals/requests",
            {
                "runId": run_id,
                "allocations": {k: to_rupees(v) for k, v in allocations_paise.items()},
                "ttlSeconds": self.ttl_seconds,
            },
        )
        if not body:
            return None
        return _record_from(body)

    def await_decision(self, record: ApprovalRecord) -> ApprovalRecord:
        """Poll until the request settles or its TTL passes.

        Bounded by the record's own TTL rather than a local guess, so the wait
        can never outlive the approval the user is looking at.
        """
        deadline = time.monotonic() + self.ttl_seconds + self.poll_interval
        current = record

        while time.monotonic() < deadline:
            if current.settled:
                return current
            time.sleep(self.poll_interval)
            body = self._call(
                "GET", f"/api/approvals/{record.approval_request_id}?runId={record.run_id}"
            )
            if body:
                current = _record_from(body)

        if not current.settled:
            current.status = "expired"
        return current

    def consume(self, record: ApprovalRecord) -> bool:
        """Burn the approval immediately before the first mint."""
        body = self._call(
            "POST",
            f"/api/approvals/{record.approval_request_id}/consume",
            {"runId": record.run_id, "digest": record.digest},
        )
        return bool(body)

    # -- transport -------------------------------------------------------

    def _call(self, method: str, path: str, payload: Optional[dict] = None) -> Optional[dict]:
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8") if payload is not None else None,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            # A 409 is the protocol working: expired, already decided, already
            # consumed, or a digest that no longer matches the plan.
            self.last_error = f"HTTP {exc.code}"
            return None
        except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError) as exc:
            # An unreachable approval service must never be read as consent.
            self.last_error = f"approval service unreachable: {exc}"
            return None


def _record_from(body: dict) -> ApprovalRecord:
    return ApprovalRecord(
        approval_request_id=str(body.get("approvalRequestId", "")),
        run_id=str(body.get("runId", "")),
        digest=str(body.get("digest", "")),
        status=str(body.get("status", "pending")),
        expires_at=str(body.get("expiresAt", "")),
    )
