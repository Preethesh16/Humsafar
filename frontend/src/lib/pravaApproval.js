import QRCode from "qrcode";

const PRAVA_SANDBOX_ORIGIN = "https://sandbox.collect.prava.space";

/**
 * Requests one server-pinned Prava ceremony and turns its hosted URL into a QR.
 * No customer, card, merchant or cap is accepted from the browser.
 */
export async function requestPravaPhoneApproval(runId, {
  fetchImpl = globalThis.fetch,
  toDataURL = QRCode.toDataURL,
} = {}) {
  assertRunId(runId);
  const response = await fetchImpl("/api/prava/phone-approval", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw approvalError(
      payload?.error?.code ?? "PRAVA_PHONE_APPROVAL_FAILED",
      payload?.error?.message ?? "Could not start Prava phone approval",
    );
  }

  const approval = validateApproval(payload, runId);
  const qrDataUrl = await toDataURL(approval.iframeUrl, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#173c2b", light: "#fffdf8" },
  });
  return { ...approval, qrDataUrl };
}

export async function checkPravaPhoneApproval(runId, { fetchImpl = globalThis.fetch } = {}) {
  assertRunId(runId);
  const response = await fetchImpl(
    `/api/prava/phone-approval?runId=${encodeURIComponent(runId)}`,
    { headers: { Accept: "application/json" } },
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw approvalError(
      payload?.error?.code ?? "PRAVA_PHONE_STATUS_FAILED",
      payload?.error?.message ?? "Could not check Prava sandbox status",
    );
  }
  return validateStatus(payload, runId);
}

function validateApproval(payload, runId) {
  let hostedUrl;
  try {
    hostedUrl = new URL(payload?.iframeUrl);
  } catch {
    throw approvalError("PRAVA_INVALID_APPROVAL_URL", "Prava returned no usable approval link");
  }

  if (
    payload?.environment !== "sandbox"
    || payload?.runId !== runId
    || hostedUrl.origin !== PRAVA_SANDBOX_ORIGIN
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
    stage: validStage(payload.stage),
    reused: payload.reused === true,
  };
}

function validateStatus(payload, runId) {
  const amountCap = Number(payload?.amountCap);
  if (
    payload?.environment !== "sandbox"
    || payload?.runId !== runId
    || !Number.isFinite(amountCap)
    || amountCap <= 0
    || typeof payload?.merchant !== "string"
    || typeof payload?.currency !== "string"
    || typeof payload?.checkedAt !== "string"
  ) {
    throw approvalError("PRAVA_INVALID_STATUS_RESPONSE", "Prava returned incomplete checkout status");
  }
  const stage = validStage(payload.stage);
  return {
    runId,
    environment: "sandbox",
    merchant: payload.merchant,
    amountCap,
    currency: payload.currency,
    stage,
    terminal: payload.terminal === true,
    paid: stage === "completed" && payload.paid === true,
    checkedAt: payload.checkedAt,
  };
}

function validStage(stage) {
  const allowed = new Set([
    "waiting_for_cardholder",
    "checking",
    "checkout_ready",
    "completed",
    "failed",
    "expired",
  ]);
  if (!allowed.has(stage)) {
    throw approvalError("PRAVA_INVALID_STATUS_RESPONSE", "Prava returned an unknown checkout status");
  }
  return stage;
}

function assertRunId(runId) {
  if (typeof runId !== "string" || !runId.trim()) {
    throw approvalError("PRAVA_PLAN_NOT_FOUND", "This trip has no verifiable run reference");
  }
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
