"use client";

import { useId, useState } from "react";
import { EMI_DEFAULTS, EMI_LIMITS, calculateEmi } from "@/lib/emi";
import { formatNumber, formatPrice } from "@/lib/format";

type Field = keyof typeof EMI_LIMITS;

/** Home-loan EMI estimate for a sale listing. Everything is worked out in the browser. */
export function EmiCalculator({ price }: { price: number }) {
  const id = useId();
  const [values, setValues] = useState<Record<Field, number>>({ ...EMI_DEFAULTS });
  const result = calculateEmi({ price, ...values });
  const interestShare = result.totalPayable > 0 ? (result.totalInterest / result.totalPayable) * 100 : 0;

  const set = (field: Field, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const { min, max } = EMI_LIMITS[field];
    setValues((v) => ({ ...v, [field]: Math.min(max, Math.max(min, n)) }));
  };

  const slider = (field: Field, label: string, shown: string) => {
    const { min, max, step } = EMI_LIMITS[field];
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-${field}`} className="text-sm font-medium text-zinc-700">
            {label}
          </label>
          <span className="text-sm font-semibold text-zinc-900 tabular-nums">{shown}</span>
        </div>
        <input
          id={`${id}-${field}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={values[field]}
          onChange={(e) => set(field, e.target.value)}
          className="h-2 w-full cursor-pointer accent-brand-600"
        />
        <div className="mt-1 flex justify-between text-[11px] text-zinc-400 tabular-nums">
          <span>{field === "years" ? `${min} yr` : `${min}%`}</span>
          <span>{field === "years" ? `${max} yrs` : `${max}%`}</span>
        </div>
      </div>
    );
  };

  return (
    <section className="card p-5" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">
        EMI calculator
      </h2>
      <p className="mb-5 text-sm text-zinc-500">Estimate the monthly home-loan payment for this property.</p>

      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          {slider("downPaymentPct", "Down payment", `${values.downPaymentPct}% · ${formatPrice(result.downPayment)}`)}
          {slider("annualRatePct", "Interest rate (per year)", `${values.annualRatePct.toFixed(2)}%`)}
          {slider("years", "Loan tenure", `${values.years} ${values.years === 1 ? "year" : "years"}`)}
        </div>

        <div className="rounded-xl bg-brand-50 p-4">
          <p className="text-xs font-medium text-brand-800">Monthly EMI</p>
          <p className="mt-0.5 text-3xl font-semibold tracking-tight text-brand-900 tabular-nums" aria-live="polite">
            ₹{formatNumber(result.emi)}
          </p>

          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-gold-400" role="img" aria-label={`Interest is ${Math.round(interestShare)}% of the total paid`}>
            <div className="h-full bg-brand-600" style={{ width: `${100 - interestShare}%` }} />
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-zinc-600">
                <span className="size-2 rounded-full bg-brand-600" aria-hidden />
                Loan amount
              </dt>
              <dd className="font-semibold tabular-nums">{formatPrice(result.loan)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-zinc-600">
                <span className="size-2 rounded-full bg-gold-400" aria-hidden />
                Total interest
              </dt>
              <dd className="font-semibold tabular-nums">{formatPrice(result.totalInterest)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-brand-100 pt-2">
              <dt className="text-zinc-600">Total paid to the bank</dt>
              <dd className="font-semibold tabular-nums">{formatPrice(result.totalPayable)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        An estimate only. Banks set the actual rate, eligibility and charges, and the figure leaves out stamp duty, registration and processing fees.
      </p>
    </section>
  );
}
