import { useEffect, useState } from "react";

import { AGENTS } from "../state/sessionReducer.js";
import { metaFor, money } from "../lib/agents.js";
import { APPROVAL_STATE, deriveState, msUntilExpiry, submitDecision } from "../lib/approvals.js";
import { IconCheck, IconBlocked, IconShield } from "../lib/icons.jsx";

/**
 * The §7 approval gate: shows the exact allocation being approved, a countdown
 * to `expiresAt`, and approve/decline.
 *
 * Two rules this panel exists to enforce:
 *  - it approves *a specific plan for a specific run* — the digest and runId
 *    come from the event and are echoed back untouched, never recomputed here;
 *  - if the request cannot be correlated or has expired, the buttons go away
 *    and the reason is stated, rather than offering a click that will fail.
 */
export function ApprovalPanel({ approval, isMock }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [localDecision, setLocalDecision] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // A visible countdown is the point of an expiring approval, so it ticks.
  useEffect(() => {
    if (!approval?.requested || approval.given) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [approval?.requested, approval?.given]);

  // A new request supersedes whatever the user did to the previous one.
  useEffect(() => {
    setLocalDecision(null);
    setError(null);
    setSubmitting(false);
  }, [approval?.approvalRequestId]);

  if (!approval?.requested) return null;

  const state = deriveState(approval, { submitting, error, localDecision });
  const remaining = msUntilExpiry(approval, now);
  const allocations = approval.requestedAllocations ?? {};
  const total = AGENTS.reduce((sum, a) => sum + (allocations[a] ?? 0), 0);

  const decide = async (decision) => {
    if (isMock) {
      // The mocked stream has no backend to answer. Reflect the click honestly
      // instead of pretending a decision was recorded server-side.
      setError({
        code: "MOCK_STREAM",
        message: "This is the simulated stream — no approval was sent. Switch to the live backend to decide for real.",
      });
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitDecision(approval, decision);
    setSubmitting(false);
    if (result.ok) setLocalDecision(decision);
    else setError(result);
  };

  return (
    <section className={`approval approval--${state}`}>
      <header className="approval__head">
        <span className="approval__icon">
          {state === APPROVAL_STATE.APPROVED ? <IconCheck /> : state === APPROVAL_STATE.DECLINED ? <IconBlocked /> : <IconShield />}
        </span>
        <div>
          <div className="approval__kicker">Approval required</div>
          <h3>{headline(state)}</h3>
        </div>
        {remaining !== null && state === APPROVAL_STATE.READY && (
          <span className="approval__timer" aria-live="polite">{formatRemaining(remaining)}</span>
        )}
      </header>

      <ul className="approval__lines">
        {AGENTS.map((agent) => {
          const meta = metaFor(agent);
          return (
            <li key={agent}>
              <i style={{ background: meta.color }} />
              <span>{meta.label}</span>
              <b>{money(allocations[agent] ?? 0)}</b>
            </li>
          );
        })}
        <li className="approval__total">
          <i />
          <span>Total to authorise</span>
          <b>{money(total)}</b>
        </li>
      </ul>

      {approval.approvalRequestId && (
        <p className="approval__ref">
          run <code>{approval.runId ?? "—"}</code> · request{" "}
          <code>{approval.approvalRequestId}</code>
        </p>
      )}

      {state === APPROVAL_STATE.READY && (
        <div className="approval__actions">
          <button type="button" className="run-btn" onClick={() => decide("approved")}>
            Approve this plan
          </button>
          <button type="button" className="decline-btn" onClick={() => decide("declined")}>
            Decline
          </button>
        </div>
      )}

      {state === APPROVAL_STATE.SUBMITTING && <p className="approval__note">Sending your decision…</p>}

      {state === APPROVAL_STATE.EXPIRED && (
        <p className="approval__note approval__note--danger">
          This request expired before a decision was made. The agents must raise a new
          one — an expired approval can never authorise a plan.
        </p>
      )}

      {state === APPROVAL_STATE.UNCORRELATED && (
        <p className="approval__note approval__note--danger">
          This request arrived without the run correlation the backend requires, so it
          cannot be answered from here. No decision can be sent.
        </p>
      )}

      {state === APPROVAL_STATE.APPROVED && (
        <p className="approval__note approval__note--ok">
          Approved{approval.givenAt ? ` at ${new Date(approval.givenAt).toLocaleTimeString()}` : ""}.
          Credentials may now be minted against this exact plan.
        </p>
      )}

      {state === APPROVAL_STATE.DECLINED && (
        <p className="approval__note">
          Declined. Nothing was authorised and no credential can be minted for this plan.
        </p>
      )}

      {error && (
        <p className="approval__note approval__note--danger">
          <b>{error.code}</b> — {error.message}
        </p>
      )}
    </section>
  );
}

function headline(state) {
  switch (state) {
    case APPROVAL_STATE.APPROVED:
      return "Plan approved";
    case APPROVAL_STATE.DECLINED:
      return "Plan declined";
    case APPROVAL_STATE.EXPIRED:
      return "Approval expired";
    case APPROVAL_STATE.UNCORRELATED:
      return "Cannot be answered here";
    case APPROVAL_STATE.SUBMITTING:
      return "Sending decision";
    default:
      return "Authorise this exact split";
  }
}

function formatRemaining(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")} left`;
}
