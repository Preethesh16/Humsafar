import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVENANCE,
  labelForPurchase,
  normalizeSource,
  provenCount,
  runMode,
  runModeLabel,
} from "../src/lib/provenance.js";

/**
 * These tests pin the exact wording from `precaution.md`. If a label changes
 * here, it must have changed there first — the whole point is that the UI
 * cannot quietly drift into a friendlier claim than the evidence supports.
 */

test("an absent or unrecognised source is treated pessimistically", () => {
  for (const source of [undefined, null, "", "definitely-live", 42]) {
    assert.equal(normalizeSource(source), PROVENANCE.UNKNOWN);
    const label = labelForPurchase({ source, status: "success" });
    assert.equal(label.text, "source unverified; not evidence of a payment");
    assert.equal(label.proven, false);
  }
});

test("a fixture purchase never claims a payment was attempted", () => {
  const label = labelForPurchase({ source: "fixture", status: "success" });
  assert.equal(label.text, "fixture / simulated; no payment attempted");
  assert.equal(label.proven, false);
  for (const banned of ["live", "sandbox transaction", "order placed"]) {
    assert.ok(!label.text.includes(banned), `fixture label must never say "${banned}"`);
  }
});

test("an advisory reserve is never counted as a payment", () => {
  const label = labelForPurchase({ source: "fixture", status: "success", outcome: "advisory" });
  assert.equal(label.text, "advisory reserve; no card or payment");
  assert.equal(label.proven, false);
});

test("legacy source \"live\" describes data, not payment, so stays unproven", () => {
  const label = labelForPurchase({ source: "live", status: "success" });
  assert.equal(label.text, "live integration data; payment evidence unverified");
  assert.equal(label.proven, false);
});

test("a successful sandbox purchase is a completed sandbox checkout", () => {
  const label = labelForPurchase({ source: "sandbox", status: "success" });
  assert.equal(label.text, "completed sandbox checkout");
  assert.equal(label.proven, true);
  assert.ok(!label.text.includes("production"), "must never imply production");
});

test("a credential without a merchant result is never called a checkout", () => {
  const label = labelForPurchase({ source: "sandbox", status: "success", outcome: "credential_issued" });
  assert.equal(label.text, "Prava sandbox credential issued");
  assert.equal(label.proven, true);
  assert.ok(!label.text.includes("checkout"));
});

test("a refused sandbox credential is proven but never called a checkout", () => {
  const label = labelForPurchase({ source: "sandbox", status: "failed", outcome: "credential_failed" });
  assert.equal(label.text, "Prava sandbox credential request refused — no checkout");
  assert.equal(label.proven, true);
  assert.ok(!label.text.includes("completed"));
});

test("a failed sandbox purchase is not claimed as an expected decline", () => {
  const label = labelForPurchase({ source: "sandbox", status: "failed" });
  assert.equal(label.text, "Prava sandbox checkout attempt — not completed");
  // Without a structured cause we cannot know a failure proves cap enforcement
  // rather than an ordinary booking failure, so we must not claim the former.
  assert.ok(!label.text.includes("declined as expected"));
  assert.ok(!label.text.includes("completed sandbox checkout"));
});

test("test inventory is always qualified", () => {
  const label = labelForPurchase({ source: "sandbox", status: "success", environment: "test" });
  assert.ok(label.text.endsWith("· test inventory"));
});

test("a run mixing fixture and sandbox is mixed-mode", () => {
  const mode = runMode([
    { source: "fixture", status: "success" },
    { source: "fixture", status: "success" },
    { source: "sandbox", status: "success" },
  ]);
  assert.equal(mode, "mixed-mode");
  const label = runModeLabel(mode);
  assert.ok(label.text.includes("Mixed-mode"));
  assert.ok(label.detail.includes("No line inherits another line's result."));
});

test("an all-fixture run says plainly that no payment was attempted", () => {
  const mode = runMode([
    { source: "fixture", status: "success" },
    { source: "fixture", status: "failed" },
  ]);
  assert.equal(mode, PROVENANCE.FIXTURE);
  assert.equal(runModeLabel(mode).text, "Fixture-only run — no payment was attempted");
});

test("an all-sandbox run is labelled sandbox and never production", () => {
  const label = runModeLabel(runMode([{ source: "sandbox", status: "success" }]));
  assert.equal(label.text, "Prava sandbox run");
  assert.ok(label.detail.includes("Not production, not real money."));
});

test("a run with no purchases makes no claim at all", () => {
  assert.equal(runMode([]), "none");
  assert.equal(runModeLabel("none").text, "No purchases yet");
});

test("an untagged run is reported as unverified provenance", () => {
  const label = runModeLabel(runMode([{ status: "success" }, { status: "success" }]));
  assert.equal(label.text, "Unverified provenance");
});

test("provenCount counts only purchases that exercised a payment path", () => {
  const purchases = [
    { source: "fixture", status: "success" },
    { source: "fixture", status: "success" },
    { source: "sandbox", status: "success" },
    { source: "live", status: "success" },
    { status: "success" },
  ];
  // Three fixtures/live/untagged prove nothing; only the sandbox line does.
  assert.equal(provenCount(purchases), 1);
  assert.notEqual(provenCount(purchases), purchases.length);
});
