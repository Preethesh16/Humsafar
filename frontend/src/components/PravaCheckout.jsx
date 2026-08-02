import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Redirect-to-Prava checkout, from inside the app.
 *
 * The agents settle the budget and reserve each slice. This is the human
 * paying: leave for Prava's hosted page, authenticate with a passkey, come
 * back. It is Prava's documented `full_checkout` flow with no `mandate_setup`,
 * so it authorises nothing for later — one payment, made by the cardholder.
 *
 * Coming back is handled two ways, because neither alone is reliable:
 *
 * - `callback_url` returns the browser here once Prava is done. Prava requires
 *   **https**, so it does nothing on a local dev server and only takes effect
 *   once deployed.
 * - The session id is parked in `sessionStorage` and the result is polled on
 *   return. That covers http origins, a passkey finished on a phone, and a
 *   closed tab — any of which would strand a redirect-only flow.
 *
 * No credential ever reaches this component. The status route reports whether
 * one was issued and, when it was not, why. Tokens, CVVs and expiries stay
 * server-side.
 */

const STORAGE_KEY = "humsafar.pravaCheckout";
const POLL_MS = 3000;

export default function PravaCheckout({ merchant, amount, description }) {
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  // Resume after the redirect. Without this, returning from Prava shows a
  // fresh "Pay" button as though the trip to the hosted page never happened.
  useEffect(() => {
    let parked;
    try {
      parked = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      parked = null;
    }
    if (parked?.sessionId) setSession(parked);
  }, []);

  useEffect(() => {
    if (!session?.sessionId || result) return undefined;

    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(
          `/api/prava/checkout-sessions/${encodeURIComponent(session.sessionId)}`,
        );
        if (response.ok) {
          const data = (await response.json())?.data ?? {};
          if (!cancelled && data.status && data.status !== "pending") {
            sessionStorage.removeItem(STORAGE_KEY);
            setResult(data);
            return;
          }
        }
      } catch {
        // Transient. Keep polling rather than declaring an outcome.
      }
      if (!cancelled) timer.current = window.setTimeout(tick, POLL_MS);
    };

    timer.current = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [session, result]);

  const pay = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/prava/checkout-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          currency: "INR",
          merchant,
          product: { description, unitPrice: amount, quantity: 1 },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Prava returned ${response.status}`);
      }

      const data = (await response.json())?.data ?? {};
      if (!data.iframe_url) throw new Error("Prava did not return a checkout page");

      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sessionId: data.session_id, merchant: merchant.name }),
      );
      // Full-page redirect, deliberately: the passkey ceremony is more reliable
      // as a top-level navigation than inside a frame, and it is what Prava's
      // own walkthrough describes.
      window.location.href = data.iframe_url;
    } catch (caught) {
      setError(caught.message || "Could not start the payment");
      setBusy(false);
    }
  }, [merchant, amount, description]);

  if (result) {
    const paid = result.credentialIssued;
    return (
      <div className={`prava-checkout ${paid ? "is-paid" : "is-failed"}`}>
        <h4>{paid ? "✓ Payment credential issued" : "Payment did not complete"}</h4>
        <p>
          {paid ? (
            <>
              Prava issued a single-use, merchant-locked credential for{" "}
              <strong>{merchant.name}</strong>. Session <code>{result.sessionId}</code>.
            </>
          ) : (
            <>
              Prava reported <code>{result.errorCode ?? result.status}</code>
              {result.errorMessage ? `: ${result.errorMessage}` : ""}. Nothing was charged.
            </>
          )}
        </p>
      </div>
    );
  }

  if (session) {
    return (
      <div className="prava-checkout is-waiting">
        <h4>Waiting for Prava…</h4>
        <p>
          Finish on Prava&apos;s page and this updates by itself — including if you complete it
          on your phone.
        </p>
      </div>
    );
  }

  return (
    <div className="prava-checkout">
      <button type="button" className="prava-checkout__pay" onClick={pay} disabled={busy}>
        {busy ? "Opening Prava…" : `Pay ₹${Number(amount).toLocaleString("en-IN")} with Prava`}
      </button>
      <p className="prava-checkout__note">
        You will be taken to Prava to authenticate with your passkey. Card details are entered
        on Prava&apos;s page — this application never sees a card number.
      </p>
      {error && (
        <p className="prava-checkout__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
