import { useEffect, useState } from "react";

import { checkPravaPhoneApproval, requestPravaPhoneApproval } from "../lib/pravaApproval.js";

export function PravaPhoneApproval({
  runId,
  plannedAmount,
  requestApproval = requestPravaPhoneApproval,
  checkApproval = checkPravaPhoneApproval,
}) {
  const [status, setStatus] = useState("idle");
  const [approval, setApproval] = useState(null);
  const [error, setError] = useState("");

  const begin = async () => {
    if (status === "loading" || status === "ready") return;
    setStatus("loading");
    setError("");
    try {
      setApproval(await requestApproval(runId));
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Prava phone approval");
      setStatus("error");
    }
  };

  const refresh = async () => {
    try {
      const next = await checkApproval(runId);
      setApproval((current) => ({ ...current, ...next }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check Prava sandbox status");
    }
  };

  useEffect(() => {
    if (status !== "ready" || !approval || approval.terminal) return undefined;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [status, approval?.stage, approval?.checkedAt, approval?.terminal, runId]);

  return (
    <section className="prava-phone" aria-labelledby="prava-phone-title">
      <div className="prava-phone__intro">
        <span className="prava-phone__mark" aria-hidden="true">P</span>
        <div>
          <strong id="prava-phone-title">Continue with Prava sandbox</strong>
          <span>The exact planned total is verified by the server; status updates here automatically.</span>
        </div>
        {status !== "ready" && (
          <button type="button" className="prava-phone__button" onClick={begin} disabled={status === "loading"}>
            {status === "loading"
              ? "Creating secure link…"
              : `Pay ${formatMoney(plannedAmount, "INR")} on phone`}
          </button>
        )}
      </div>

      <div className="prava-phone__status" aria-live="polite">
        {status === "error" && (
          <div className="prava-phone__error">
            <span>{error}</span>
            <button type="button" onClick={begin}>Try once more</button>
          </div>
        )}

        {status === "ready" && approval && (
          <div className="prava-phone__ready">
            <div className="prava-phone__qr-wrap">
              <img
                className="prava-phone__qr"
                src={approval.qrDataUrl}
                alt="QR code to open the Prava sandbox approval on a phone"
              />
            </div>
            <div className="prava-phone__steps">
              <span className="prava-phone__eyebrow">One secure handoff</span>
              <strong>
                {approval.merchant} · {formatMoney(approval.amountCap, approval.currency)} total
              </strong>
              <span className={`prava-phone__state prava-phone__state--${approval.stage}`}>
                {stageLabel(approval.stage)}
              </span>
              <ol>
                <li>Scan this QR with your phone camera.</li>
                <li>Enter the assigned sandbox card on Prava.</li>
                <li>Approve the passkey; Humsafar checks Prava automatically.</li>
              </ol>
              {approval.stage === "waiting_for_cardholder" && (
                <span className="prava-phone__expiry">Link expires {formatExpiry(approval.expiresAt)}.</span>
              )}
              {approval.stage === "checkout_ready" && (
                <span className="prava-phone__truth">Card approved and credentials prepared; no merchant checkout has completed yet.</span>
              )}
              {approval.stage === "completed" && approval.paid && (
                <span className="prava-phone__truth prava-phone__truth--success">Prava confirms the sandbox checkout is completed.</span>
              )}
              <button type="button" className="prava-phone__refresh" onClick={refresh}>Check Prava now</button>
              <a href={approval.iframeUrl} target="_blank" rel="noreferrer">
                Open Prava on this device ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function stageLabel(stage) {
  return {
    waiting_for_cardholder: "Waiting for phone approval",
    checking: "Checking Prava…",
    checkout_ready: "Prava approved · merchant checkout pending",
    completed: "Sandbox payment completed",
    failed: "Sandbox checkout failed",
    expired: "Approval link expired",
  }[stage] ?? "Checking Prava…";
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(Number(amount)) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatExpiry(value) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
