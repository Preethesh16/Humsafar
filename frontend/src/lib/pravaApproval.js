import QRCode from "qrcode";

const PRAVA_SANDBOX_HOST = "sandbox.collect.prava.space";

/**
 * Requests one server-pinned Prava ceremony and turns its hosted URL into a QR.
 * No customer, card, merchant or cap is accepted from the browser.
 */
export async function requestPravaPhoneApproval({
  fetchImpl = globalThis.fetch,
  toDataURL = QRCode.toDataURL,
} = {}) {
  const response = await fetchImpl("/api/prava/phone-approval", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw approvalError(
      payload?.error?.code ?? "PRAVA_PHONE_APPROVAL_FAILED",
      payload?.error?.message ?? "Could not start Prava phone approval",
    );
  }

  const approval = validateApproval(payload);
  const qrDataUrl = await toDataURL(approval.iframeUrl, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#173c2b", light: "#fffdf8" },
  });
  return { ...approval, qrDataUrl };
}

function validateApproval(payload) {
  let hostedUrl;
  try {
    hostedUrl = new URL(payload?.iframeUrl);
  } catch {
    throw approvalError("PRAVA_INVALID_APPROVAL_URL", "Prava returned no usable approval link");
  }

  if (
    payload?.environment !== "sandbox"
    || payload?.authorizeOnly !== true
    || hostedUrl.protocol !== "https:"
    || hostedUrl.hostname !== PRAVA_SANDBOX_HOST
  ) {
    throw approvalError("PRAVA_INVALID_APPROVAL_URL", "Prava returned an unexpected approval link");
  }

  const amountCap = Number(payload.amountCap);
  if (
    !Number.isFinite(amountCap)
    || amountCap <= 0
    || typeof payload.merchant !== "string"
    || !payload.merchant.trim()
    || typeof payload.currency !== "string"
    || !Number.isFinite(Date.parse(payload.expiresAt))
  ) {
    throw approvalError("PRAVA_INVALID_APPROVAL_RESPONSE", "Prava returned incomplete approval details");
  }

  return {
    environment: "sandbox",
    merchant: payload.merchant,
    amountCap,
    currency: payload.currency,
    iframeUrl: hostedUrl.href,
    expiresAt: new Date(payload.expiresAt).toISOString(),
    authorizeOnly: true,
    reused: payload.reused === true,
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
