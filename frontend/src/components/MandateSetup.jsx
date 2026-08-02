import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Authorising an agent to spend — inside our app, and it comes back by itself.
 *
 * This is the one payment step that has to involve the human: it is their card
 * and their passkey, and Visa's Trusted Agent Protocol requires that consent be
 * bound to them. Everything after it is autonomous — the agents charge the
 * mandate server-to-server with no UI at all.
 *
 * **Prava offers no redirect-back for mandate setup**, so there is no
 * `return_url` that would bounce the user home. Instead the page *polls* the
 * session and reacts the moment it stops being `pending`. That is strictly
 * better than a redirect: it works whichever surface the user finished on — the
 * embedded frame, a new tab, or their phone — and a closed tab or a lost
 * redirect cannot strand the flow.
 *
 * Two constraints that shape the rest:
 *
 * - **The card is entered on Prava's page inside the frame, never on ours.**
 *   That is what keeps this application out of PCI scope. There is no field
 *   here a card number could occupy.
 * - **A passkey needs a platform authenticator** — Face ID, Touch ID or a
 *   fingerprint reader. A desktop without one cannot complete the ceremony,
 *   which is why "continue on your phone" is offered plainly rather than
 *   buried. The polling means finishing on the phone still advances this page.
 */

const STATE = {
  IDLE: "idle",
  CREATING: "creating",
  WAITING: "waiting",
  DONE: "done",
  FAILED: "failed",
};

const POLL_MS = 3000;
const STORAGE_KEY = "humsafar.pendingMandateSession";

export default function MandateSetup({ merchant, amountCap, description, onAuthorized }) {
  const [state, setState] = useState(STATE.IDLE);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const timer = useRef(null);

  // Resume after a full-page redirect. The user leaves this origin entirely to
  // complete the passkey, so the session id is parked in sessionStorage and
  // picked up when they navigate back — otherwise returning would show a fresh
  // "Authorise" button as though nothing had happened.
  useEffect(() => {
    let parked;
    try {
      parked = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      parked = null;
    }
    if (parked?.merchant === merchant.name && parked?.session) {
      setSession(parked.session);
      setState(STATE.WAITING);
    }
  }, [merchant.name]);

  const finish = useCallback(
    async (completed) => {
      window.clearTimeout(timer.current);
      sessionStorage.removeItem(STORAGE_KEY);
      setState(STATE.DONE);
      // The mandate registry is built at runtime, so a mandate approved thirty
      // seconds ago is invisible to the agents until this runs.
      await fetch("/api/prava/mandates/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: "humsafar-demo-user" }),
      }).catch(() => {});
      onAuthorized?.(completed);
    },
    [onAuthorized],
  );

  // Poll until Prava stops saying "pending". Never assumes success: an
  // unreachable status endpoint keeps waiting rather than declaring victory.
  useEffect(() => {
    if (state !== STATE.WAITING || !session?.session_id) return undefined;

    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(
          `/api/prava/mandate-sessions/${encodeURIComponent(session.session_id)}/status`,
        );
        if (response.ok) {
          const body = await response.json();
          const status = (body?.data ?? body)?.status;
          if (!cancelled && status && status !== "pending") {
            finish(status);
            return;
          }
        }
      } catch {
        // Transient. Keep polling — the user may still be mid-ceremony.
      }
      if (!cancelled) timer.current = window.setTimeout(tick, POLL_MS);
    };

    timer.current = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [state, session, finish]);

  const begin = useCallback(async () => {
    setState(STATE.CREATING);
    setError("");
    try {
      const response = await fetch("/api/prava/mandate-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCap,
          currency: "INR",
          merchant: { name: merchant.name, url: merchant.url, countryCode: merchant.countryCode },
          product: { description, unitPrice: amountCap, quantity: 1 },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Prava returned ${response.status}`);
      }

      const data = (await response.json())?.data ?? {};
      if (!data.iframe_url) throw new Error("Prava did not return an approval page");

      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ merchant: merchant.name, session: data }),
      );
      setSession(data);
      setState(STATE.WAITING);
    } catch (caught) {
      // A failure leaves the merchant unauthorised, and the agent's mint will
      // refuse rather than proceed on an assumption.
      setError(caught.message || "Could not start the authorisation");
      setState(STATE.FAILED);
    }
  }, [merchant, amountCap, description]);

  return (
    <section className={`mandate-setup ${state === STATE.DONE ? "is-done" : ""}`}>
      <header className="mandate-setup__head">
        <div>
          <h3>
            {state === STATE.DONE ? "✓ " : ""}
            Authorise {merchant.name}
          </h3>
          <p className="mandate-setup__lede">
            One approval, with your own passkey. After this the agent spends up to{" "}
            <strong>₹{Number(amountCap).toLocaleString("en-IN")}</strong> at this merchant and
            nowhere else — no further prompts, and no way to exceed it.
          </p>
        </div>
        {state === STATE.IDLE && (
          <button type="button" className="mandate-setup__start" onClick={begin}>
            Authorise
          </button>
        )}
      </header>

      {state === STATE.CREATING && <p className="mandate-setup__note">Opening Prava…</p>}

      {state === STATE.DONE && (
        <p className="mandate-setup__note mandate-setup__note--ok">
          Authorised. The agent can now spend here, and this page picked that up on its own.
        </p>
      )}

      {state === STATE.FAILED && (
        <div className="mandate-setup__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={begin}>
            Try again
          </button>
        </div>
      )}

      {state === STATE.WAITING && session && (
        <>
          <iframe
            className="mandate-setup__frame"
            src={session.iframe_url}
            title={`Authorise spending at ${merchant.name} with Prava`}
            // WebAuthn is blocked in a cross-origin frame unless the embedder
            // delegates it. Without this the passkey never starts.
            allow="publickey-credentials-get *; publickey-credentials-create *; payment *"
          />
          <footer className="mandate-setup__foot">
            <p className="mandate-setup__waiting">
              <span className="pulse" aria-hidden="true" />
              Waiting for you to finish — this page continues by itself, wherever you complete it.
            </p>
            <p>
              Card details are entered on Prava's page inside this frame. They never reach
              Humsafar, and this application never sees a card number.
            </p>
            <p>
              A passkey needs Face ID, Touch ID or a fingerprint reader.{" "}
              <a href={session.iframe_url} target="_blank" rel="noopener noreferrer">
                Continue on your phone ↗
              </a>{" "}
              and this page will still catch it.
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
