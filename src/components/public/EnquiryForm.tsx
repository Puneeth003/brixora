"use client";

import { useActionState } from "react";
import { submitEnquiry } from "@/app/(site)/properties/[ref]/actions";

export function EnquiryForm({ refNo }: { refNo: string }) {
  const [state, action, pending] = useActionState(submitEnquiry, null);

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
        {pending ? "Sending…" : "Request a call back"}
      </button>
      <p className="text-xs text-zinc-500">Your details go only to our team, never to the owner.</p>
    </form>
  );
}
