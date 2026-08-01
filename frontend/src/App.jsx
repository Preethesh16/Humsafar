import { useEffect, useMemo, useState } from "react";

import { AuditLog } from "./components/AuditLog.jsx";
import { BudgetSplit } from "./components/BudgetSplit.jsx";
import { DeliberationFeed } from "./components/DeliberationFeed.jsx";
import { FinalReceipt } from "./components/FinalReceipt.jsx";
import { PurchaseCards } from "./components/PurchaseCards.jsx";
import { PHASES, summarize } from "./state/sessionReducer.js";
import { SOURCE, initialSource, useEventStream } from "./lib/useEventStream.js";

const PHASE_LABEL = {
  [PHASES.IDLE]: "Waiting for the orchestrator",
  [PHASES.NEGOTIATING]: "Agents are negotiating",
  [PHASES.AWAITING_APPROVAL]: "Awaiting your approval",
  [PHASES.PURCHASING]: "Agents are buying",
  [PHASES.COMPLETE]: "Trip settled",
};

export default function App() {
  const [source, setSource] = useState(initialSource);
  const { state, connection } = useEventStream(source);
  const [receiptDismissed, setReceiptDismissed] = useState(false);

  const summary = useMemo(() => summarize(state), [state]);
  const isMock = source === SOURCE.MOCK;

  // A fresh run should be able to re-show the receipt.
  useEffect(() => setReceiptDismissed(false), [source]);

  return (
    <div className="app">
      {isMock && (
        <div className="banner banner--mock" role="status">
          <strong>MOCKED DEMO STREAM</strong>
          <span>
            Scripted events in the locked <code>INTERFACES.md</code> shapes. No real
            agents, no real Prava cards, no real transactions.
          </span>
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          <h1>Humsafar</h1>
          <p>Four agents, one budget, one locked card each.</p>
        </div>

        <div className="topbar__stats">
          <Stat label="Budget" value={summary.budget} />
          <Stat label="Allocated" value={summary.allocated} />
          <Stat label="Spent" value={summary.spent} />
        </div>

        <div className="topbar__right">
          <span className={`status status--${connection}`}>
            {isMock ? "mock replay" : connection}
          </span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!isMock}
              onChange={(e) => setSource(e.target.checked ? SOURCE.LIVE : SOURCE.MOCK)}
            />
            <span>Live backend</span>
          </label>
        </div>
      </header>

      <div className={`phase phase--${state.phase}`}>
        <span className="phase__dot" />
        {PHASE_LABEL[state.phase]}
        {state.phase === PHASES.AWAITING_APPROVAL && (
          <span className="phase__hint">
            one passkey tap approves the whole split — no per-purchase prompts
          </span>
        )}
      </div>

      <main className="grid">
        <div className="grid__left">
          <DeliberationFeed messages={state.messages} round={state.round} />
        </div>

        <div className="grid__right">
          <BudgetSplit
            allocations={state.allocations}
            summary={summary}
            round={state.round}
          />
          <PurchaseCards
            cards={state.cards}
            purchases={state.purchases}
            blockedAttempts={state.blockedAttempts}
            isMock={isMock}
          />
          <AuditLog audit={state.audit} />
        </div>
      </main>

      {!receiptDismissed && (
        <FinalReceipt
          receipt={state.receipt}
          summary={summary}
          blockedAttempts={state.blockedAttempts}
          renegotiations={state.renegotiations}
          isMock={isMock}
          onDismiss={() => setReceiptDismissed(true)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {value > 0 ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value) : "—"}
      </span>
    </div>
  );
}
