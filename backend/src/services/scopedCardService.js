import { randomUUID } from "node:crypto";

export class ScopedCardService {
  constructor({ pravaClient, mandateMerchants, logger = console, createReference } = {}) {
    if (!pravaClient || typeof pravaClient.chargeMandate !== "function") {
      throw new TypeError("A Prava client with chargeMandate() is required");
    }
    if (!mandateMerchants || typeof mandateMerchants.get !== "function") {
      throw new TypeError("A mandate-to-merchant registry with get() is required");
    }

    this.pravaClient = pravaClient;
    this.mandateMerchants = mandateMerchants;
    this.logger = logger;
    this.createReference = createReference ?? (() => `humsafar-${randomUUID()}`);
  }

  async mintScopedCard(mandateId, merchant, amountCap) {
    const inputError = validateInputs(mandateId, merchant, amountCap);
    if (inputError) {
      return failedCard(merchant, amountCap, inputError);
    }

    const expectedMerchant = this.mandateMerchants.get(mandateId);
    if (!expectedMerchant) {
      return failedCard(
        merchant,
        amountCap,
        "Mandate merchant scope is not registered; refusing to mint credentials",
      );
    }

    if (normalizeMerchant(expectedMerchant) !== normalizeMerchant(merchant)) {
      return failedCard(
        merchant,
        amountCap,
        `Mandate is scoped to ${expectedMerchant}, not ${merchant}`,
      );
    }

    try {
      const result = await this.pravaClient.chargeMandate({
        mandateId,
        amount: amountCap.toFixed(2),
        reference: this.createReference(),
      });

      this.logger.info?.({ integration: "prava", source: result.source });

      return {
        cardId: result.data.instructionId,
        cardToken: result.data.credentials.token,
        transactionId: result.data.transactionId ?? null,
        dynamicCvv: result.data.credentials.dynamicCvv,
        expiryMonth: result.data.credentials.expiryMonth,
        expiryYear: result.data.credentials.expiryYear,
        merchant,
        amountCap,
        status: "issued",
        source: "sandbox",
      };
    } catch (error) {
      this.logger.error?.({
        integration: "prava",
        code: error?.code ?? "PRAVA_CHARGE_FAILED",
        responseId: error?.responseId,
      });

      return failedCard(
        merchant,
        amountCap,
        error instanceof Error ? error.message : "Prava charge failed",
        error?.code ?? "PRAVA_CHARGE_FAILED",
      );
    }
  }
}

function validateInputs(mandateId, merchant, amountCap) {
  if (typeof mandateId !== "string" || mandateId.trim() === "") {
    return "mandateId must be a non-empty string";
  }
  if (typeof merchant !== "string" || merchant.trim() === "") {
    return "merchant must be a non-empty string";
  }
  if (!Number.isFinite(amountCap) || amountCap <= 0) {
    return "amountCap must be a positive finite number";
  }

  const cents = amountCap * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-7) {
    return "amountCap must have at most two decimal places";
  }

  return undefined;
}

function normalizeMerchant(merchant) {
  return merchant.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function failedCard(merchant, amountCap, error, errorCode = "SCOPED_CARD_REJECTED") {
  return {
    cardId: "",
    cardToken: "",
    transactionId: null,
    dynamicCvv: "",
    expiryMonth: "",
    expiryYear: "",
    merchant: typeof merchant === "string" ? merchant : "",
    amountCap: Number.isFinite(amountCap) ? amountCap : 0,
    status: "failed",
    source: "sandbox",
    errorCode,
    error,
  };
}
