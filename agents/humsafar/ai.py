"""OpenAI Agents SDK runtime for Humsafar.

Holds the agent definitions and the one place that actually calls a model.
Three rules from `execution-plan.md` are enforced here rather than trusted to
the caller:

1. **A missing or dead key must produce a complete run.** Every entry point
   returns `None` on any failure, and callers fall back to deterministic text
   with identical numbers. There is no code path where the demo dies because
   OpenAI did.
2. **One trace group per `runId`,** with sensitive capture off by default. The
   trace shows which agent spoke and when; it must never carry a key, a card
   token, a CVV, an expiry, or a raw Prava response.
3. **Logical separation comes from agent definitions, not from keys.** One
   server-side credential runs all five agents; their identities come from
   distinct names, instructions and output schemas.

No agent defined here is given a tool. They reason and they speak; they cannot
mint a card, call a merchant, read a secret, or touch the filesystem. Payment
execution stays in ordinary audited code behind explicit human approval.
"""

import asyncio
import os
import sys
from typing import Optional, TypeVar

from pydantic import BaseModel

from .schemas import AgentArgument, GoalPlan, MediatorSummary

T = TypeVar("T", bound=BaseModel)

# Cheap model for the repeated specialist turns, stronger one reserved for
# arbitration and goal parsing — the split brainstorming.md §4 asked for.
#
# Two measured constraints drove this choice, both worth keeping in mind if it
# is ever changed:
#
# 1. **Do not use a reasoning model for dialogue.** gpt-5-nano spent 31.8s of
#    extended thinking to produce one two-sentence negotiating line. Four of
#    those per round is not a demo, it is a stall. gpt-4.1-nano returns the same
#    job in ~2.2s.
# 2. **Rate limits are per-model.** On a free/unverified tier gpt-4.1-mini
#    allows only 50 requests per DAY, and this account exhausted it during
#    development while other models still had quota. A demo must not depend on
#    a bucket that ordinary iteration can drain.
SPECIALIST_MODEL = os.environ.get("HUMSAFAR_SPECIALIST_MODEL", "gpt-4.1-nano")
REASONING_MODEL = os.environ.get("HUMSAFAR_REASONING_MODEL", "gpt-5.6-sol")

DEFAULT_TIMEOUT = float(os.environ.get("HUMSAFAR_AGENT_TIMEOUT", "12"))

# Concurrency for one negotiation round. Free-tier RPM can be as low as 10, and
# four specialists plus the intent and mediator calls already sit close to that
# in a single minute, so a round is never allowed to burst wider than this.
ROUND_CONCURRENCY = int(os.environ.get("HUMSAFAR_ROUND_CONCURRENCY", "4"))

# Turned on before the SDK is imported anywhere else in the process. These are
# the documented switches that keep model and tool payloads out of traces.
_SENSITIVE_DEFAULTS = {
    "OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA": "0",
    "OPENAI_AGENTS_DONT_LOG_MODEL_DATA": "1",
    "OPENAI_AGENTS_DONT_LOG_TOOL_DATA": "1",
}
for _name, _value in _SENSITIVE_DEFAULTS.items():
    os.environ.setdefault(_name, _value)


SPECIALIST_IDENTITIES = {
    "flights": (
        "Journey Agent",
        "You compare the user's requested way of getting there: flight, train, "
        "bus or road. You care about total time, comfort, baggage, night travel "
        "and the real trade-off against the rest of the trip budget.",
    ),
    "stay": (
        "Stay Agent",
        "You book accommodation. You argue that where someone sleeps shapes "
        "the whole trip, and you resist being treated as the flexible one just "
        "because hotels have a wide price range.",
    ),
    "food": (
        "Food Agent",
        "You handle eating. Your budget is the smallest at the table and you "
        "point out that it is also the one people remember.",
    ),
    "guide": (
        "Guide Agent",
        "You handle activities and local experiences. You argue that a trip "
        "with nothing planned is just an expensive nap.",
    ),
}

_SHARED_RULES = (
    "You are one specialist in a team of buying agents sharing ONE fixed budget. "
    "Argue for your category in at most two sentences — direct, specific, a "
    "little territorial, never rude. "
    "CRITICAL: use ONLY the figures given to you. Never invent, estimate, round "
    "or calculate an amount. You do not decide allocations; a deterministic "
    "engine does. Never mention being an AI. No preamble, no quotes."
)

INTENT_INSTRUCTIONS = (
    "You read a shopping or travel goal and decide which specialist buying "
    "agents are needed.\n"
    "Choose ONLY from: flights, stay, food, guide.\n"
    "  flights — the intercity journey there and back; this key also covers train, bus and road\n"
    "  stay    — accommodation\n"
    "  food    — meals and drinks\n"
    "  guide   — activities, tours, local experiences, transport on the ground\n"
    "Omit any category the goal does not need — a goal about setting up a "
    "kitchen needs none of the travel ones, so return only what genuinely "
    "applies.\n"
    "Set weight from the user's own emphasis: 0.5 is neutral, higher if they "
    "stress it ('I want to eat well'), lower if they play it down ('anywhere "
    "cheap to sleep').\n"
    "NEVER state, guess or split any amount of money. You do not see the "
    "budget and you must not invent one."
)

MEDIATOR_INSTRUCTIONS = (
    "You are the neutral mediator in a team of buying agents sharing one fixed "
    "budget. You did NOT choose the split — a deterministic engine did, and you "
    "are explaining its outcome to the user.\n"
    "Explain in two or three sentences why the settlement is fair: who conceded, "
    "who held their floor, and what the leftover bought.\n"
    "CRITICAL: use ONLY the figures given to you. Never invent, recompute or "
    "round an amount. Never claim you decided the numbers."
)


class AgentRuntime:
    """Owns availability, agent definitions and the single model call site."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        enabled: bool = True,
        timeout: float = DEFAULT_TIMEOUT,
        specialist_model: str = SPECIALIST_MODEL,
        reasoning_model: str = REASONING_MODEL,
    ) -> None:
        self.timeout = timeout
        self.specialist_model = specialist_model
        self.reasoning_model = reasoning_model
        self.calls = 0
        self.failures = 0
        self.rate_limited = False
        self._agents: dict[str, object] = {}
        self._reported = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        key = api_key or os.environ.get("OPENAI_API_KEY")
        self.available = bool(enabled and key)

        if not self.available:
            self._degrade("narration disabled" if not enabled else "no OPENAI_API_KEY set")
            return

        try:
            from agents import set_tracing_disabled  # noqa: F401

            self._build_agents()
        except Exception as exc:  # noqa: BLE001 - any SDK/config problem degrades
            self.available = False
            self._degrade(f"Agents SDK unavailable: {exc}")

    # -- agent definitions ----------------------------------------------

    def _build_agents(self) -> None:
        from agents import Agent

        for category, (name, persona) in SPECIALIST_IDENTITIES.items():
            self._agents[category] = Agent(
                name=name,
                instructions=f"{persona}\n\n{_SHARED_RULES}",
                model=self.specialist_model,
                output_type=AgentArgument,
            )

        self._agents["intent"] = Agent(
            name="Budget Strategy Agent",
            instructions=INTENT_INSTRUCTIONS,
            model=self.reasoning_model,
            output_type=GoalPlan,
        )
        self._agents["mediator"] = Agent(
            name="Mediator",
            instructions=MEDIATOR_INSTRUCTIONS,
            model=self.reasoning_model,
            output_type=MediatorSummary,
        )

    # -- tracing ---------------------------------------------------------

    def trace_run(self, run_id: str):
        """One trace group per Humsafar run, or a no-op when unavailable.

        Returns a context manager either way so callers never branch on it.
        """
        if not self.available:
            return _NullTrace()
        try:
            from agents import trace

            return trace(workflow_name="humsafar-run", group_id=run_id)
        except Exception:  # noqa: BLE001
            return _NullTrace()

    # -- the single call site --------------------------------------------

    def ask(self, agent_key: str, prompt: str, timeout: Optional[float] = None) -> Optional[BaseModel]:
        """Run one agent. Returns its parsed output, or None on any failure.

        None is the contract for "use the deterministic path". Callers must
        never distinguish a missing key from a timeout from a refusal — all
        three mean the same thing to the run.
        """
        if not self.available:
            return None

        agent = self._agents.get(agent_key)
        if agent is None:
            return None

        limit = timeout if timeout is not None else self.timeout
        try:
            from agents import Runner

            self.calls += 1
            return self._drive(self._attempt(agent, prompt, limit))
        except asyncio.TimeoutError:
            self._degrade(f"{agent_key} timed out after {limit}s")
            return None
        except Exception as exc:  # noqa: BLE001 - never let reasoning break a run
            self._note_exception(exc)
            self._degrade(f"{agent_key} call failed: {type(exc).__name__}")
            return None

    def ask_many(
        self, requests: list[tuple[str, str]], timeout: Optional[float] = None
    ) -> list[Optional[BaseModel]]:
        """Run several agents concurrently. Same None-on-failure contract.

        The specialists in one negotiation round argue independently, so running
        them sequentially just adds their latencies together — about 10s a round
        against a demo beat that is only supposed to last 45s. Concurrency here
        is the difference between a negotiation that reads live and one the
        audience waits through.

        Results come back positionally, and one agent failing never affects the
        others: a failed slot is `None` and falls back to deterministic text.
        """
        if not self.available or not requests:
            return [None] * len(requests)

        limit = timeout if timeout is not None else self.timeout

        try:
            from agents import Runner

            gate = asyncio.Semaphore(max(1, ROUND_CONCURRENCY))

            async def _one(agent_key: str, prompt: str):
                agent = self._agents.get(agent_key)
                if agent is None:
                    return None
                async with gate:
                    try:
                        return await self._attempt(agent, prompt, limit)
                    except Exception as exc:  # noqa: BLE001 - per-slot isolation
                        self._note_exception(exc)
                        return None

            async def _all():
                return await asyncio.gather(*(_one(k, p) for k, p in requests))

            self.calls += len(requests)
            results = self._drive(_all())
        except Exception as exc:  # noqa: BLE001
            self._degrade(f"batch call failed: {type(exc).__name__}")
            return [None] * len(requests)

        missing = sum(1 for r in results if r is None)
        if missing:
            self._degrade(f"{missing}/{len(requests)} agent(s) fell back this round")
        return list(results)

    # -- internals -------------------------------------------------------

    def _drive(self, coro):
        """Run a coroutine on this runtime's own, persistent event loop.

        `asyncio.run` creates and destroys a loop per call, and the OpenAI
        client's HTTP connection pool binds to the loop it was first used on.
        After a couple of calls the pool is holding connections tied to loops
        that no longer exist, and the next request dies with an
        `APIConnectionError` that looks exactly like a network fault.

        Observed as: intent and the specialist round succeeding, then the
        mediator failing every single time. One loop for the runtime's lifetime
        removes the whole class of problem.
        """
        if self._loop is None or self._loop.is_closed():
            self._loop = asyncio.new_event_loop()
        return self._loop.run_until_complete(coro)

    def close(self) -> None:
        """Release the runtime's event loop. Safe to call more than once."""
        loop, self._loop = self._loop, None
        if loop is not None and not loop.is_closed():
            loop.close()

    async def _attempt(self, agent, prompt: str, limit: float):
        """One call, with a single retry for transient transport failures.

        Connection errors to the API proved intermittent on this network —
        roughly one call in six, hitting whichever agent happened to be next
        rather than any particular one. A single bounded retry converts most of
        those into a successful line instead of a silent fallback.

        Deliberately narrow, per `precaution.md`: retry transport faults only.
        A rate limit is never retried — it will not clear inside a run, and
        retrying it just burns the remaining per-minute allowance.
        """
        from agents import Runner

        for attempt in (1, 2):
            try:
                result = await asyncio.wait_for(Runner.run(agent, prompt), timeout=limit)
                return result.final_output
            except asyncio.TimeoutError:
                raise
            except Exception as exc:  # noqa: BLE001
                if attempt == 2 or not self._is_transient(exc):
                    raise
                await asyncio.sleep(0.4)
        return None

    @staticmethod
    def _is_transient(exc: BaseException) -> bool:
        name = type(exc).__name__
        if name == "RateLimitError" or "429" in str(exc)[:80]:
            return False
        return name in {"APIConnectionError", "APITimeoutError", "InternalServerError"}

    def _note_exception(self, exc: BaseException) -> None:
        """Stop calling out entirely once the account is rate-limited.

        A 429 will not clear within a run, so continuing to call wastes the
        remaining per-minute allowance and — worse during a live demo — adds
        seconds of dead air per agent while every request fails in turn. One
        rate-limit response switches the whole run to deterministic text.
        """
        if type(exc).__name__ == "RateLimitError" or "429" in str(exc)[:80]:
            self.rate_limited = True
            self.available = False
            self._degrade("OpenAI rate limit reached; run continues deterministically")

    def _degrade(self, reason: str) -> None:
        self.failures += 1
        if not self._reported:
            # Reason only — never the exception body, which could carry a
            # request payload or a key fragment.
            print(f"[ai] deterministic fallback in use ({reason})", file=sys.stderr)
            self._reported = True


class _NullTrace:
    def __enter__(self):
        return None

    def __exit__(self, *exc_info):
        return False
