import { useState } from "react";

import { requestPravaPhoneApproval } from "../lib/pravaApproval.js";

export function PravaPhoneApproval({ requestApproval = requestPravaPhoneApproval }) {
  const [status, setStatus] = useState("idle");
  const [approval, setApproval] = useState(null);
  const [error, setError] = useState("");

  const begin = async () => {
    if (status === "loading" || status === "ready") return;
    setStatus("loading");
    setError("");
    try {
      setApproval(await requestApproval());
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Prava phone approval");
      setStatus("error");
    }
  };

  return (
    <section className="prava-phone" aria-labelledby="prava-phone-title">
      <div className="prava-phone__intro">
        <span className="prava-phone__mark" aria-hidden="true">P</span>
        <div>
          <strong id="prava-phone-title">Approve Prava on your phone</strong>
          <span>Optional sandbox setup for payment testing. It does not charge or book anything.</span>
        </div>
        {status !== "ready" && (
          <button type="button" className="prava-phone__button" onClick={begin} disabled={status === "loading"}>
            {status === "loading" ? "Creating secure link…" : "Set up on phone"}
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
                {approval.merchant} · {formatMoney(approval.amountCap, approval.currency)} cap
              </strong>
              <ol>
                <li>Scan this QR with your phone camera.</li>
                <li>Enter the assigned sandbox card on Prava.</li>
                <li>Approve the passkey, then return here.</li>
              </ol>
              <span className="prava-phone__expiry">Link expires {formatExpiry(approval.expiresAt)}.</span>
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

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatExpiry(value) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
