# Humsafar Agent Core

Orchestrator, specialist buyer agents, mediator, and the negotiation engine.
Owned by Jeswin (see `brainstorming.md` §8). Pure Python 3.10+, standard library
only — `openai` is optional and the whole thing runs without it.

## Run it

```bash
cd agents
python3 -m humsafar --demo --no-stream        # nothing else required
```

With the backend up (`npm start` from the repo root), drop `--no-stream` and the
run streams live to `GET /api/events` for the dashboard:

```bash
python3 -m humsafar --goal "Plan my Goa trip" --budget 30000 --demo
```

| Flag | Effect |
|---|---|
| `--demo` | Shorthand for `--overspend stay --fail guide` — both proof shots |
| `--no-stream` | Don't POST events to the backend |
| `--live-cards` | Mint through `POST /api/scoped-cards` instead of the stub |
| `--live-discovery` | Discover options via `POST /api/discovery/:category` |
| `--days`, `--origin`, `--destination`, airport/date/traveller flags | Structured context for destination-aware fallback and provider search |
| `--trust` | Run the pre-purchase trust check via `POST /api/trust/check` |
| `--llm` | Use OpenAI for agent dialogue (needs `OPENAI_API_KEY`) |
| `--backend URL` | Backend base URL (default `http://127.0.0.1:3000`) |

With `--live-discovery`, the run prints what each category *actually* resolved
to (`data sources: flights=fixture, stay=live, …`) rather than what was asked
for — a live route that fell back to fixtures must never read as live.

Tests:

```bash
cd agents && python3 -m unittest discover -s tests -t .
```

## The one thing to understand

**The model decides what an agent _says_. The engine decides what an agent _gets_.**

Every rupee comes from deterministic integer-paise arithmetic in `money.py`,
`negotiation.py`, and `mediator.py`. The LLM is handed the real numbers and asked
to argue for them in character; it cannot move money, and a hallucinated figure in
its prose can never become a hallucinated figure on a card. That also means a
missing API key, a rate limit, or a slow response degrades the demo to templated
dialogue with **identical numbers** rather than killing it.

## How the negotiation actually ends

Locked in `INTERFACES.md` §5:

1. **Clean exit** — the split sums to ≤ budget and no agent is below its stated
   minimum viable ask.
2. **Forced compromise** — after 5 rounds without (1), the mediator gives every
   agent its floor, then splits the remainder proportionally to what each
   originally asked for.
3. **Below the floor** (added by Jeswin, see §5's amendment) — if the floors alone
   exceed the budget, rule 2 taken literally would hand out more money than the
   user has. Instead the floors are scaled down to fit exactly and the mediator
   says out loud that the budget is too small.

Two details that make the negotiation real rather than decorative:

- **An ask is always the price of an option the agent actually found.** Conceding
  means *downgrading your pick*, so the agreed split is exactly what gets bought.
  Without this, agents argue their way to a slice and then strand a chunk of it.
- **After convergence the mediator spends the leftover** on whichever agent's
  upgrade buys the most rating per rupee, one upgrade at a time.

## Layout

| File | Responsibility |
|---|---|
| `money.py` | Integer-paise arithmetic, largest-remainder splitting |
| `models.py` | Option, Specialist, RoundRecord, Purchase |
| `discovery.py` | Option sources; fixture data shaped like the real partner APIs |
| `negotiation.py` | Round loop, concession dynamics, convergence rule |
| `mediator.py` | Grounding, forced compromise, surplus allocation, verification |
| `guardian.py` | Pre-mint intent/anomaly check |
| `cards.py` | `mintScopedCard` client + offline stub |
| `checkout.py` | Purchase execution seam (Preethesh owns the live side) |
| `trust.py` | Pre-purchase trust check (Senso track) |
| `events.py` | Locked event emission + a mirror of the backend validator |
| `orchestrator.py` | The end-to-end flow |

## The trust check actually changes what gets bought

The Senso track needs the score to *materially influence* a decision, not just
appear in a log. A merchant that doesn't come back `allow` loses the sale to the
next acceptable option inside the same slice. It deliberately does **not** hard
block: the backend's `TrustService` is currently a fixture heuristic that says so
in its own `reason`, and an unreachable trust service is treated as advisory —
letting a flaky dependency veto every purchase would be a worse failure than
proceeding with the flag recorded. If nothing clears, the agent buys and the flag
is carried into the purchase details and the receipt.

## Honesty rules baked into the code

The handbook treats a mocked payment presented as a real transaction as a
disqualifier risk, so these are enforced in code rather than left to discipline:

- Fixture options and simulated checkouts always carry `source: "fixture"`, and
  `SimulatedCheckout` writes "not a live merchant order" into every result.
- The **over-cap proof shot is not blocked in software.** `Guardian` deliberately
  lets an over-cap attempt through to the card layer, because a software `if`
  presented as card-network enforcement would be exactly the thing we must not
  do. Off-goal purchases *are* blocked in software, and say so in the reason.
- `StubScopedCardClient` refusing an overspend is **not** the card-level proof.
  The real proof shot needs `--live-cards` against live Prava.
- If an over-slice charge is ever *authorised*, the orchestrator prints a loud
  warning telling you not to present it as a blocked attempt.
- Card tokens are never logged, printed, or placed in an event.

## Provider and execution status

| Piece | Status | Owner |
|---|---|---|
| Prava call under `mintScopedCard` | Live route exists, fails closed without `PRAVA_SECRET_KEY` | Preethesh |
| Duffel flights/stay inventory | Live test search when token/context exist; destination-aware fixture fallback otherwise | Preethesh |
| Guide/food inventory | Fixture, Viator/OpenTable-shaped | Preethesh |
| Merchant checkout | `SimulatedCheckout` by default; no merchant order is claimed | Preethesh |
| LLM dialogue | Wired, off by default (no key in the workspace) | Jeswin |
