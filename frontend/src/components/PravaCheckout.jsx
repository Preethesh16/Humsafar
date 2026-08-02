import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Paying for the plan through Prava, one merchant at a time.
 *
 * **One session per merchant, because Prava cannot batch them.** Sending four
 * merchants in `purchase_context` is rejected outright:
 *
 *     VAL_2001 — purchase_context: "Multi-merchant checkout is not yet supported"
 *
 * That is the same constraint as the mandate model, where `listed` scope locks
 * a mandate to a single merchant. So a four-agent plan is genuinely four
 * payments, and pretending otherwise would mean showing one button that
 * silently paid for a quarter of the trip.
 *
 * Each row therefore redirects to its own hosted page, and the component
 * tracks which merchants are settled so a plan can be paid across several
 * trips to Prava without losing its place.
 *
 * Returning is handled twice over, because neither way is reliable alone:
 * `callback_url` brings the browser back but Prava requires https, so it is
 * inert on a local dev server; the session id is also parked in
 * `sessionStorage` and polled on return, which covers http origins, a passkey
 * finished on a phone, and a closed tab.
 *
 * No credential reaches this component — the status route reports whether one
 * was issued and, if not, why. Tokens, CVVs and expiries stay server-side.
 */

const STORAGE_KEY = "humsafar.pravaCheckout";
const POLL_MS = 3000;

function readParked() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export default function PravaCheckout({ items }) {
  const [pending, setPending] = useState(() => readParked().pending ?? null);
  const [settled, setSettled] = useState(() => readParked().settled ?? {});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const timer = useRef(null);

  const persist = useCallback((next) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // Resume after the redirect. Without this, coming back from Prava shows a
  // fresh Pay button as though the trip never happened.
  useEffect(() => {
    if (!pending?.sessionId) return undefined;

    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(
          `/api/prava/checkout-sessions/${encodeURIComponent(pending.sessionId)}`,
        );
        if (response.ok) {
          const data = (await response.json())?.data ?? {};
          if (!cancelled && data.status && data.status !== "pending") {
            const next = { pending: null, settled: { ...settled, [pending.agent]: data } };
            setSettled(next.settled);
            setPending(null);
            persist(next);
            return;
          }
        }
      } catch {
        // Transient — keep waiting rather than declaring an outcome.
      }
      if (!cancelled) timer.current = window.setTimeout(tick, POLL_MS);
    };

    timer.current = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [pending, settled, persist]);

  const pay = useCallback(
    async (item) => {
      setBusy(item.agent);
      setError("");
      try {
        const response = await fetch("/api/prava/checkout-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: item.price,
            currency: "INR",
            merchant: {
              name: item.vendor,
              // Sandbox merchant details may be arbitrary — Prava says so,
              // because no real storefront is contacted.
              url: `https://example.com/${encodeURIComponent(
                String(item.vendor).toLowerCase().replace(/\s+/g, "-"),
              )}`,
              countryCode: "IN",
            },
            product: { description: `${item.agent} — ${item.vendor}`, unitPrice: item.price, quantity: 1 },
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `Prava returned ${response.status}`);
        }

        const data = (await response.json())?.data ?? {};
        if (!data.iframe_url) throw new Error("Prava did not return a checkout page");

        persist({
          pending: { sessionId: data.session_id, agent: item.agent, vendor: item.vendor },
          settled,
        });
        // Full-page redirect: the passkey ceremony is more reliable as a
        // top-level navigation than inside a frame, and it is what Prava's own
        // walkthrough describes.
        window.location.href = data.iframe_url;
      } catch (caught) {
        setError(caught.message || "Could not start the payment");
        setBusy(null);
      }
    },
    [settled, persist],
  );

  if (!items.length) return null;

  const outstanding = items.filter((item) => !settled[item.agent]);
  const total = outstanding.reduce((sum, item) => sum + Number(item.price), 0);

  return (
    <div className="prava-checkout">
      <h4>Pay with Prava</h4>
      <p className="prava-checkout__note">
        Prava does not support multi-merchant checkout, so each agent&apos;s merchant is paid
        separately — {items.length} payments for this plan. Card details are entered on
        Prava&apos;s page; this application never sees a card number.
      </p>

      {pending && (
        <p className="prava-checkout__waiting">
          Waiting for Prava to settle <strong>{pending.vendor}</strong> — this updates by
          itself, including if you finish on your phone.
        </p>
      )}

      <ul className="prava-checkout__list">
        {items.map((item) => {
          const done = settled[item.agent];
          const paid = done?.credentialIssued;
          return (
            <li key={item.agent} className={done ? (paid ? "is-paid" : "is-failed") : ""}>
              <div className="prava-checkout__row">
                <span className="prava-checkout__who">
                  <strong>{item.vendor}</strong>
                  <em>{item.agent}</em>
                </span>
                <span className="prava-checkout__amt">
                  ₹{Number(item.price).toLocaleString("en-IN")}
                </span>
                {done ? (
                  <span className="prava-checkout__state">
                    {paid ? "✓ credential issued" : done.errorCode || done.status}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="prava-checkout__pay"
                    onClick={() => pay(item)}
                    disabled={Boolean(busy) || Boolean(pending)}
                  >
                    {busy === item.agent ? "Opening…" : "Pay"}
                  </button>
                )}
              </div>
              {done && !paid && done.errorMessage && (
                <p className="prava-checkout__why">{done.errorMessage}</p>
              )}
            </li>
          );
        })}
      </ul>

      {outstanding.length > 0 && (
        <p className="prava-checkout__total">
          {outstanding.length} of {items.length} outstanding · ₹{total.toLocaleString("en-IN")}
        </p>
      )}

      {error && (
        <p className="prava-checkout__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
