/**
 * Client for the §7 run-scoped approval protocol.
 *
 * SECURITY — read before changing this file.
 * §7 says the approval routes use `INTERNAL_API_TOKEN` when configured, and
 * that the token must **never ship in browser JavaScript**. So this client
 * deliberately sends no Authorization header. It calls the same-origin path and
 * relies on the deployment to proxy the user action through a trusted boundary
 * that attaches the token server-side (the Vite dev server does this locally).
 *
 * If you ever find yourself wanting to read a token from `import.meta.env` here,
 * stop: that publishes it to every visitor in the built bundle.
 */

/** Terminal-ish states the UI must not offer a decision for. */
export const APPROVAL_STATE = {
  IDLE: "idle",
  READY: "ready",
  SUBMITTING: "submitting",
  APPROVED: "approved",
  DECLINED: "declined",
  EXPIRED: "expired",
  ERROR: "error",
  UNCORRELATED: "uncorrelated",
};

/**
 * Can this approval request actually be answered?
 * All three correlation fields are required — the backend fails closed on a
 * mismatch, so offering a button we know will 404 or 409 is worse than
 * explaining why it is unavailable.
 */
export function isCorrelated(approval) {
  return Boolean(approval?.runId && approval?.approvalRequestId && approval?.digest);
}

/** Milliseconds until expiry; 0 once expired, null when no deadline is known. */
export function msUntilExpiry(approval, now = Date.now()) {
  if (!approval?.expiresAt) return null;
  const at = new Date(approval.expiresAt).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(at - now, 0);
}

export function isExpired(approval, now = Date.now()) {
  const remaining = msUntilExpiry(approval, now);
  return remaining !== null && remaining <= 0;
}

/** Derives the state the panel should present, from server state + local work. */
export function deriveState(approval, { submitting = false, error = null, localDecision = null } = {}) {
  if (!approval?.requested) return APPROVAL_STATE.IDLE;
  if (approval.given) return APPROVAL_STATE.APPROVED;
  if (localDecision === "declined") return APPROVAL_STATE.DECLINED;
  if (error) return APPROVAL_STATE.ERROR;
  if (submitting) return APPROVAL_STATE.SUBMITTING;
  if (!isCorrelated(approval)) return APPROVAL_STATE.UNCORRELATED;
  if (isExpired(approval)) return APPROVAL_STATE.EXPIRED;
  return APPROVAL_STATE.READY;
}

/**
 * `POST /api/approvals/:id/decision` — body is exactly `{ runId, digest, decision }`.
 * The digest is echoed back, never computed here: §7 says the backend computes
 * it and callers never invent it.
 *
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 */
export async function submitDecision(approval, decision, { fetchImpl = globalThis.fetch } = {}) {
  if (!isCorrelated(approval)) {
    return { ok: false, code: "NOT_CORRELATED", message: "Approval request is missing correlation data." };
  }
  if (decision !== "approved" && decision !== "declined") {
    return { ok: false, code: "BAD_DECISION", message: `Unsupported decision "${decision}".` };
  }

  let response;
  try {
    response = await fetchImpl(
      `/api/approvals/${encodeURIComponent(approval.approvalRequestId)}/decision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: approval.runId,
          digest: approval.digest,
          decision,
        }),
      },
    );
  } catch (cause) {
    return { ok: false, code: "NETWORK", message: `Could not reach the approval service: ${cause.message}` };
  }

  if (response.ok) return { ok: true };

  // §7 returns structured codes: 404 APPROVAL_NOT_FOUND for a mismatched run,
  // 409 for a changed digest, repeated decision, or non-pending request.
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* a non-JSON error body must not mask the status code */
  }

  return {
    ok: false,
    code: body?.error?.code ?? `HTTP_${response.status}`,
    message: body?.error?.message ?? explain(response.status),
  };
}

function explain(status) {
  if (status === 401) return "The approval route requires an internal token that the browser must not hold. Route this through the trusted proxy.";
  if (status === 404) return "This approval request does not belong to the current run.";
  if (status === 409) return "This request was already decided, expired, or the plan changed. A new approval is required.";
  return `The approval service returned ${status}.`;
}
