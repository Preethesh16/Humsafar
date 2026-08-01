export class MandateService {
  constructor({ pravaClient, mandateMerchants }) {
    this.pravaClient = pravaClient;
    this.mandateMerchants = mandateMerchants;
  }

  async createSetupSession({ userId, userEmail, amountCap, currency = "INR", merchant, product }) {
    return this.pravaClient.createMandateSession({
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

  async syncCustomerMandates(customerId) {
    const result = await this.pravaClient.listMandates({ customerId, standingOnly: true });
    for (const mandate of result.data.mandates) {
      if (mandate.status === "active" && mandate.merchantScope === "listed") {
        this.mandateMerchants.set(mandate.id, mandate.merchantName);
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
    return this.pravaClient.reportMandateCharge({
      ...input,
      txn_status: input.status,
      txn_type: "PURCHASE",
      amount_paid: input.amountPaid === undefined ? undefined : money(input.amountPaid),
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
