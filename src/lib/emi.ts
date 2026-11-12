// Home-loan EMI maths for the calculator on sale listings. Pure, so it runs in the
// browser and tests can load it directly.

export type EmiInput = {
  /** Property price in rupees. */
  price: number;
  /** Share of the price paid up front, 0–100. */
  downPaymentPct: number;
  /** Interest rate, % per year. */
  annualRatePct: number;
  /** Loan tenure in years. */
  years: number;
};

export type EmiResult = {
  downPayment: number;
  loan: number;
  /** Monthly instalment, rounded to the rupee. */
  emi: number;
  totalInterest: number;
  /** Everything paid to the bank: loan + interest. */
  totalPayable: number;
};

export const EMI_DEFAULTS = { downPaymentPct: 20, annualRatePct: 8.75, years: 20 } as const;

/** Slider ranges. Banks rarely lend more than 90% of the price. */
export const EMI_LIMITS = {
  downPaymentPct: { min: 10, max: 90, step: 5 },
  annualRatePct: { min: 6, max: 15, step: 0.05 },
  years: { min: 1, max: 30, step: 1 },
} as const;

const clamp = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

/**
 * Reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1), with r the monthly rate and n the
 * number of months. Inputs outside the slider ranges are pulled back into them.
 */
export function calculateEmi(input: EmiInput): EmiResult {
  const price = Math.max(0, Number.isFinite(input.price) ? input.price : 0);
  const downPct = clamp(input.downPaymentPct, 0, 100);
  const rate = clamp(input.annualRatePct, 0, 100);
  const months = Math.round(clamp(input.years, 1 / 12, 50) * 12);

  const downPayment = Math.round((price * downPct) / 100);
  const loan = price - downPayment;
  const r = rate / 12 / 100;
  const exact = loan === 0 ? 0 : r === 0 ? loan / months : (loan * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const emi = Math.round(exact);
  const totalPayable = Math.round(exact * months);
  return { downPayment, loan, emi, totalInterest: totalPayable - loan, totalPayable };
}
