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
from .config import load_env
from .discovery import BackendDiscovery
from .events import EventEmitter
from .llm import Narrator
from .money import format_inr
from .orchestrator import run_goal
from .trust import TrustClient

# Load the shared gitignored .env before anything reads os.environ. An explicit
# shell export still wins; see config.load_env.
load_env()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="humsafar", description="Run a shared-budget agent team.")
    parser.add_argument("--goal", default="Plan my Goa trip", help="What the team should achieve")
    parser.add_argument("--budget", default="30000", help="Total budget in rupees")
    parser.add_argument(
        "--backend",
        default=os.environ.get("HUMSAFAR_BACKEND_URL", "http://127.0.0.1:3000"),
        help="Base URL of the Node backend",
    )
    parser.add_argument("--no-stream", action="store_true", help="Do not POST events to the backend")
    parser.add_argument("--live-cards", action="store_true", help="Mint through the real backend route")
    parser.add_argument(
        "--live-discovery",
        action="store_true",
        help="Discover options via POST /api/discovery/:category instead of local fixtures",
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
    provider = BackendDiscovery(base_url=args.backend, token=token) if args.live_discovery else None
    trust = TrustClient(base_url=args.backend, token=token) if args.trust else None
    approval = (
        PolledApproval(base_url=args.backend, token=token, ttl_seconds=args.approval_ttl)
        if args.await_approval
        else AutoApproval()
    )

    print(
        f"\n  HUMSAFAR — {args.goal}\n"
        f"  budget      : Rs {args.budget}\n"
        f"  cards       : {'live backend route' if args.live_cards else 'STUB (simulated, not a real charge)'}\n"
        f"  discovery   : {'backend route' if args.live_discovery else 'local FIXTURE data'}\n"
        f"  trust check : {'on' if args.trust else 'off'}\n"
        f"  approval    : {'HUMAN via approval API' if args.await_approval else 'auto (no human decision)'}\n"
        f"  reasoning   : {'OpenAI Agents SDK' if narrator.available else 'deterministic templates'}\n"
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
        overspend_agent=overspend,
        fail_agent=fail,
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
    print(
        f"\n  spent {format_inr(report.total_spent_paise)} of {format_inr(report.budget_paise)}"
        f"  |  within budget: {report.within_budget}"
    )
    if provider is not None and provider.sources:
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
