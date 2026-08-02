export class MandateService {
  constructor({ pravaClient, mandateMerchants }) {
    this.pravaClient = pravaClient;
    this.mandateMerchants = mandateMerchants;
  }

  async createSetupSession({ userId, userEmail, amountCap, currency = "INR", merchant, product, callbackUrl }) {
    return this.pravaClient.createMandateSession({
      // Documented in Prava's REST checkout walkthrough: the hosted page
      // redirects here once the cardholder is done, which is what returns them
      // to our app instead of stranding them on Prava's domain. `return_url`
      // and `redirect_url` are accepted and silently ignored — the field is
      // `callback_url`.
      //
      // Prava rejects a non-https value outright ("callback_url must use https
      // protocol"), so an http origin must omit it rather than send one and
      // take a 400. PUBLIC_BASE_URL is http on every local dev server, so
      // without this guard the phone-approval ceremony fails locally.
      ...(typeof callbackUrl === "string" && callbackUrl.startsWith("https://")
        ? { callback_url: callbackUrl }
        : {}),
      user_id: userId,
      user_email: userEmail,
      total_amount: money(amountCap),
      currency,
      purchase_context: [{
        merchant_details: {
          name: merchant.name,
          url: merchant.url,
          country_code_iso2: merchant.countryCode,
        },
        product_details: [{
          description: product.description,
          unit_price: money(product.unitPrice),
          quantity: product.quantity ?? 1,
        }],
      }],
      integration_type: "full_checkout",
      mandate_setup: {
        intent: "mandate_setup",
        recurring_frequency: "one_time",
        merchant_scope: "listed",
        max_charges: 1,
      },
    });
  }

  async listCustomerMandates(customerId) {
    return this.pravaClient.listMandates({ customerId, standingOnly: true });
  }

  async syncCustomerMandates(customerId) {
    const result = await this.pravaClient.listMandates({ customerId, standingOnly: true });
    for (const mandate of result.data.mandates) {
      // `status` and `state` are separate: a consumed or cancelled mandate
      // still reports status "active", so filtering on status alone kept dead
      // mandates in the registry. Every re-approval for the same merchant then
      // added another entry, and resolveMandate() failed closed with
      // "Multiple active mandates are registered for this merchant" — which is
      // exactly what it should do given a registry full of stale ids.
      //
      // A mandate is only usable when it is still available to charge, so
      // unusable ones are actively removed rather than merely skipped.
      // `state` is excluded only when it is explicitly unusable, rather than
      // required to be present. Live Prava always sends it, but a response
      // without one should keep the original behaviour instead of silently
      // dropping every mandate.
      const unusableState =
        typeof mandate.state === "string" && mandate.state !== "available";
      const usable =
        mandate.status === "active" && mandate.merchantScope === "listed" && !unusableState;

      if (usable) {
        this.mandateMerchants.set(mandate.id, mandate.merchantName);
      } else {
        this.mandateMerchants.delete(mandate.id);
      }
    }
    return result;
  }

  resolveMandate(merchant) {
    if (typeof merchant !== "string" || merchant.trim() === "") {
      throw new TypeError("merchant must be a non-empty string");
    }

    const normalized = normalizeMerchant(merchant);
    const matches = [...this.mandateMerchants.entries()].filter(
      ([, registeredMerchant]) => normalizeMerchant(registeredMerchant) === normalized,
    );
    if (matches.length === 0) return undefined;
    if (matches.length > 1) {
      throw new Error("Multiple active mandates are registered for this merchant");
    }

    const [mandateId, registeredMerchant] = matches[0];
    return {
      data: { mandateId, merchant: registeredMerchant },
      source: "sandbox",
    };
  }

  async reportCharge(input) {
    const txnStatus = input.txn_status ?? input.status;
    if (!new Set(["APPROVED", "DECLINED"]).has(txnStatus)) {
      throw new TypeError("txn_status must be APPROVED or DECLINED");
    }
    const rawAmount = input.amount_paid ?? input.amountPaid;
    const amountPaid = rawAmount === undefined ? undefined : Number(rawAmount);
    return this.pravaClient.reportMandateCharge({
      ...input,
      txn_status: txnStatus,
      txn_type: "PURCHASE",
      amount_paid: amountPaid === undefined ? undefined : money(amountPaid),
      status: undefined,
      amountPaid: undefined,
    });
  }
}

function normalizeMerchant(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function money(value) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError("amount must be positive");
  return value.toFixed(2);
}
