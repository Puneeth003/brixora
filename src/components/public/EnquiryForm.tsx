"use client";

import { useActionState, useState } from "react";
import { submitEnquiry } from "@/app/(site)/properties/[ref]/actions";
import { VISIT_SLOTS } from "@/lib/visit-request";

/** `visitDates`: the first and last day a visit can be asked for, worked out on the server. */
export function EnquiryForm({ refNo, visitDates }: { refNo: string; visitDates: { min: string; max: string } }) {
  const [state, action, pending] = useActionState(submitEnquiry, null);
  const [wantVisit, setWantVisit] = useState(false);

  if (state?.ok) {
    return (
      <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
        <p className="font-medium">Enquiry sent</p>
        <p className="mt-1">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ref" value={refNo} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div>
        <label className="label" htmlFor="eq-name">
          Your name
        </label>
        <input id="eq-name" name="name" required minLength={2} maxLength={80} className="input" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="eq-phone">
          Mobile number
        </label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-lg border border-r-0 border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-500">
            +91
          </span>
          <input
            id="eq-phone"
            name="phone"
            required
            inputMode="numeric"
            pattern="[0-9 ]{10,12}"
            maxLength={12}
            className="input rounded-l-none"
            autoComplete="tel-national"
          />
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-zinc-800">
          <input type="checkbox" checked={wantVisit} onChange={(e) => setWantVisit(e.target.checked)} className="size-4 accent-brand-600" />
          I&apos;d like to visit this property
        </label>
        {wantVisit && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="eq-visit-date">
                Preferred date
              </label>
              <input id="eq-visit-date" name="visit_date" type="date" required min={visitDates.min} max={visitDates.max} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="eq-visit-time">
                Time
              </label>
              <select id="eq-visit-time" name="visit_time" required defaultValue="" className="input">
                <option value="" disabled>
                  Choose
                </option>
                {VISIT_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="col-span-2 text-xs text-zinc-500">This is a request. Our team will call to confirm the time.</p>
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="eq-message">
          Message <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="eq-message"
          name="message"
          rows={3}
          maxLength={1000}
          className="input"
          placeholder="I'm interested in this property. Please call me."
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : wantVisit ? "Request a visit" : "Request a call back"}
      </button>
      <p className="text-xs text-zinc-500">Your details go only to our team, never to the owner.</p>
    </form>
  );
}
