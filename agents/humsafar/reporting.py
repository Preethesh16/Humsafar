"""Charge reconciliation — the step that closes the Prava lifecycle.

`POST /v1/mandates/{id}/charge` leaves a charge at `awaiting_result`. Prava's
docs are explicit that after checkout you settle the outcome with the report
endpoint, and until that happens the transaction is unreconciled with the card
network. Preethesh implemented `MandateService.reportCharge` and the route for
it; nothing in the product ever called them, which is why every charge we made
sat unfinished.

The one rule this module enforces: **`APPROVED` may only be reported when a
merchant or processor actually approved.** Reporting APPROVED because a
credential minted successfully would create a completed Prava record with no
purchase behind it — a fabricated result, and the clearest possible version of
the "mocked payment presented as a transaction" the handbook treats as a
disqualifier.
"""

import json
import sys
import urllib.error
import urllib.request
from typing import Optional

VALID_OUTCOMES = ("APPROVED", "DECLINED")


class ChargeReporter:
    """Reports a checkout outcome through the backend's report route."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3000",
        token: Optional[str] = None,
        timeout: float = 15.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.calls: list[dict] = []
        self.last_error = ""

    def report(
        self,
        mandate_id: str,
        transaction_id: str,
        outcome: str,
        amount=None,
        authorization_code: str = "",
    ) -> bool:
        if outcome not in VALID_OUTCOMES:
            raise ValueError(f"outcome must be one of {VALID_OUTCOMES}, got {outcome!r}")
        if not mandate_id or not transaction_id:
            # Nothing to reconcile against — say so rather than guessing an id.
            self.last_error = "missing mandateId or transactionId"
            return False

        body = {"txn_status": outcome, "txn_type": "PURCHASE"}
        if amount is not None:
            body["amount_paid"] = f"{float(amount):.2f}"
        if authorization_code:
            body["authorization_code"] = authorization_code

        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        request = urllib.request.Request(
            f"{self.base_url}/api/prava/mandates/{mandate_id}/charges/{transaction_id}/report",
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        # Recorded without credentials — ids and outcome only, which is what
        # precaution.md permits keeping.
        self.calls.append({"transactionId": transaction_id, "outcome": outcome})

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return 200 <= response.status < 300
        except urllib.error.HTTPError as exc:
            self.last_error = f"HTTP {exc.code}"
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            self.last_error = f"report unreachable: {exc}"

        print(f"[report] charge not reconciled: {self.last_error}", file=sys.stderr)
        return False


class NullReporter:
    """Used when nothing real was charged. Records, never calls Prava."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def report(self, mandate_id="", transaction_id="", outcome="DECLINED", amount=None,
               authorization_code="") -> bool:
        self.calls.append({"transactionId": transaction_id, "outcome": outcome})
        return True
