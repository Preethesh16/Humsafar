"""The Orchestrator — goal in, executed plan out.

Runs the whole flow from brainstorming.md §7:

    goal + budget -> specialists -> negotiation -> one approval
      -> a scoped card per agent -> purchases
      -> recover any failed slice -> receipt

Two demo beats are first-class here rather than bolted on, because both are
recovery paths a real product needs anyway:

  * `overspend_agent` makes one agent attempt a charge above its slice, so the
    card network refuses it on screen.
  * `fail_agent` makes one booking fail after its card was issued, so the
    orchestrator re-negotiates *only that slice* instead of restarting.
"""

from dataclasses import dataclass, field, replace
from inspect import signature
from typing import Optional
from uuid import uuid4

from .approval import AutoApproval
from .cards import ScopedCard, StubScopedCardClient
from .choice import AutoChoice, option_id
from .checkout import Checkout, SimulatedCheckout
from .discovery import DiscoveryProvider, FixtureDiscovery
from .intent import GoalIntent, parse_intent
from .events import EventEmitter
from .guardian import Guardian
from .mediator import Mediator
from .models import WIRE_CATEGORIES, NegotiationResult, Option, Purchase, Specialist
from .money import format_inr, to_paise, to_rupees
from .negotiation import NegotiationEngine, build_specialists

# How far over its slice the overspend beat reaches. Comfortably past any cap,
# so a refusal is unambiguous rather than a rounding argument.
OVERSPEND_MULTIPLIER = 1.6


@dataclass
class RunConfig:
    goal: str
    budget_paise: int
    # When supplied by the conversational intake this is the user's exact
    # scope. It overrides roster inference, so "no guide" cannot be undone by
    # an LLM or the travel-goal safety restoration in intent.py.
    categories: Optional[tuple[str, ...]] = None
    overspend_agent: Optional[str] = None
    fail_agent: Optional[str] = None
    auto_approve: bool = True
    # Correlates this run across the agent layer, the approval protocol
    # (INTERFACES.md §7) and the OpenAI trace group. Generated when absent so a
    # run is always identifiable.
    run_id: str = field(default_factory=lambda: f"run-{uuid4().hex[:12]}")


@dataclass
class RunReport:
    goal: str
    budget_paise: int
    negotiation: Optional[NegotiationResult]
    purchases: list[Purchase] = field(default_factory=list)
    blocked: list[dict] = field(default_factory=list)
    renegotiated: list[str] = field(default_factory=list)
    approved: bool = False

    @property
    def total_spent_paise(self) -> int:
        return sum(p.amount_paise for p in self.purchases if p.status == "success")

    @property
    def within_budget(self) -> bool:
        return self.total_spent_paise <= self.budget_paise


class Orchestrator:
    def __init__(
        self,
        emitter: EventEmitter,
        card_client=None,
        checkout: Optional[Checkout] = None,
        provider: Optional[DiscoveryProvider] = None,
        narrator=None,
        trust=None,
        approval=None,
        choice=None,
    ) -> None:
        self.emitter = emitter
        self.card_client = card_client or StubScopedCardClient()
        self.checkout = checkout or SimulatedCheckout()
        self.provider = provider or FixtureDiscovery()
        self.narrator = narrator
        self.trust = trust
        self.approval = approval or AutoApproval()
        # AutoChoice keeps the pre-§6 behaviour exactly and reports
        # 'agent-timeout', never 'user'.
        self.choice = choice or AutoChoice()
        self.mediator = Mediator()
        self.intent = GoalIntent(categories=[])

    def run(self, config: RunConfig) -> RunReport:
        # One OpenAI trace group per Humsafar run, so a trace can be correlated
        # with an approval record and a receipt. Sensitive capture is disabled
        # by default in ai.py: the trace shows which agent spoke, never a key,
        # card token, CVV, expiry or raw Prava response.
        runtime = getattr(self.narrator, "runtime", None)
        if runtime is not None and hasattr(runtime, "trace_run"):
            with runtime.trace_run(config.run_id):
                return self._run(config)
        return self._run(config)

    def _run(self, config: RunConfig) -> RunReport:
        # Every event is run-scoped. The backend uses this to keep a new
        # browser session from replaying an earlier trip into the same UI.
        self.emitter.run_id = config.run_id
        report = RunReport(goal=config.goal, budget_paise=config.budget_paise, negotiation=None)

        specialists = self._assemble(config)
        if not specialists:
            self._say(
                "orchestrator",
                f"I could not find any purchasable options for {config.goal!r}. Nothing to negotiate.",
            )
            return report

        report.negotiation = self._negotiate(specialists, config)
        allocations = report.negotiation.allocations_paise

        # Taste is settled before approval. The backend digest binds both the
        # monetary split and these exact option IDs, so an approval can never
        # be reused after a room, flight or price changes.
        choices = self._choose(specialists, allocations, config)

        if not self._approve(allocations, choices, config):
            self._say("orchestrator", "Approval declined. No cards minted, no money moved.")
            return report

        report.approved = True
        by_category = {s.category: s for s in specialists}

        for specialist in specialists:
            self._execute(
                specialist,
                allocations[specialist.category],
                choices.get(specialist.category),
                config,
                report,
            )

        self._recover(by_category, allocations, choices, config, report)
        self._close(report)
        return report

    # -- phases ---------------------------------------------------------

    def _assemble(self, config: RunConfig) -> list[Specialist]:
        # Goal parsing is the one genuinely linguistic step in the run, so it is
        # where a model earns its place. Everything it returns is validated, and
        # a failure falls back to the keyword parser rather than blocking.
        self.intent = parse_intent(config.goal, getattr(self.narrator, "runtime", None))
        if config.categories is not None:
            self.intent = GoalIntent(
                categories=list(config.categories),
                weights={category: self.intent.weight_for(category) for category in config.categories},
                summary=self.intent.summary,
                source=f"{self.intent.source}+user-scope",
            )
        categories = self.intent.categories

        emphasis = ", ".join(
            f"{c} ({self.intent.weight_for(c):.0%})" for c in categories
        )
        self._say(
            "orchestrator",
            f"Goal: {config.goal}. Budget: {format_inr(config.budget_paise)}. "
            f"Bringing in {len(categories)} specialists — {emphasis}. "
            f"[intent: {self.intent.source}]",
        )

        specialists = build_specialists(categories, self.provider, config.goal)
        for specialist in specialists:
            sources = {o.source for o in specialist.options}
            self._say(
                specialist.category,
                f"Found {len(specialist.options)} options "
                f"({'/'.join(sorted(sources))} data). Cheapest viable is "
                f"{format_inr(specialist.minimum_paise)}.",
            )
        return specialists

    def _negotiate(self, specialists: list[Specialist], config: RunConfig) -> NegotiationResult:
        engine = NegotiationEngine(
            specialists=specialists,
            budget_paise=config.budget_paise,
            mediator=self.mediator,
            on_message=self._say,
            on_split=lambda allocations, rnd: self.emitter.split_update(
                allocations, config.budget_paise, rnd
            ),
            narrator=self.narrator,
            intent=self.intent,
        )
        result = engine.run()
        self._say(
            "orchestrator",
            f"Negotiation closed after {len(result.rounds)} round(s) ({result.exit_reason}). "
            f"Allocated {format_inr(result.total_allocated_paise)} of "
            f"{format_inr(config.budget_paise)}.",
        )
        return result

    def _choose(
        self,
        specialists: list[Specialist],
        allocations: dict[str, int],
        config: RunConfig,
    ) -> dict[str, object]:
        """Settle every affordable option before the plan is approved."""
        chosen = {}
        for specialist in specialists:
            slice_paise = allocations[specialist.category]
            picked = self.choice.choose(
                specialist.category, specialist.options, slice_paise
            )
            if picked is None:
                continue

            effective, trust_note = self._apply_trust(
                specialist, picked.option, slice_paise
            )
            picked.trust_note = trust_note
            if effective != picked.option:
                # A safety-driven replacement is not the user's choice. Keep
                # that distinction all the way to the receipt and audit log.
                picked.option = effective
                picked.chosen_by = "agent-timeout"
                self._say(
                    specialist.category,
                    "Your selected merchant did not clear the trust check; "
                    f"the agent selected {effective.vendor} before approval.{trust_note}",
                )

            chosen[specialist.category] = picked
            self.emitter.choice_made(
                config.run_id,
                specialist.category,
                option_id(specialist.category, picked.option),
                picked.option.vendor,
                picked.option.price_paise,
                picked.chosen_by,
            )
            if picked.by_user:
                self._say(
                    specialist.category,
                    f"You chose {picked.option.vendor} — {picked.option.description} at "
                    f"{format_inr(picked.option.price_paise)}. Adding exactly that to approval.",
                )
        return chosen

    def _approve(
        self, allocations: dict[str, int], choices: dict[str, object], config: RunConfig
    ) -> bool:
        """Run the §7 approval protocol. Nothing is minted without it."""
        # Negotiation contains only active specialists, while the locked
        # approval contract always carries all four keys. Preserve the user's
        # narrow roster and project omitted categories as explicit zeroes only
        # at this wire boundary.
        approval_allocations = {
            category: allocations.get(category, 0) for category in WIRE_CATEGORIES
        }
        choice_ids = {
            category: option_id(category, picked.option)
            for category, picked in choices.items()
        }
        request_parameters = signature(self.approval.request).parameters
        if len(request_parameters) >= 3:
            record = self.approval.request(config.run_id, approval_allocations, choice_ids)
        else:
            # Compatibility for small offline/test approval adapters written
            # against the original two-argument protocol. The production
            # PolledApproval always takes the choices and binds them in the
            # backend digest.
            record = self.approval.request(config.run_id, approval_allocations)
        if record is None:
            self._say(
                "orchestrator",
                "Could not create an approval request, so nothing will be minted. "
                f"{getattr(self.approval, 'last_error', '')}".strip(),
            )
            return False

        self.emitter.approval_requested(
            approval_allocations,
            choices=choice_ids,
            run_id=record.run_id,
            approval_request_id=record.approval_request_id,
            digest=record.digest,
            expires_at=record.expires_at,
        )
        self._say(
            "orchestrator",
            "Sending the exact split and selected options for one plan approval. After this, "
            "no agent can change the plan or spend outside its own slice."
            + (
                f" Waiting for a decision (expires {record.expires_at})."
                if self.approval.requires_human
                else " [auto-approved: no human decision was taken]"
            ),
        )

        if not config.auto_approve and not self.approval.requires_human:
            return False

        decided = self.approval.await_decision(record)
        if not decided.approved:
            self._say(
                "orchestrator",
                f"Approval {decided.status}. No cards minted, no money moved.",
            )
            return False

        # Consume immediately before the first mint. A second consume, an
        # expiry, or a digest that no longer matches the plan fails closed —
        # which is what stops a stale approval authorising a different run.
        if not self.approval.consume(decided):
            self._say(
                "orchestrator",
                "Approval could not be consumed, so it may already have been used or the plan "
                "changed since it was granted. Refusing to mint.",
            )
            return False

        self.emitter.approval_given(
            run_id=decided.run_id,
            approval_request_id=decided.approval_request_id,
            digest=decided.digest,
        )
        return True

    def _execute(
        self,
        specialist: Specialist,
        slice_paise: int,
        picked,
        config: RunConfig,
        report: RunReport,
    ) -> None:
        option = picked.option if picked is not None else specialist.cheapest_within(slice_paise)
        if option is None:
            self._say(
                specialist.category,
                f"My slice is {format_inr(slice_paise)} and the cheapest thing I found is "
                f"{format_inr(specialist.minimum_paise)}. I can't buy anything with this.",
            )
            report.purchases.append(
                Purchase(
                    agent=specialist.category,
                    merchant="none",
                    description="no affordable option",
                    amount_paise=0,
                    status="failed",
                    card_id="",
                    source="fixture",
                    detail=f"Slice {format_inr(slice_paise)} is below the category floor",
                    option_id="",
                    chosen_by="",
                )
            )
            self.emitter.purchase_result(
                specialist.category,
                "failed",
                0,
                "none",
                f"No option within the {format_inr(slice_paise)} slice",
            )
            return

        trust_note = getattr(picked, "trust_note", "") if picked is not None else ""

        guardian = Guardian({o.merchant for o in specialist.options})
        verdict = guardian.check(specialist.category, option, slice_paise, config.goal)
        if not verdict.allowed:
            self._record_block(specialist.category, option.price_paise, slice_paise, verdict.reason, report)
            return

        # Tell the card layer what this merchant's mandate was approved at,
        # before any charge. A no-op against live Prava, where mandates are
        # provisioned out of band by the operator script.
        authorize = getattr(self.card_client, "authorize", None)
        if authorize is not None:
            authorize(option.merchant, slice_paise)

        # The over-cap proof runs BEFORE the real purchase, deliberately.
        # Afterwards, a `max_charges: 1` mandate is already consumed, so the
        # refusal would come from an exhausted use limit rather than the amount
        # cap — proving the wrong thing while claiming card-network enforcement.
        if config.overspend_agent == specialist.category:
            self._attempt_overspend(specialist, option, slice_paise, report)

        # Two ceilings, deliberately different.
        #
        # The *mandate* is approved at the agreed slice — that is the property
        # the whole product rests on, and it is what `authorize()` above pins.
        # No credential for this agent can ever exceed its slice or reach
        # another agent's money.
        #
        # The *credential* is minted at the price of the thing being bought,
        # which is the minimum that can complete this purchase. Minting at the
        # slice used to overstate it: on the converged path price == slice so
        # nothing showed, but after `forced_compromise` or a recovery the two
        # diverge, and the mandate was then charged more than the receipt
        # reported. Least privilege and an honest receipt are the same fix.
        card = self.card_client.mint(option.merchant, option.price_paise)
        if not card.issued:
            self._say(
                specialist.category,
                f"No card, no purchase: {card.get('error', 'issuance failed')}",
            )
            self.emitter.purchase_result(
                specialist.category,
                "failed",
                0,
                option.merchant,
                f"Card issuance failed: {card.get('error', 'unknown error')}",
            )
            report.purchases.append(
                Purchase(
                    agent=specialist.category,
                    merchant=option.merchant,
                    description=option.description,
                    amount_paise=0,
                    status="failed",
                    card_id="",
                    source="fixture",
                    detail=str(card.get("error", "card issuance failed")),
                    option_id=option_id(specialist.category, option),
                    chosen_by=getattr(picked, "chosen_by", ""),
                )
            )
            return

        # `amountCap` is what the credential itself permits; `mandateCap` is the
        # slice the mandate was approved at. Both are shown, because "capped at
        # ₹4,200 inside a mandate approved for ₹4,800" is the actual guarantee
        # and reporting only one of them loses half of it.
        self.emitter.card_issued(
            specialist.category, card["cardId"], option.price_paise, slice_paise
        )
        result = self.checkout.pay(option, card)
        status = "success" if result.ok else "failed"
        outcome = result.get("outcome", "")
        amount = option.price_paise if result.ok and outcome != "credential_issued" else 0
        # One string for both the audit record and the streamed event — the
        # receipt is built from these, and a receipt that disagrees with the
        # live feed is worse than either one alone.
        detail = f"{result.get('detail', '')}{trust_note}"

        report.purchases.append(
            Purchase(
                agent=specialist.category,
                merchant=option.merchant,
                description=f"{option.vendor} — {option.description}",
                amount_paise=amount,
                status=status,
                card_id=card["cardId"],
                source=result.get("source", "fixture"),
                detail=detail,
                option_id=option_id(specialist.category, option),
                chosen_by=getattr(picked, "chosen_by", ""),
                outcome=outcome,
            )
        )
        self.emitter.purchase_result(
            specialist.category,
            status,
            amount,
            option.merchant,
            detail,
            result.get("source", "fixture"),
            outcome,
        )
        action = "Authorized" if "NO merchant order" in detail else (
            "Simulated" if result.get("source") == "fixture" and result.ok else
            "Booked" if result.ok else "Failed"
        )
        self._say(
            specialist.category,
            f"{action} {option.vendor} at {format_inr(option.price_paise)} on a card capped at "
            f"exactly that, inside a mandate approved for {format_inr(slice_paise)}.",
        )

    def _apply_trust(
        self, specialist: Specialist, option: Option, slice_paise: int
    ) -> tuple[Option, str]:
        """Let the trust score change the merchant, not just annotate it.

        The Senso track asks for the score to materially influence a decision.
        So a flagged merchant loses the sale to the next acceptable option that
        still fits the slice. If nothing clears, the agent buys anyway and the
        flag is carried into the purchase details — the backend's current
        heuristic labels itself as a fixture, and refusing to buy on a
        placeholder would fail the demo for no real safety gain.
        """
        if self.trust is None:
            return option, ""

        verdict = self.trust.check(option)
        if verdict.allowed:
            return option, ""

        alternatives = sorted(
            (
                o
                for o in specialist.options
                if o.price_paise <= slice_paise and o.merchant != option.merchant
            ),
            key=lambda o: (-o.rating, o.price_paise),
        )
        for candidate in alternatives:
            if self.trust.check(candidate).allowed:
                self._say(
                    specialist.category,
                    f"Trust check flagged {option.vendor} ({verdict.decision}, score "
                    f"{verdict.score:.2f}). Switching to {candidate.vendor} instead.",
                )
                return candidate, f" [trust: switched from {option.vendor}, {verdict.source} score]"

        self._say(
            specialist.category,
            f"Trust check flagged {option.vendor} ({verdict.decision}, score "
            f"{verdict.score:.2f}) and no alternative cleared. Proceeding, flagged.",
        )
        return option, f" [trust: {verdict.decision}, {verdict.source} score, not blocked]"

    def _recover(
        self,
        by_category: dict[str, Specialist],
        allocations: dict[str, int],
        choices: dict[str, object],
        config: RunConfig,
        report: RunReport,
    ) -> None:
        """Re-negotiate only a failed slice, then require a fresh approval."""
        failures = [p for p in report.purchases if p.status == "failed" and p.agent in by_category]
        if not failures:
            return

        for failure in failures:
            specialist = by_category[failure.agent]
            freed = allocations[failure.agent]
            unspent = report.budget_paise - report.total_spent_paise
            available = min(freed, unspent)

            self.emitter.renegotiation_triggered(
                failure.agent,
                f"{failure.agent} booking failed after its card was issued; re-negotiating that "
                f"slice only ({format_inr(available)} available)",
            )
            self._say(
                "mediator",
                f"{specialist.display_name} lost its booking. Only its slice goes back on the "
                f"table — the other three purchases stand. Retrying inside "
                f"{format_inr(available)}.",
            )
            report.renegotiated.append(failure.agent)

            alternatives = [
                option
                for option in specialist.options
                if option.merchant != failure.merchant and option.price_paise <= available
            ]
            if not alternatives:
                self._say(
                    specialist.category,
                    f"No different option remains under {format_inr(available)}. Standing down.",
                )
                continue

            retry_specialist = replace(specialist, options=alternatives)
            retry_choices = self._choose(
                [retry_specialist],
                {specialist.category: available},
                config,
            )
            picked = retry_choices.get(specialist.category)
            if picked is None:
                continue
            option = picked.option

            revised_choices = {**choices, specialist.category: picked}
            if not self._approve(allocations, revised_choices, config):
                self._say(
                    specialist.category,
                    "Replacement was not approved. The failed slice remains unspent.",
                )
                continue
            choices[specialist.category] = picked

            authorize = getattr(self.card_client, "authorize", None)
            if authorize is not None:
                authorize(option.merchant, available)

            card = self.card_client.mint(option.merchant, available)
            if not card.issued:
                self._say(
                    specialist.category,
                    f"Retry blocked at issuance: {card.get('error', 'unknown error')}",
                )
                continue

            self.emitter.card_issued(specialist.category, card["cardId"], available)
            result = self.checkout.pay(option, card)
            if not result.ok:
                self.emitter.purchase_result(
                    specialist.category,
                    "failed",
                    0,
                    option.merchant,
                    result.get("detail", ""),
                    result.get("source", "fixture"),
                    result.get("outcome", ""),
                )
                continue

            failure.status = "success"
            failure.merchant = option.merchant
            failure.description = f"{option.vendor} — {option.description}"
            recovery_outcome = result.get("outcome", "")
            failure.amount_paise = 0 if recovery_outcome == "credential_issued" else option.price_paise
            failure.card_id = card["cardId"]
            failure.source = result.get("source", "fixture")
            failure.detail = f"Recovered after re-negotiation. {result.get('detail', '')}"
            failure.option_id = option_id(specialist.category, option)
            failure.chosen_by = picked.chosen_by
            failure.outcome = recovery_outcome

            self.emitter.purchase_result(
                specialist.category,
                "success",
                failure.amount_paise,
                option.merchant,
                failure.detail,
                failure.source,
                failure.outcome,
            )
            self._say(
                specialist.category,
                f"Recovered — {option.vendor} at {format_inr(option.price_paise)}, "
                f"still inside the original slice.",
            )

    def _attempt_overspend(
        self, specialist: Specialist, option: Option, slice_paise: int, report: RunReport
    ) -> None:
        """The proof shot: try to charge past the slice and get refused.

        Routed through a real mint call on purpose. The guardian could reject
        this in software in a microsecond, but then the block would be our `if`
        statement, not the card network — and the card network is what we claim
        on stage. See guardian.py for the full reasoning.

        Aimed at the merchant this agent is *about to buy from*, so the mandate
        in play is the one that actually covers the purchase. Pointing it at any
        other merchant would be refused as `MANDATE_MERCHANT_NOT_ALLOWED` — a
        real refusal, but for entirely the wrong reason.
        """
        attempted = int(slice_paise * OVERSPEND_MULTIPLIER)

        self._say(
            specialist.category,
            f"Trying a {format_inr(attempted)} upgrade — {format_inr(attempted - slice_paise)} "
            f"past my agreed slice.",
        )

        card = self.card_client.mint(option.merchant, attempted)
        if card.issued:
            # Worth failing loudly: if this ever succeeds, the safety claim at
            # the centre of the product is not true and must not be demoed.
            self._say(
                "orchestrator",
                f"WARNING: an over-slice charge of {format_inr(attempted)} was authorised. The "
                f"cap is not being enforced — do not present this as a blocked attempt.",
            )
            return

        reason = Guardian.describe_card_block(
            specialist.display_name,
            attempted,
            slice_paise,
            card.error_code,
            str(card.get("error", "")),
        )
        self._record_block(specialist.category, attempted, slice_paise, reason, report)

    def _close(self, report: RunReport) -> None:
        purchases = [
            {
                "agent": p.agent,
                "merchant": p.merchant,
                "description": p.description,
                "amount": to_rupees(p.amount_paise),
                "status": p.status,
                "cardId": p.card_id,
                "source": p.source,
                "details": p.detail,
                "optionId": p.option_id or None,
                "chosenBy": p.chosen_by or None,
                "outcome": p.outcome or None,
            }
            for p in report.purchases
        ]
        succeeded = sum(1 for p in report.purchases if p.status == "success")
        self._say(
            "orchestrator",
            f"Done. {succeeded}/{len(report.purchases)} execution steps succeeded, "
            f"{format_inr(report.total_spent_paise)} recorded against "
            f"{format_inr(report.budget_paise)}. "
            f"{format_inr(report.budget_paise - report.total_spent_paise)} remains unspent.",
        )
        # Emitted last, deliberately: `final_receipt` is the dashboard's signal
        # that the run is over, so nothing may follow it.
        self.emitter.final_receipt(purchases, report.total_spent_paise, report.budget_paise)

    # -- helpers --------------------------------------------------------

    def _record_block(
        self, agent: str, attempted_paise: int, cap_paise: int, reason: str, report: RunReport
    ) -> None:
        report.blocked.append(
            {"agent": agent, "attempted": to_rupees(attempted_paise), "cap": to_rupees(cap_paise), "reason": reason}
        )
        self.emitter.blocked_attempt(agent, attempted_paise, cap_paise, reason)
        self._say("orchestrator", reason)

    def _say(self, agent: str, message: str) -> None:
        self.emitter.agent_message(agent, message)


def run_goal(
    goal: str,
    budget_rupees,
    emitter: EventEmitter,
    **kwargs,
) -> RunReport:
    """Convenience entry point used by the CLI and the tests."""
    config = RunConfig(
        goal=goal,
        budget_paise=to_paise(budget_rupees),
        categories=kwargs.pop("categories", None),
        overspend_agent=kwargs.pop("overspend_agent", None),
        fail_agent=kwargs.pop("fail_agent", None),
        auto_approve=kwargs.pop("auto_approve", True),
        run_id=kwargs.pop("run_id", None) or f"run-{uuid4().hex[:12]}",
    )
    kwargs.setdefault("trust", None)
    kwargs.setdefault("choice", None)
    # The failure beat is a property of checkout, but it is configured on the
    # run — wire it here so callers only have to name the agent.
    if config.fail_agent and "checkout" not in kwargs:
        kwargs["checkout"] = SimulatedCheckout(fail_categories=(config.fail_agent,))

    orchestrator = Orchestrator(emitter, **kwargs)
    return orchestrator.run(config)
