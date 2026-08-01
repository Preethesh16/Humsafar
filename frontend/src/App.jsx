import { useEffect, useMemo, useState } from "react";

import { AuditLog } from "./components/AuditLog.jsx";
import { BudgetSplit } from "./components/BudgetSplit.jsx";
import { DeliberationFeed } from "./components/DeliberationFeed.jsx";
import { FinalReceipt } from "./components/FinalReceipt.jsx";
import { ProofPanel } from "./components/ProofPanel.jsx";
import { PurchaseCards } from "./components/PurchaseCards.jsx";
import { PHASES, summarize } from "./state/sessionReducer.js";
import { SOURCE, initialSource, useEventStream } from "./lib/useEventStream.js";
import { money } from "./lib/agents.js";
import { IconShield, IconSpark } from "./lib/icons.jsx";

/**
 * The four journey steps, and which phases mark each one reached. Derived
 * entirely from the `phase` the reducer already computes — this is a display
 * mapping, not a second state machine.
 */
const JOURNEY = [
  { title: "Negotiate", note: "agents argue over one pot" },
  { title: "Approve", note: "one passkey tap" },
  { title: "Lock spend", note: "scoped card per agent" },
  { title: "Verify", note: "receipt and audit" },
];

const PHASE_STEP = {
  [PHASES.IDLE]: -1,
  [PHASES.NEGOTIATING]: 0,
  [PHASES.AWAITING_APPROVAL]: 1,
  [PHASES.PURCHASING]: 2,
  [PHASES.COMPLETE]: 3,
};

const PHASE_LABEL = {
  [PHASES.IDLE]: "standing by",
  [PHASES.NEGOTIATING]: "negotiating",
  [PHASES.AWAITING_APPROVAL]: "awaiting approval",
  [PHASES.PURCHASING]: "buying",
  [PHASES.COMPLETE]: "settled",
};

export default function App() {
  const [source, setSource] = useState(initialSource);
  const { state, connection } = useEventStream(source);
  const [receiptDismissed, setReceiptDismissed] = useState(false);

  const summary = useMemo(() => summarize(state), [state]);
  const isMock = source === SOURCE.MOCK;
  const activeStep = PHASE_STEP[state.phase] ?? -1;

  // A fresh run should be able to re-show the receipt.
  useEffect(() => setReceiptDismissed(false), [source]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <IconShield />
          </span>
          Humsafar
        </div>

        <div className="status-row">
          <span className={`status ${isMock ? "sim" : connection === "open" ? "live" : "warn"}`}>
            {isMock ? "simulated stream" : connection}
          </span>
          <span className="status">{PHASE_LABEL[state.phase]}</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!isMock}
              onChange={(e) => setSource(e.target.checked ? SOURCE.LIVE : SOURCE.MOCK)}
            />
            Live backend
          </label>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">Agentic commerce · Prava</div>
          <h1>
            One goal. One budget.<br />
            <em>Zero overspend.</em>
          </h1>
          <p className="hero-copy">
            Four specialist agents negotiate over the same finite pot, then each one
            buys its part on its <strong>own merchant-locked Prava card</strong>. No
            agent can reach another's slice — and none of them can exceed it.
          </p>
        </div>

        <div className="command">
          <div className="command-labels">
            <span>Budget</span>
            <span>Allocated</span>
            <span>Spent</span>
          </div>
          <div className="command-figures">
            <div className="figure">
              <b>{summary.budget > 0 ? money(summary.budget) : "—"}</b>
              <span>total pot</span>
            </div>
            <div className={`figure ${summary.overBudget ? "over" : ""}`}>
              <b>{summary.allocated > 0 ? money(summary.allocated) : "—"}</b>
              <span>{summary.overBudget ? "over the pot" : "across 4 agents"}</span>
            </div>
            <div className="figure">
              <b>{summary.spent > 0 ? money(summary.spent) : "—"}</b>
              <span>settled purchases</span>
            </div>
          </div>
          <div className="command-note">
            <span className="preset">
              <i />
              Plan my Goa trip under ₹30,000
            </span>
            <span>{state.audit.length} events</span>
          </div>
        </div>
      </section>

      {isMock && (
        <div className="sim-notice" role="status">
          <span className="sim-notice__mark">
            <IconSpark />
          </span>
          <div>
            <b>Simulated stream</b>
            <p>
              Scripted events in the locked <code>INTERFACES.md</code> shapes, so the
              dashboard runs without the agent layer. No real agents, no real Prava
              cards, and no real transactions. Flip <strong>Live backend</strong> to
              consume the real stream.
            </p>
          </div>
        </div>
      )}

      <div style={{ marginTop: 26 }}>
        <div className="journey">
          {JOURNEY.map((step, index) => (
            <div
              key={step.title}
              className={`journey-step ${
                index === activeStep ? "active" : index < activeStep ? "complete" : ""
              }`}
            >
              <span className="journey-number">{index + 1}</span>
              <span className="journey-copy">
                <b>{step.title}</b>
                <span>{step.note}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <main className="workspace">
        <DeliberationFeed messages={state.messages} round={state.round} />

        <div className="rail">
          <BudgetSplit allocations={state.allocations} summary={summary} round={state.round} />
          <PurchaseCards
            cards={state.cards}
            purchases={state.purchases}
            blockedAttempts={state.blockedAttempts}
            isMock={isMock}
          />
          <ProofPanel
            blockedAttempts={state.blockedAttempts}
            renegotiations={state.renegotiations}
          />
          <AuditLog audit={state.audit} />
        </div>
      </main>

      <footer>
        <p>
          <strong>Truth layer.</strong> Every purchase carries the source it came from —{" "}
          <strong>live</strong> or <strong>fixture</strong> — and an untagged result is
          shown as unverified, never as a completed payment. Guide and Food responses are
          fixtures shaped like Viator and OpenTable, disclosed as an MVP cut.
        </p>
        <span className="footer-mark">Humsafar · dashboard 0.2</span>
      </footer>

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
