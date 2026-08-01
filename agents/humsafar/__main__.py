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

from .cards import ScopedCardClient, StubScopedCardClient
from .events import EventEmitter
from .llm import Narrator
from .money import format_inr
from .orchestrator import run_goal


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

    print(
        f"\n  HUMSAFAR — {args.goal}\n"
        f"  budget      : Rs {args.budget}\n"
        f"  cards       : {'live backend route' if args.live_cards else 'STUB (simulated, not a real charge)'}\n"
        f"  discovery   : FIXTURE data (not live merchant inventory)\n"
        f"  dialogue    : {'OpenAI' if narrator.available else 'deterministic templates'}\n"
        f"  streaming   : {'off' if args.no_stream else args.backend}\n",
        file=sys.stderr,
    )

    report = run_goal(
        args.goal,
        args.budget,
        emitter,
        card_client=card_client,
        narrator=narrator,
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
    if emitter.delivery_failures:
        print(f"  note: {emitter.delivery_failures} event(s) were not delivered to the dashboard")
    print()

    return 0 if report.within_budget else 1


if __name__ == "__main__":
    raise SystemExit(main())
