import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import Choose from "./pages/Choose.jsx";
import Intake from "./pages/Intake.jsx";

import { ApprovalPanel } from "./components/ApprovalPanel.jsx";
import { AuditLog } from "./components/AuditLog.jsx";
import { BudgetSplit } from "./components/BudgetSplit.jsx";
import { DeliberationFeed } from "./components/DeliberationFeed.jsx";
import { FinalReceipt } from "./components/FinalReceipt.jsx";
import { ProofPanel } from "./components/ProofPanel.jsx";
import { PurchaseCards } from "./components/PurchaseCards.jsx";
import { PHASES, summarize } from "./state/sessionReducer.js";
import { SOURCE, initialSource, useEventStream } from "./lib/useEventStream.js";
import { money } from "./lib/agents.js";
import { IconArrow, IconCheck, IconSearch, IconSpark } from "./lib/icons.jsx";

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

export function Dashboard({ state, connection, source, setSource }) {
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
          <span className="brand-mark">H</span>
          Humsafar
        </div>

        <div className="status-row">
          <span className={`status ${isMock ? "sim" : connection === "open" ? "live" : "warn"}`}>
            Prava · {isMock ? "simulated" : connection}
          </span>
          <span className={`status ${state.phase === PHASES.COMPLETE ? "live" : ""}`}>
            Agents · {PHASE_LABEL[state.phase]}
          </span>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">Agentic commerce, with a seatbelt</div>
          <h1>
            One goal. One budget.
            <em>Zero overspend.</em>
          </h1>
        </div>

        <p className="hero-copy">
          Humsafar gives specialist buying agents one finite pot. They{" "}
          <strong>negotiate the trade-offs</strong>, then Prava locks every winner to
          its merchant and amount.
        </p>
      </section>

      <div className="command">
        <div className="command-labels">
          <span>Outcome you want</span>
          <span>Hard ceiling</span>
          <span className="right">Event source</span>
        </div>

        <div className="command-row">
          <div className="input-shell">
            <IconSearch />
            <span className="goal">Plan my Goa trip under ₹30,000</span>
          </div>

          <div className={`input-shell ${summary.overBudget ? "over" : ""}`}>
            <span className="ceiling">
              {summary.budget > 0 ? money(summary.budget) : <em>not set yet</em>}
            </span>
          </div>

          <label className="mode-btn">
            <input
              type="checkbox"
              checked={!isMock}
              onChange={(e) => setSource(e.target.checked ? SOURCE.LIVE : SOURCE.MOCK)}
            />
            {isMock ? "Use live backend" : "Use simulated"}
            <IconArrow />
          </label>
        </div>

        <div className="command-note">
          <span className="preset">
            <i />
            {isMock
              ? "Judge-ready scenario · about 30 seconds"
              : "Live stream from the orchestration backend"}
          </span>
          <span>
            {summary.allocated > 0 ? `${money(summary.allocated)} allocated · ` : ""}
            {summary.spent > 0 ? `${money(summary.spent)} spent · ` : ""}
            {state.audit.length} events
          </span>
        </div>
      </div>

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

      <div className="journey">
        {JOURNEY.map((step, index) => {
          const complete = index < activeStep;
          return (
            <div
              key={step.title}
              className={`journey-step ${index === activeStep ? "active" : complete ? "complete" : ""}`}
            >
              <span className="journey-number">{complete ? <IconCheck /> : index + 1}</span>
              <span className="journey-copy">
                <b>{step.title}</b>
                <span>{step.note}</span>
              </span>
            </div>
          );
        })}
      </div>

      <main className="workspace">
        <DeliberationFeed messages={state.messages} round={state.round} />

        <div className="rail">
          <ApprovalPanel approval={state.approval} isMock={isMock} />
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


/**
 * Router shell.
 *
 * The stream is opened once here and shared by every page, so navigating does
 * not drop the SSE connection or lose folded state mid-run. Pages advance
 * automatically as the reducer's phase changes — a judge should never have to
 * know which URL to visit next.
 */
export default function App() {
  const [source, setSource] = useState(initialSource);
  const { state, connection } = useEventStream(source);
  const [runId, setRunId] = useState(null);

  return (
    <BrowserRouter>
      <AutoAdvance state={state} />
      <Routes>
        <Route path="/" element={<Intake onStarted={setRunId} />} />
        <Route
          path="/deliberate"
          element={
            <Dashboard
              state={state}
              connection={connection}
              source={source}
              setSource={setSource}
            />
          }
        />
        <Route
          path="/choose"
          element={<Choose state={state} runId={runId ?? state.runId} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Moves the user forward as the run progresses, and never backward — a late
 * event must not yank someone off a page they navigated to deliberately.
 */
function AutoAdvance({ state }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/") return;
    const pending = Object.values(state.choice?.requested ?? {}).some(
      (row) => !state.choice?.made?.[row.agent],
    );
    if (pending && location.pathname !== "/choose") navigate("/choose");
    else if (!pending && location.pathname === "/choose") navigate("/deliberate");
  }, [state.choice, location.pathname, navigate]);

  return null;
}
