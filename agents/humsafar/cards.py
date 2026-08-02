"""`mintScopedCard` from the agent side.

INTERFACES.md §1 locks the signature and the return shape; Preethesh owns what
happens inside. The agent core calls it over `POST /api/scoped-cards` and does
not reimplement any part of the Prava call.

One consequence of Preethesh's finding worth restating here, because it shapes
this file: a Prava `listed` mandate is locked to the single merchant approved
during setup, so `mandateId` is *merchant-specific*. The orchestrator therefore
looks up the mandate for a merchant rather than holding one master mandate. If
Prava later exposes multi-merchant approval, only `_resolve_mandate` changes.

Card tokens are never logged, printed, or put into an event. They exist to be
handed to a checkout call and nowhere else.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

from .money import to_rupees

REDACTED = "<redacted>"


# Everything a merchant checkout needs and nothing else may ever see. Per
# INTERFACES.md §1 these are transient: never logged, never in an event, never
# in a receipt, never in an exception message.
CREDENTIAL_FIELDS = ("cardToken", "dynamicCvv", "expiryMonth", "expiryYear")


class ScopedCard(dict):
    """The locked mintScopedCard result, with credential-safe printing."""

    @property
    def issued(self) -> bool:
        return self.get("status") == "issued"

    @property
    def error_code(self) -> str:
        """Structured failure reason, e.g. THRESHOLD_EXCEEDED."""
        return str(self.get("errorCode") or "")

    def safe(self) -> dict:
        """A copy with every credential removed, for logs, events and receipts.

        `cardId` and `transactionId` survive deliberately: they are identifiers,
        not secrets, and `precaution.md` names them among the fields that may be
        recorded. The token, dynamic CVV and expiry never leave this object.
        """
        redacted = dict(self)
        for field in CREDENTIAL_FIELDS:
            if field in redacted:
                redacted[field] = REDACTED if redacted[field] else ""
        return redacted

    def __repr__(self) -> str:
        return f"ScopedCard({self.safe()!r})"

    def __str__(self) -> str:
        return repr(self)


def failed_card(
    merchant: str, amount_cap_paise: int, error: str, error_code: str = "SCOPED_CARD_REJECTED"
) -> ScopedCard:
    return ScopedCard(
        cardId="",
        cardToken="",
        transactionId=None,
        dynamicCvv="",
        expiryMonth="",
        expiryYear="",
        merchant=merchant,
        amountCap=to_rupees(amount_cap_paise),
        status="failed",
        source="sandbox",
        errorCode=error_code,
        error=error,
    )


def load_mandate_registry(raw: Optional[str] = None) -> dict[str, str]:
    """Build a merchant -> mandateId map from PRAVA_MANDATE_MERCHANTS_JSON.

    The backend stores the registry the other way round (mandateId -> merchant)
    because that is the direction it needs for its fail-closed check. The
    orchestrator knows the merchant it wants to buy from and needs the mandate,
    so it inverts the same source of truth rather than introducing a second one
    that could drift.
    """
    source = raw if raw is not None else os.environ.get("PRAVA_MANDATE_MERCHANTS_JSON", "{}")
    try:
        mapping = json.loads(source or "{}")
    except json.JSONDecodeError:
        print("[cards] PRAVA_MANDATE_MERCHANTS_JSON is not valid JSON", file=sys.stderr)
        return {}
    if not isinstance(mapping, dict):
        return {}
    return {str(merchant).strip().lower(): str(mandate) for mandate, merchant in mapping.items()}


class ScopedCardClient:
    """Calls the backend's scoped-card route."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3000",
        token: Optional[str] = None,
        registry: Optional[dict[str, str]] = None,
        timeout: float = 15.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.registry = registry if registry is not None else load_mandate_registry()
        self.timeout = timeout

    def mint(self, merchant: str, amount_cap_paise: int) -> ScopedCard:
        if amount_cap_paise <= 0:
            return failed_card(merchant, amount_cap_paise, "amountCap must be positive")

        mandate_id = self._resolve_mandate(merchant)
        if not mandate_id:
            return failed_card(
                merchant,
                amount_cap_paise,
                f"No approved mandate registered for merchant {merchant!r}; refusing to mint",
            )

        payload = {
            "mandateId": mandate_id,
            "merchant": merchant,
            "amountCap": to_rupees(amount_cap_paise),
        }
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        request = urllib.request.Request(
            f"{self.base_url}/api/scoped-cards",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                card = ScopedCard(json.loads(response.read().decode("utf-8")))
            # The reconciliation step needs to know which mandate was charged,
            # and only this client knows which one it resolved.
            card.setdefault("mandateId", mandate_id)
            return card
        except urllib.error.HTTPError as exc:
            # 422 is the documented "failed" path and already carries the
            # locked shape, including the reason the mint was refused.
            body = exc.read().decode("utf-8", errors="replace")
            try:
                return ScopedCard(json.loads(body))
            except json.JSONDecodeError:
                return failed_card(merchant, amount_cap_paise, f"HTTP {exc.code}: {body[:200]}")
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            return failed_card(merchant, amount_cap_paise, f"card service unreachable: {exc}")

    def _resolve_mandate(self, merchant: str) -> Optional[str]:
        """Ask the backend which mandate covers this merchant.

        Replaces the previous approach of inverting `PRAVA_MANDATE_MERCHANTS_JSON`
        in Python. That duplicated backend state across two processes, and once
        `syncCustomerMandates` started populating the registry at runtime the
        copy in this process was simply wrong — an env var cannot learn about a
        mandate approved five minutes ago.

        The local registry stays only as an offline fallback so tests and
        keyless runs still work; the backend is the source of truth whenever it
        is reachable.
        """
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        query = urllib.parse.urlencode({"merchant": merchant})
        request = urllib.request.Request(
            f"{self.base_url}/api/prava/mandates/resolve?{query}",
            headers=headers,
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
            mandate_id = (body.get("data") or {}).get("mandateId")
            if mandate_id:
                return str(mandate_id)
        except urllib.error.HTTPError as exc:
            # 404 is a legitimate answer: no approved mandate for this merchant.
            # Anything else still falls through to the offline registry.
            if exc.code == 404:
                return self.registry.get(merchant.strip().lower())
        except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError):
            pass

        return self.registry.get(merchant.strip().lower())


class StubScopedCardClient:
    """Offline stand-in, per INTERFACES.md §1.

    Lets the orchestration and negotiation logic run end-to-end before live
    Prava credentials exist. It models the one behaviour the flow depends on —
    a mandate approved at a fixed ceiling refusing anything above it — by
    remembering the first cap requested for a merchant and treating that as the
    approved ceiling.

    Read this next line before demoing anything: **a stub refusing an overspend
    is not the card-level proof the pitch claims.** It shows the orchestration
    handles a refusal correctly. Every result carries `source="fixture"` so it
    can be labelled simulated wherever it is displayed, and the real proof shot
    needs `ScopedCardClient` against live Prava.
    """

    source = "fixture"

    def __init__(self, mandate_caps: Optional[dict[str, int]] = None) -> None:
        self.minted: list[tuple[str, int]] = []
        self.mandate_caps: dict[str, int] = dict(mandate_caps or {})

    def authorize(self, merchant: str, cap_paise: int) -> None:
        """Record the ceiling a mandate was approved at, before any charge.

        Mirrors reality: a mandate is approved for a merchant at an amount, and
        only afterwards are credentials minted against it. The earlier version
        inferred the ceiling from whichever charge happened to arrive first,
        which quietly broke once the over-cap proof moved ahead of the purchase
        — the inflated attempt became the ceiling and was authorised.
        """
        self.mandate_caps.setdefault(merchant.strip().lower(), cap_paise)

    def mint(self, merchant: str, amount_cap_paise: int) -> ScopedCard:
        if amount_cap_paise <= 0:
            return failed_card(merchant, amount_cap_paise, "amountCap must be positive")

        key = merchant.strip().lower()
        approved = self.mandate_caps.setdefault(key, amount_cap_paise)
        if amount_cap_paise > approved:
            # Mirrors the structured code Prava surfaces on an over-cap Visa
            # decline, so the orchestrator's classification path is exercised
            # offline. The `simulated` wording in the message is what keeps this
            # from ever being presented as card-network proof.
            return failed_card(
                merchant,
                amount_cap_paise,
                f"simulated mandate ceiling for {merchant} is "
                f"{to_rupees(approved):.2f}; refusing {to_rupees(amount_cap_paise):.2f}",
                error_code="THRESHOLD_EXCEEDED",
            )

        self.minted.append((merchant, amount_cap_paise))
        index = len(self.minted)
        return ScopedCard(
            cardId=f"stub-instruction-{index:03d}",
            cardToken=f"stub-token-{index:03d}",
            transactionId=f"stub-txn-{index:03d}",
            mandateId=f"stub-mandate-{key[:12]}",
            dynamicCvv="000",
            expiryMonth="12",
            expiryYear="30",
            merchant=merchant,
            amountCap=to_rupees(amount_cap_paise),
            status="issued",
            source="fixture",
        )
