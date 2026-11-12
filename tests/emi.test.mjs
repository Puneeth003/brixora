// EMI maths for the calculator on sale listings (src/lib/emi.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { EMI_DEFAULTS, EMI_LIMITS, calculateEmi } from "../src/lib/emi.ts";

test("matches the standard reducing-balance formula", () => {
  // ₹50 L at 20% down → ₹40 L loan, 8.5% for 20 years: ₹34,713 a month.
  const r = calculateEmi({ price: 5_000_000, downPaymentPct: 20, annualRatePct: 8.5, years: 20 });
  assert.equal(r.downPayment, 1_000_000);
  assert.equal(r.loan, 4_000_000);
  assert.equal(r.emi, 34_713);
  // ₹10 L at 10% for 10 years with nothing down: ₹13,215 a month.
  assert.equal(calculateEmi({ price: 1_000_000, downPaymentPct: 0, annualRatePct: 10, years: 10 }).emi, 13_215);
});

test("the totals add up", () => {
  const r = calculateEmi({ price: 8_500_000, ...EMI_DEFAULTS });
  assert.equal(r.downPayment + r.loan, 8_500_000);
  assert.equal(r.totalPayable, r.loan + r.totalInterest);
  assert.ok(r.totalInterest > 0);
  // The rounded instalment times the months is within a rupee a month of the total.
  assert.ok(Math.abs(r.emi * EMI_DEFAULTS.years * 12 - r.totalPayable) <= EMI_DEFAULTS.years * 12);
});

test("a zero rate is the loan spread evenly, with no interest", () => {
  const r = calculateEmi({ price: 1_200_000, downPaymentPct: 0, annualRatePct: 0, years: 10 });
  assert.equal(r.emi, 10_000);
  assert.equal(r.totalInterest, 0);
});

test("paying everything up front leaves nothing to borrow", () => {
  assert.deepEqual(calculateEmi({ price: 3_000_000, downPaymentPct: 100, annualRatePct: 9, years: 15 }), {
    downPayment: 3_000_000,
    loan: 0,
    emi: 0,
    totalInterest: 0,
    totalPayable: 0,
  });
});

test("a longer tenure lowers the instalment and raises the interest", () => {
  const base = { price: 6_000_000, downPaymentPct: 20, annualRatePct: 9 };
  const short = calculateEmi({ ...base, years: 10 });
  const long = calculateEmi({ ...base, years: 25 });
  assert.ok(long.emi < short.emi);
  assert.ok(long.totalInterest > short.totalInterest);
});

test("bad input never produces NaN or a negative figure", () => {
  for (const input of [
    { price: NaN, downPaymentPct: 20, annualRatePct: 9, years: 20 },
    { price: -5, downPaymentPct: 20, annualRatePct: 9, years: 20 },
    { price: 5_000_000, downPaymentPct: 250, annualRatePct: -3, years: 0 },
    { price: 5_000_000, downPaymentPct: NaN, annualRatePct: NaN, years: NaN },
  ]) {
    for (const v of Object.values(calculateEmi(input))) assert.ok(Number.isFinite(v) && v >= 0, JSON.stringify(input));
  }
});

test("the defaults sit inside the slider ranges, on a step", () => {
  for (const [field, { min, max, step }] of Object.entries(EMI_LIMITS)) {
    const v = EMI_DEFAULTS[field];
    assert.ok(v >= min && v <= max, field);
    assert.ok(Math.abs((v - min) / step - Math.round((v - min) / step)) < 1e-9, field);
  }
});
