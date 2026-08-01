/**
 * Provenance labelling — the exact vocabulary from `precaution.md`.
 *
 * `execution-plan.md` Priority 0 item 3: render `fixture`, `sandbox`,
 * `production` and `environment=test` distinctly, and keep unknown provenance
 * pessimistic. `precaution.md` fixes the wording, so the strings below are
 * copied from its table rather than paraphrased — a nicer-sounding synonym is
 * exactly the drift that turns an honest demo into an overstated claim.
 *
 * Pure and framework-free so `node --test` can pin every rule.
 *
 * The one rule behind all of this: a label may only describe evidence we
 * actually received. When the evidence is ambiguous we say less, never more.
 */

export const PROVENANCE = {
  FIXTURE: "fixture",
  SANDBOX: "sandbox",
  PRODUCTION: "production",
  /** Legacy INTERFACES.md §4 value. Means "live integration data", which says
   *  nothing about whether a payment occurred — so it is treated as unproven. */
  LIVE_DATA: "live",
  UNKNOWN: "unknown",
};

export function normalizeSource(source) {
  switch (source) {
    case "fixture":
      return PROVENANCE.FIXTURE;
    case "sandbox":
      return PROVENANCE.SANDBOX;
    case "production":
      return PROVENANCE.PRODUCTION;
    case "live":
      return PROVENANCE.LIVE_DATA;
    default:
      return PROVENANCE.UNKNOWN;
  }
}

/**
 * The label for a single purchase or receipt line.
 *
 * @param {{ source?: string, status?: string, environment?: string }} line
 * @returns {{ text: string, tone: "ok"|"warn"|"danger"|"neutral", proven: boolean }}
 *   `proven` is true only when the evidence genuinely shows a payment path was
 *   exercised. Callers must not treat anything else as a completed order.
 */
export function labelForPurchase(line = {}) {
  const source = normalizeSource(line.source);
  const failed = line.status === "failed";
  const testInventory = line.environment === "test";

  let text;
  let tone;
  let proven = false;

  switch (source) {
    case PROVENANCE.FIXTURE:
      text = "fixture / simulated; no payment attempted";
      tone = "warn";
      break;

    case PROVENANCE.SANDBOX:
      if (failed) {
        // Deliberately NOT "declined as expected". A sandbox failure may be a
        // genuine decline that proves cap enforcement, or an ordinary booking
        // failure. Without a structured cause we must not claim the flattering
        // one. See the note to Preethesh in progress-deepthi.md.
        text = "Prava sandbox checkout attempt — not completed";
        tone = "danger";
      } else {
        text = "completed sandbox checkout";
        tone = "ok";
      }
      proven = true;
      break;

    case PROVENANCE.PRODUCTION:
      text = failed ? "production checkout attempt — not completed" : "completed production checkout";
      tone = failed ? "danger" : "ok";
      proven = true;
      break;

    case PROVENANCE.LIVE_DATA:
      // "live" describes where the *data* came from, not whether money moved.
      text = "live integration data; payment evidence unverified";
      tone = "neutral";
      break;

    default:
      text = "source unverified; not evidence of a payment";
      tone = "danger";
      break;
  }

  if (testInventory) text += " · test inventory";
  return { text, tone, proven };
}

/** Run-level provenance. `precaution.md`: if only some categories exercise
 *  Prava, the run is **mixed-mode** and every purchase is labelled separately. */
export function runMode(purchases = []) {
  const kinds = new Set(purchases.map((p) => normalizeSource(p.source)));
  if (kinds.size === 0) return "none";
  if (kinds.size > 1) return "mixed-mode";
  return [...kinds][0];
}

export function runModeLabel(mode) {
  switch (mode) {
    case "mixed-mode":
      return {
        text: "Mixed-mode run — every purchase is labelled separately",
        detail:
          "Only some categories exercised Prava. No line inherits another line's result.",
        tone: "warn",
      };
    case PROVENANCE.FIXTURE:
      return {
        text: "Fixture-only run — no payment was attempted",
        detail: "Every purchase is simulated from local fixture data.",
        tone: "warn",
      };
    case PROVENANCE.SANDBOX:
      return {
        text: "Prava sandbox run",
        detail: "Sandbox credentials only. Not production, not real money.",
        tone: "ok",
      };
    case PROVENANCE.PRODUCTION:
      return { text: "Production run", detail: "Real credentials.", tone: "ok" };
    case PROVENANCE.LIVE_DATA:
      return {
        text: "Live-sourced data; payment evidence unverified",
        detail: "Options came from a live integration, but no payment evidence was reported.",
        tone: "neutral",
      };
    case "none":
      return { text: "No purchases yet", detail: "", tone: "neutral" };
    default:
      return {
        text: "Unverified provenance",
        detail: "No purchase reported a recognised source. Treat nothing here as a payment.",
        tone: "danger",
      };
  }
}

/** How many purchases genuinely exercised a payment path. Used so the receipt
 *  can state the real count instead of implying every line did. */
export function provenCount(purchases = []) {
  return purchases.filter((p) => labelForPurchase(p).proven).length;
}
