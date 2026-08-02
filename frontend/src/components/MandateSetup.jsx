import { useCallback, useState } from "react";

/**
 * Authorising an agent to spend — in our page, not a link pasted into a phone.
 *
 * This is the one payment step that *has* to involve the human: it is their
 * card and their passkey, and Visa's Trusted Agent Protocol requires that
 * consent be cryptographically bound to them. Everything after it is
 * autonomous — the agents charge the mandate server-to-server with no UI at
 * all.
 *
 * Three things are deliberate:
 *
 * - **The card is entered on Prava's page inside the frame, never on ours.**
 *   That is what keeps this application out of PCI scope. We receive an
 *   `iframe_url` and a mandate id; we never see a card number, and there is no
 *   field here that could hold one.
 * - **`allow="publickey-credentials-*"` is required.** WebAuthn is blocked in
 *   cross-origin frames unless the embedder delegates it, so without this the
 *   passkey step silently fails to start and the user just sees a dead button.
 * - **A passkey needs a platform authenticator.** Face ID, Touch ID or a
 *   fingerprint reader. On a desktop without one the ceremony cannot complete,
 *   which is why the fallback link is offered rather than hidden.
 */

const STATE = {
  IDLE: "idle",
  CREATING: "creating",
  READY: "ready",
  FAILED: "failed",
};

export default function MandateSetup({ merchant, amountCap, description, onAuthorized }) {
  const [state, setState] = useState(STATE.IDLE);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  const begin = useCallback(async () => {
    setState(STATE.CREATING);
    setError("");
    try {
      const response = await fetch("/api/prava/mandate-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "humsafar-demo-user",
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

      const body = await response.json();
      const data = body?.data ?? body;
      if (!data?.iframe_url) throw new Error("Prava did not return an approval page");

      setSession(data);
      setState(STATE.READY);
    } catch (caught) {
      // Never assume an authorisation happened. A failure here leaves the
      // merchant unauthorised, and the agent's mint will refuse rather than
      // proceed on an assumption.
      setError(caught.message || "Could not start the authorisation");
      setState(STATE.FAILED);
    }
  }, [merchant, amountCap, description]);

  return (
    <section className="mandate-setup">
      <header className="mandate-setup__head">
        <div>
          <h3>Authorise {merchant.name}</h3>
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

      {state === STATE.FAILED && (
        <div className="mandate-setup__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={begin}>
            Try again
          </button>
        </div>
      )}

      {state === STATE.READY && session && (
        <>
          <iframe
            className="mandate-setup__frame"
            src={session.iframe_url}
            title={`Authorise spending at ${merchant.name} with Prava`}
            // WebAuthn is blocked in a cross-origin frame unless the embedder
            // delegates it. Without this the passkey step never starts.
            allow="publickey-credentials-get *; publickey-credentials-create *; payment *"
          />
          <footer className="mandate-setup__foot">
            <p>
              Your card details are entered on Prava's page inside this frame. They are never
              sent to Humsafar, and this application never sees a card number.
            </p>
            <p>
              A passkey needs Face ID, Touch ID or a fingerprint reader. On a desktop without
              one,{" "}
              <a href={session.iframe_url} target="_blank" rel="noopener noreferrer">
                open it on your phone instead ↗
              </a>
              .
            </p>
            <button type="button" onClick={() => onAuthorized?.(session)}>
              I've finished authorising
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
