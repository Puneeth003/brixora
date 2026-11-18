"use client";

import { useActionState, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { submitRequirement } from "@/app/(site)/requirements/actions";
import { BHK_OPTIONS, PROPERTY_TYPES, RENT_BUDGETS, SALE_BUDGETS } from "@/lib/constants";
import { MAX_REQUIREMENT_LOCALITIES } from "@/lib/requirement";

const chip =
  "flex cursor-pointer items-center justify-center rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm text-zinc-700 transition-colors has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:font-medium has-checked:text-brand-800 has-disabled:cursor-not-allowed has-disabled:opacity-50";

export function RequirementForm({ localities }: { localities: string[] }) {
  const [state, action, pending] = useActionState(submitRequirement, null);
  const [looking, setLooking] = useState<"sale" | "rent">("sale");
  const [chosen, setChosen] = useState<string[]>([]);
  const budgets = looking === "rent" ? RENT_BUDGETS : SALE_BUDGETS;

  if (state?.ok) {
    return (
      <div className="rounded-lg bg-brand-50 p-5 text-brand-800">
        <p className="font-semibold">Requirement sent</p>
        <p className="mt-1 text-sm">{state.message}</p>
      </div>
    );
  }

  const toggleLocality = (name: string, on: boolean) => setChosen((cur) => (on ? [...cur, name] : cur.filter((l) => l !== name)));
  const full = chosen.length >= MAX_REQUIREMENT_LOCALITIES;

  return (
    <form action={action} className="space-y-6">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <fieldset>
        <legend className="label">I want to</legend>
        <div className="grid max-w-xs grid-cols-2 gap-2">
          {(
            [
              ["sale", "Buy"],
              ["rent", "Rent"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`${chip} rounded-lg py-2`}>
              <input type="radio" name="looking" value={value} checked={looking === value} onChange={() => setLooking(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">
          Property type <span className="font-normal text-zinc-400">(any that suit)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map((t) => (
            <label key={t.value} className={chip}>
              <input type="checkbox" name="type" value={t.value} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      {localities.length > 0 && (
        <fieldset>
          <legend className="label">
            Preferred localities <span className="font-normal text-zinc-400">(up to {MAX_REQUIREMENT_LOCALITIES})</span>
          </legend>
          <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-lg border border-zinc-200 p-3">
            {localities.map((name) => {
              const on = chosen.includes(name);
              return (
                <label key={name} className={chip}>
                  <input
                    type="checkbox"
                    name="locality"
                    value={name}
                    checked={on}
                    disabled={!on && full}
                    onChange={(e) => toggleLocality(name, e.target.checked)}
                    className="sr-only"
                  />
                  {name}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rq-bhk">
            Bedrooms
          </label>
          <Dropdown
            id="rq-bhk"
            name="bhk"
            variant="field"
            label="Bedrooms"
            options={[{ value: "", label: "Any" }, ...BHK_OPTIONS.map((n) => ({ value: String(n), label: n === 5 ? "5+ BHK" : `${n} BHK` }))]}
          />
        </div>
        <div>
          <label className="label" htmlFor="rq-budget">
            Budget {looking === "rent" && <span className="font-normal text-zinc-400">(per month)</span>}
          </label>
          {/* Keyed so the choice resets when switching between buying and renting. */}
          <Dropdown
            id="rq-budget"
            name="budget"
            key={looking}
            variant="field"
            label="Budget"
            options={[{ value: "", label: "Any budget" }, ...budgets]}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="rq-notes">
          Anything else? <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea id="rq-notes" name="notes" rows={3} maxLength={1000} className="input" placeholder="For example: ground floor, near a school, ready to move by January." />
      </div>

      <div className="grid gap-4 border-t border-zinc-200 pt-6 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rq-name">
            Your name
          </label>
          <input id="rq-name" name="name" required minLength={2} maxLength={80} className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="rq-phone">
            Mobile number
          </label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-lg border border-r-0 border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-500">+91</span>
            <input id="rq-phone" name="phone" required inputMode="numeric" pattern="[0-9 ]{10,12}" maxLength={12} className="input rounded-l-none" autoComplete="tel-national" />
          </div>
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-primary px-6" disabled={pending}>
          {pending ? "Sending…" : "Send my requirement"}
        </button>
        <p className="text-xs text-zinc-500">Your details go only to our team. No spam calls from other brokers.</p>
      </div>
    </form>
  );
}
