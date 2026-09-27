import assert from "node:assert/strict";
import test from "node:test";
import { computeQuoteVerdict, validateVerdictSummary } from "./quoteReport";
import { generateVendorClarificationMessage } from "./vendorMessage";
import type { QuoteFinding } from "./quoteIntelligence";

function finding(
  severity: QuoteFinding["severity"],
  category: QuoteFinding["category"] = "other",
): QuoteFinding {
  return {
    severity,
    category,
    title: `${severity} ${category}`,
    description: "A source-backed issue needs clarification.",
    evidence: "Quoted evidence",
    recommendation: "Ask the vendor to confirm it in writing.",
  };
}

test("returns GREEN when there are no high findings and fewer than three medium findings", () => {
  const verdict = computeQuoteVerdict([finding("MEDIUM"), finding("LOW")]);
  assert.equal(verdict.status, "GREEN");
  assert.equal(verdict.label, "SAFE TO SIGN");
  assert.equal(verdict.mediumCount, 1);
});

test("returns YELLOW for one non-commercial high finding", () => {
  const verdict = computeQuoteVerdict([finding("HIGH", "warranty_gap")]);
  assert.equal(verdict.status, "YELLOW");
  assert.equal(verdict.label, "RESOLVE 1 CRITICAL ITEM BEFORE SIGNING");
});

test("returns YELLOW for three medium findings", () => {
  const verdict = computeQuoteVerdict([
    finding("MEDIUM"),
    finding("MEDIUM"),
    finding("MEDIUM"),
  ]);
  assert.equal(verdict.status, "YELLOW");
  assert.equal(verdict.label, "ASK 3 CLARIFICATIONS BEFORE SIGNING");
});

test("returns RED for a high payment or math finding", () => {
  assert.equal(computeQuoteVerdict([finding("HIGH", "payment_risk")]).status, "RED");
  assert.equal(computeQuoteVerdict([finding("HIGH", "math_error")]).status, "RED");
});

test("returns RED for two high findings", () => {
  const verdict = computeQuoteVerdict([
    finding("HIGH", "warranty_gap"),
    finding("HIGH", "contract_risk"),
  ]);
  assert.equal(verdict.status, "RED");
  assert.equal(verdict.highCount, 2);
});

test("rejects a number word that is not supported by the evidence", () => {
  const paymentFinding = {
    ...finding("HIGH", "payment_risk"),
    title: "Conflicting payment schedules",
    evidence: "Two payment schedules are printed in the quote.",
  };
  assert.equal(
    validateVerdictSummary(
      "Three different payment schedules need to be resolved before signing.",
      paymentFinding,
    ),
    "Confirm one signed payment schedule with your vendor in writing before signing anything.",
  );
});

test("accepts a count that is explicitly supported by the evidence", () => {
  const paymentFinding = {
    ...finding("HIGH", "payment_risk"),
    title: "Conflicting payment schedules",
    evidence: "The quote prints 2 payment schedules.",
  };
  const summary = "Confirm which of the 2 payment schedules applies before signing.";
  assert.equal(validateVerdictSummary(summary, paymentFinding), summary);
});

test("uses a price-specific message for hidden cost findings", async () => {
  const message = await generateVendorClarificationMessage({
    ...finding("LOW", "hidden_cost"),
    title: "Amount is missing for Wall Paper",
  });
  assert.match(message, /price for Wall Paper/i);
  assert.doesNotMatch(message, /material grade|hardware specification/i);
});

test("uses a quantity-specific message for quantity anomaly findings", async () => {
  const message = await generateVendorClarificationMessage({
    ...finding("LOW", "quantity_anomaly"),
    title: "Quantity is incomplete for Wall Paper",
  });
  assert.match(message, /quantity or unit of measure/i);
});