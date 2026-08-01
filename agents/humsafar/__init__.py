"""Humsafar agent core — orchestrator, specialists, mediator, negotiation.

Owned by Jeswin (see brainstorming.md §8). The backend, Prava call, and
dashboard live elsewhere in the repo; this package talks to them only through
the contracts locked in INTERFACES.md.
"""

from .cards import ScopedCardClient, StubScopedCardClient
from .checkout import SimulatedCheckout
from .discovery import FixtureDiscovery
from .events import EventEmitter
from .mediator import Mediator
from .negotiation import NegotiationEngine, build_specialists
from .orchestrator import Orchestrator, RunConfig, RunReport, run_goal

__all__ = [
    "EventEmitter",
    "FixtureDiscovery",
    "Mediator",
    "NegotiationEngine",
    "Orchestrator",
    "RunConfig",
    "RunReport",
    "ScopedCardClient",
    "SimulatedCheckout",
    "StubScopedCardClient",
    "build_specialists",
    "run_goal",
]
