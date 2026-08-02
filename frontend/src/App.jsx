import { useEffect, useMemo, useRef, useState } from "react";

import Choose from "./pages/Choose.jsx";
import MandateSetup from "./components/MandateSetup.jsx";
import Intake from "./pages/Intake.jsx";

import { ApprovalPanel } from "./components/ApprovalPanel.jsx";
import { AuditLog } from "./components/AuditLog.jsx";
import { BudgetSplit } from "./components/BudgetSplit.jsx";
import { DeliberationFeed } from "./components/DeliberationFeed.jsx";
import { FinalReceipt } from "./components/FinalReceipt.jsx";
import { ItineraryPlan } from "./components/ItineraryPlan.jsx";
import { ProofPanel } from "./components/ProofPanel.jsx";
import { PurchaseCards } from "./components/PurchaseCards.jsx";
import { PHASES, summarize } from "./state/sessionReducer.js";
import { SOURCE, initialSource, useEventStream } from "./lib/useEventStream.js";
import { money } from "./lib/agents.js";
import { IconArrow, IconCheck, IconSearch, IconSpark } from "./lib/icons.jsx";
import { previewItinerary, stayReplanRequest } from "./lib/itinerary.js";

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

export function Dashboard({ state, connection, source, setSource, goal, itinerary }) {
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
            <span className="goal">{goal || "Start a trip to create a live plan"}</span>
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

      <ItineraryPlan plan={itinerary} compact />

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
          shown as unverified, never as a completed payment. Food and activity ideas are
          advisory: mapped possibilities and estimates, with no card or booking claim.
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
  const [runId, setRunId] = useState(() => readSession("humsafar.runId"));
  const [goal, setGoal] = useState(() => readSession("humsafar.goal"));
  const [itinerary, setItinerary] = useState(() => readJsonSession("humsafar.itinerary"));
  const [source, setSource] = useState(initialSource);
  const rebasingStay = useRef(null);
  const { state, connection } = useEventStream(source, runId);
  const { pathname, navigate } = useHistoryRoute();

  // The first preview uses the destination centre because no room exists yet.
  // As soon as the stay agent/user chooses one, geocode that exact stay and
  // rebuild every day's first/last leg around it. This is a planning refresh,
  // not a reservation or payment call.
  useEffect(() => {
    const stayName = state.choice?.made?.stay?.vendor;
    if (!stayName || !itinerary || itinerary.base?.name === stayName) return;
    const requestKey = `${runId ?? "pending"}:${stayName}`;
    if (rebasingStay.current === requestKey) return;
    rebasingStay.current = requestKey;
    let cancelled = false;
    previewItinerary(stayReplanRequest(itinerary, stayName))
      .then((next) => {
        if (cancelled) return;
        setItinerary(next);
        writeSession("humsafar.itinerary", JSON.stringify(next));
      })
      .catch(() => {
        if (cancelled) return;
        const next = {
          ...itinerary,
          baseAssumption: `Stay selected (${stayName}), but its map pin could not be confirmed; routes still use the destination centre.`,
        };
        setItinerary(next);
        writeSession("humsafar.itinerary", JSON.stringify(next));
      });
    return () => { cancelled = true; };
  }, [state.choice?.made?.stay?.vendor, itinerary, runId]);

  const started = ({ runId: nextRunId, goal: nextGoal, itinerary: nextItinerary }) => {
    setRunId(nextRunId);
    setGoal(nextGoal);
    setSource(SOURCE.LIVE);
    setItinerary(nextItinerary ?? null);
    writeSession("humsafar.runId", nextRunId);
    writeSession("humsafar.goal", nextGoal);
    writeSession("humsafar.itinerary", JSON.stringify(nextItinerary ?? null));
  };

  let page;
  if (pathname === "/deliberate") {
    page = <Dashboard state={state} connection={connection} source={source} setSource={setSource} goal={goal} itinerary={itinerary} />;
  } else if (pathname === "/choose") {
    page = <Choose state={state} runId={runId ?? state.runId} goal={goal} />;
  } else if (pathname === "/approve") {
    page = <ApprovalPage state={state} source={source} />;
  } else if (pathname === "/receipt") {
    page = <ReceiptPage state={state} source={source} navigate={navigate} />;
  } else if (pathname === "/authorise") {
    // The one-time step that lets the agents spend at all. Kept on its own
    // route rather than in the run flow, because a mandate is authorised once
    // per merchant and then reused across every future run — putting it inside
    // the run would imply the user has to approve their card each time, which
    // is the opposite of what the product does.
    page = <AuthorisePage state={state} />;
  } else {
    page = <Intake onStarted={started} navigate={navigate} />;
  }

  return <><AutoAdvance state={state} pathname={pathname} navigate={navigate} />{page}</>;
}

function AuthorisePage({ state }) {
  const [done, setDone] = useState(() => new Set());

  // Derived from the run the agents actually did — the vendors they chose and
  // the amounts they settled on. An earlier version listed four merchants and
  // prices hardcoded into this file, which both read as a booking page and was
  // the exact thing this project refuses to do everywhere else: assert
  // specifics nobody computed.
  //
  // This is also the correct moment in the flow. A mandate has to exist before
  // its agent can mint, and only after the choice step do we know which
  // merchant each agent is actually buying from.
  const chosen = Object.values(state.choice?.made ?? {});

  if (chosen.length === 0) {
    return (
      <div className="authorise">
        <div className="eyebrow">Setup · one time per merchant</div>
        <h2 className="page-title">
          Nothing to authorise yet.
        </h2>
        <p className="page-lede">
          The agents authorise spending at the merchants they choose, so there is nothing to
          approve until they have negotiated and you have picked. Start a plan, and this page
          fills in with the merchants your agents actually settled on.
        </p>
        <p className="page-lede">
          <a href="/">Plan a trip →</a>
        </p>
      </div>
    );
  }

  return (
    <div className="authorise">
      <div className="eyebrow">Setup · one time per merchant</div>
      <h2 className="page-title">
        Authorise your agents. <span className="accent">Once.</span>
      </h2>
      <p className="page-lede">
        Each agent gets spending authority capped at the amount it negotiated and locked to the
        single merchant it chose. You approve with your passkey — after that the agents transact
        on their own, and none can spend past its cap or reach another&apos;s money.
      </p>

      {chosen.map((pick) => (
        <MandateSetup
          key={pick.agent}
          merchant={{
            name: pick.vendor,
            // Sandbox merchant details may be arbitrary — Prava states this
            // explicitly, because no real storefront is contacted. Derived
            // rather than invented per-vendor so nothing here claims to be a
            // real merchant website.
            url: `https://example.com/${encodeURIComponent(String(pick.vendor).toLowerCase().replace(/\s+/g, "-"))}`,
            countryCode: "IN",
          }}
          amountCap={pick.price}
          description={`${pick.agent} — chosen by ${pick.chosenBy === "user" ? "you" : "the agent"}`}
          onAuthorized={() => setDone((prev) => new Set(prev).add(pick.vendor))}
        />
      ))}

      {done.size > 0 && (
        <p className="authorise__done">
          {done.size} of {chosen.length} authorised.
        </p>
      )}
    </div>
  );
}


/**
 * Moves the user forward as the run progresses, and never backward — a late
 * event must not yank someone off a page they navigated to deliberately.
 */
function AutoAdvance({ state, pathname, navigate }) {
  useEffect(() => {
    if (pathname === "/") return;
    const pending = Object.values(state.choice?.requested ?? {}).some(
      (row) => !state.choice?.made?.[row.agent],
    );
    const awaitingApproval = Boolean(state.approval?.requested && !state.approval?.given);

    // Stage precedence, each stage owning exactly one page: "if this stage is
    // active, be on its page". The previous chain of forward/backward rules
    // contained two loops — /approve <-> /deliberate whenever an approval was
    // outstanding, and /approve <-> /choose whenever both a choice and an
    // approval were. Both render as a flickering page. `test/autoAdvance.test.js`
    // asserts no state and starting route can navigate forever.
    let target = null;
    if (state.receipt) target = "/receipt";
    else if (pending) target = "/choose";           // choose options first,
    else if (awaitingApproval) target = "/approve"; // then approve the plan
    else if (["/choose", "/approve"].includes(pathname)) target = "/deliberate";

    // `replace`: these are automatic moves the user did not ask for, so they
    // must not pile up entries the back button has to chew through.
    if (target && target !== pathname) navigate(target, { replace: true });
  }, [state.choice, state.approval, state.receipt, pathname, navigate]);

  return null;
}

function ApprovalPage({ state, source }) {
  return (
    <div className="page-empty">
      <div className="eyebrow">Step 4 of 5 · approve</div>
      <h2>Review the exact split and selected plan.</h2>
      <p>The digest binds this decision to this run, these slices, and these option IDs.</p>
      <ApprovalPanel approval={state.approval} isMock={source === SOURCE.MOCK} />
    </div>
  );
}

function ReceiptPage({ state, source, navigate }) {
  const summary = useMemo(() => summarize(state), [state]);
  if (!state.receipt) return <div className="page-empty"><h2>Waiting for the agents to settle…</h2></div>;
  return (
    <FinalReceipt
      receipt={state.receipt}
      summary={summary}
      blockedAttempts={state.blockedAttempts}
      renegotiations={state.renegotiations}
      isMock={source === SOURCE.MOCK}
      onDismiss={() => navigate("/deliberate")}
    />
  );
}

function useHistoryRoute() {
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  useEffect(() => {
    const changed = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  const navigate = useMemo(() => (to, { replace = false } = {}) => {
    if (typeof window === "undefined") return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", to);
    setPathname(window.location.pathname);
  }, []);
  return { pathname, navigate };
}

function readSession(key) {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(key);
}

function readJsonSession(key) {
  const value = readSession(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
}
