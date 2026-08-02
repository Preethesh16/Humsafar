"""CLI: run a full Humsafar goal end to end.

    python -m humsafar --goal "Plan my Goa trip" --budget 30000 --demo

Defaults are chosen so a fresh clone runs with no configuration at all:
stub cards, fixture data, deterministic dialogue, and event streaming that
degrades quietly if the backend is not up. Every one of those is labelled in
the run banner, so nobody can mistake a stub run for a live one.
"""

import argparse
import os
import sys

from .approval import AutoApproval, PolledApproval
from .cards import ScopedCardClient, StubScopedCardClient
from .choice import AutoChoice, PolledChoice
from .checkout import LiveCheckout
from .config import load_env
from .discovery import BackendDiscovery, FixtureDiscovery
from .events import EventEmitter
from .llm import Narrator
from .money import format_inr
from .orchestrator import run_goal
from .processor import DeclinedByTestCard
from .reporting import ChargeReporter
from .trust import TrustClient

# Load the shared gitignored .env before anything reads os.environ. An explicit
# shell export still wins; see config.load_env.
load_env()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="humsafar", description="Run a shared-budget agent team.")
    parser.add_argument("--goal", default="Plan my Goa trip", help="What the team should achieve")
    parser.add_argument("--budget", default="30000", help="Total budget in rupees")
    parser.add_argument("--days", type=int, default=3)
    parser.add_argument("--origin")
    parser.add_argument("--destination")
    parser.add_argument("--origin-code")
    parser.add_argument("--destination-code")
    parser.add_argument("--departure-date")
    parser.add_argument("--return-date")
    parser.add_argument("--latitude", type=float)
    parser.add_argument("--longitude", type=float)
    parser.add_argument("--travelers", type=int, default=1)
    parser.add_argument("--rooms", type=int, default=1)
    parser.add_argument(
        "--travel-mode",
        choices=("compare", "flight", "train", "bus", "drive"),
        default="compare",
        help="User's preferred intercity mode; compare lets the journey specialist weigh all modes",
    )
    parser.add_argument(
        "--categories",
        default="flights,stay,food,guide",
        help="Comma-separated specialists to include: flights, stay, food, guide",
    )
    parser.add_argument(
        "--stay-style",
        choices=("compare", "hotel", "hostel", "home", "homestay"),
        default="compare",
        help="Preferred accommodation type for group-aware discovery",
    )
    parser.add_argument(
        "--backend",
        default=os.environ.get("HUMSAFAR_BACKEND_URL", "http://127.0.0.1:3000"),
        help="Base URL of the Node backend",
    )
    parser.add_argument("--no-stream", action="store_true", help="Do not POST events to the backend")
    parser.add_argument("--live-cards", action="store_true", help="Mint through the real backend route")
    # Live discovery is the DEFAULT. The backend route calls Duffel when a
    # token is configured and degrades to labelled fixtures when it is not, so
    # defaulting to local fixtures meant a configured Duffel token would simply
    # never be used. Opting out is still possible for offline work.
    parser.add_argument(
        "--local-discovery",
        action="store_true",
        help="Use the agent's own offline fixtures instead of the backend discovery route",
    )
    parser.add_argument(
        "--trust",
        action="store_true",
        help="Run the pre-purchase trust check via POST /api/trust/check",
    )
    parser.add_argument(
        "--await-approval",
        action="store_true",
        help="Wait for a real human decision via the approval API before minting",
    )
    parser.add_argument(
        "--approval-ttl", type=int, default=120, help="Approval request lifetime in seconds"
    )
    parser.add_argument(
        "--live-checkout",
        action="store_true",
        help="Use the real Prava credential and reconcile the outcome via mandate-report",
    )
    parser.add_argument(
        "--run-id", help="Correlate this run with an approval, a choice and a trace group"
    )
    parser.add_argument(
        "--await-choice",
        action="store_true",
        help="Pause for the user to pick an option per category (INTERFACES.md §6)",
    )
    parser.add_argument(
        "--choice-timeout", type=int, default=45, help="Seconds before the agent picks"
    )
    # Prava's step 4: present the card at a real merchant. Step 5 says the
    # decline IS the expected sandbox result, so this records a checkout a
    # human actually performed rather than assuming one.
    parser.add_argument(
        "--merchant", metavar="NAME", help="Merchant where the card was presented by hand"
    )
    parser.add_argument(
        "--merchant-declined",
        metavar="MESSAGE",
        help="Verbatim decline message the merchant's checkout showed",
    )
    parser.add_argument("--llm", action="store_true", help="Use OpenAI for agent dialogue")
    parser.add_argument("--overspend", metavar="AGENT", help="Have this agent attempt an over-slice charge")
    parser.add_argument("--fail", metavar="AGENT", help="Fail this agent's booking once, then recover")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Shorthand for --overspend stay --fail guide (the two demo proof shots)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    allowed_categories = ("flights", "stay", "food", "guide")
    requested_categories = tuple(
        category.strip().lower() for category in args.categories.split(",") if category.strip()
    )
    if not requested_categories or len(set(requested_categories)) != len(requested_categories):
        raise SystemExit("--categories must contain one or more unique category names")
    unknown_categories = set(requested_categories) - set(allowed_categories)
    if unknown_categories:
        raise SystemExit(f"unknown --categories value: {', '.join(sorted(unknown_categories))}")
    categories = tuple(category for category in allowed_categories if category in requested_categories)

    overspend = args.overspend or ("stay" if args.demo else None)
    fail = args.fail or ("guide" if args.demo else None)
    token = os.environ.get("INTERNAL_API_TOKEN") or None

    emitter = EventEmitter(base_url=args.backend, token=token, enabled=not args.no_stream)
    card_client = (
        ScopedCardClient(base_url=args.backend, token=token)
        if args.live_cards
        else StubScopedCardClient()
    )
    narrator = Narrator(enabled=args.llm)
    discovery_query = {
        "origin": args.origin_code,
        "destination": args.destination_code,
        "departureDate": args.departure_date,
        "checkInDate": args.departure_date,
        "checkOutDate": args.return_date,
        "passengers": args.travelers,
        "guests": args.travelers,
        "rooms": args.rooms,
        "travelMode": args.travel_mode,
        "stayStyle": args.stay_style,
        "originName": args.origin,
        "destinationName": args.destination,
        "latitude": args.latitude,
        "longitude": args.longitude,
    }
    discovery_query = {key: value for key, value in discovery_query.items() if value is not None}
    provider = (
        BackendDiscovery(
            base_url=args.backend,
            token=token,
            query=discovery_query,
            fallback=FixtureDiscovery(
                days=args.days,
                origin=args.origin or "Bengaluru",
                travel_mode=args.travel_mode,
                travelers=args.travelers,
                rooms=args.rooms,
                stay_style=args.stay_style,
            ),
        )
        if not args.local_discovery
        else FixtureDiscovery(
            days=args.days,
            origin=args.origin or "Bengaluru",
            travel_mode=args.travel_mode,
            travelers=args.travelers,
            rooms=args.rooms,
            stay_style=args.stay_style,
        )
    )
    trust = TrustClient(base_url=args.backend, token=token) if args.trust else None
    approval = (
        PolledApproval(base_url=args.backend, token=token, ttl_seconds=args.approval_ttl)
        if args.await_approval
        else AutoApproval()
    )
    processor = (
        DeclinedByTestCard(args.merchant, args.merchant_declined)
        if args.merchant and args.merchant_declined
        else None
    )
    checkout = (
        LiveCheckout(reporter=ChargeReporter(base_url=args.backend, token=token), processor=processor)
        if args.live_checkout
        else None
    )
    choice = (
        PolledChoice(args.run_id or "run-cli", emitter, base_url=args.backend, token=token,
                     timeout_seconds=args.choice_timeout)
        if args.await_choice
        else AutoChoice()
    )

    run_id = args.run_id or None
    print(
        f"\n  HUMSAFAR — {args.goal}\n"
        f"  budget      : Rs {args.budget}\n"
        f"  cards       : {'live backend route' if args.live_cards else 'STUB (simulated, not a real charge)'}\n"
        f"  discovery   : {'local FIXTURE data' if args.local_discovery else 'backend route (Duffel when configured)'}\n"
        f"  trust check : {'on' if args.trust else 'off'}\n"
        f"  approval    : {'HUMAN via approval API' if args.await_approval else 'auto (no human decision)'}\n"
        f"  checkout    : {('LIVE + merchant attempt at ' + args.merchant) if (args.live_checkout and args.merchant) else ('LIVE Prava credential, no merchant attempt' if args.live_checkout else 'SIMULATED (fixture)')}\n"
        f"  reasoning   : {'OpenAI Agents SDK' if narrator.available else 'deterministic templates'}\n"
        f"  specialists : {', '.join(categories)}\n"
        f"  streaming   : {'off' if args.no_stream else args.backend}\n",
        file=sys.stderr,
    )

    report = run_goal(
        args.goal,
        args.budget,
        emitter,
        card_client=card_client,
        narrator=narrator,
        provider=provider,
        trust=trust,
        approval=approval,
        checkout=checkout,
        choice=choice,
        run_id=args.run_id,
        overspend_agent=overspend,
        fail_agent=fail,
        categories=categories,
    )

    print("\n  ── RECEIPT ─────────────────────────────────────────────")
    for purchase in report.purchases:
        mark = "OK  " if purchase.status == "success" else "FAIL"
        print(
            f"  {mark} {purchase.agent:<8} {format_inr(purchase.amount_paise):>13}  "
            f"{purchase.description[:46]}"
        )
    for block in report.blocked:
        print(f"  BLK  {block['agent']:<8} {block['attempted']:>13,.2f}  cap {block['cap']:,.2f}")
    authorized_only = any(
        p.status == "success" and "NO merchant order" in p.detail for p in report.purchases
    )
    verb = "authorized" if authorized_only else "spent"
    print(
        f"\n  {verb} {format_inr(report.total_spent_paise)} of {format_inr(report.budget_paise)}"
        f"  |  within budget: {report.within_budget}"
    )
    if authorized_only:
        print("  note: Prava sandbox credentials issued and merchant-locked; no merchant order placed")
    if getattr(provider, "sources", None):
        # Print what each category actually resolved to, not what was asked
        # for — a live route that fell back to fixtures must not read as live.
        summary = ", ".join(f"{c}={s}" for c, s in sorted(provider.sources.items()))
        print(f"  data sources: {summary}")
    if trust is not None:
        print(f"  trust checks: {trust.checks}")
    if emitter.delivery_failures:
        print(f"  note: {emitter.delivery_failures} event(s) were not delivered to the dashboard")
    print()

    return 0 if report.within_budget else 1


if __name__ == "__main__":
    raise SystemExit(main())
