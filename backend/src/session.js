import crypto from "node:crypto";

/**
 * Browser sessions for the deployed app.
 *
 * In development the Vite dev server proxies `/api` and injects
 * `INTERNAL_API_TOKEN` on the way through, which is why `vite.config.js` warns
 * against ever putting that token in client code. Deployed, there is no dev
 * server, so the browser needs its own way to authenticate — and handing it the
 * internal token would be exactly the thing that warning forbids.
 *
 * So the browser gets a signed, httpOnly cookie instead, issued by the server
 * when it serves the app shell. The internal token never leaves the server.
 *
 * **This is deliberately narrower than the dev proxy.** That proxy gave the
 * browser the full internal token, which meant anyone with dev tools could mint
 * a scoped card or publish a forged event into the SSE stream. A session cookie
 * carries no such power: it opens only the four routes a human actually drives
 * (start a run, choose an option, decide an approval, read the stream). Card
 * minting, event publishing, approval creation/consumption and every Prava
 * route stay bearer-token-only, reachable by the agent process alone.
 *
 * What it does *not* do is identify a user. Anyone who can load the page can
 * start a run, which is correct for a public demo with no accounts — the
 * guarantee being kept here is that a browser cannot reach the payment
 * machinery, not that runs are private. The only Prava route a browser session
 * may reach is the explicitly enabled phone-approval ceremony: its amount and
 * merchant are pinned server-side, it returns no credential, and payment still
 * requires cardholder presence on Prava's hosted origin.
 */

export const SESSION_COOKIE = "humsafar_session";
const TTL_MS = 12 * 60 * 60 * 1000;

export function createSessionToken(secret, now = Date.now()) {
  const expiresAt = String(now + TTL_MS);
  return `${expiresAt}.${sign(expiresAt, secret)}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !secret) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  if (!/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= now) return false;

  return timingSafeEqual(supplied, sign(expiresAt, secret));
}

export function readCookie(header, name) {
  if (typeof header !== "string" || !header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function sessionCookieHeader(token, { secure }) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    // Lax rather than Strict: the Prava hosted approval page redirects back to
    // us, and Strict would drop the cookie on that top-level navigation and log
    // the judge out mid-demo.
    "SameSite=Lax",
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

/** True when the request reached us over TLS, directly or via a proxy. */
export function isSecureRequest(request) {
  if (request.secure) return true;
  const forwarded = request.get?.("x-forwarded-proto");
  return typeof forwarded === "string" && forwarded.split(",")[0].trim() === "https";
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  // crypto.timingSafeEqual throws on a length mismatch, which would itself leak
  // length through the exception path, so compare lengths first and always run
  // the constant-time check on equal-length buffers.
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
