"use client";

import { useActionState } from "react";
import { approveProperty, rejectProperty } from "@/app/admin/actions";

export function DecisionPanel({ id, canReject, needsVerification = false }: { id: string; canReject: boolean; needsVerification?: boolean }) {
  const [approveState, approve, approving] = useActionState(approveProperty, null);
  const [rejectState, reject, rejecting] = useActionState(rejectProperty, null);

  return (
    <div className="card space-y-6 p-6">
      <form action={approve} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Decision</h2>
          <p className="mt-0.5 text-xs text-[var(--s-muted)]">Tick each check to approve.</p>
        </div>
        <div className="space-y-2">
          {[
            ["check_address", "Address, house name and pin removed from public text"],
            ["check_contact", "Phone numbers, emails and links removed"],
            ["check_photos", "Photos checked for name boards, number plates and phone numbers"],
          ].map(([name, label]) => (
            <label
              key={name}
              className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-[var(--s-border)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--s-hover)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--s-brand-soft)]"
            >
              <input type="checkbox" name={name} required className="mt-0.5 size-4 shrink-0 accent-brand-600" />
              {label}
            </label>
          ))}
        </div>
        {approveState && (
          <p className={`text-sm font-medium ${approveState.ok ? "text-brand-700" : "text-[var(--s-late)]"}`}>
            {approveState.ok ? approveState.message : approveState.error}
          </p>
        )}
        {needsVerification && (
          <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900">
            Verify on site first. Schedule a visit in On-site verification above.
          </p>
        )}
        <button className="btn-primary w-full py-3 text-base" disabled={approving}>
          {approving ? "Approving…" : "Approve & publish"}
        </button>
        <p className="text-xs text-[var(--s-muted)]">Save any edits first. Approval notifies the owner on WhatsApp.</p>
      </form>

      {canReject && (
        <form action={reject} className="space-y-3 border-t border-[var(--s-border)] pt-5">
          <input type="hidden" name="id" value={id} />
          <h3 className="text-xs font-bold tracking-wider text-[var(--s-muted)] uppercase">Reject</h3>
          <textarea
            name="reason"
            required
            minLength={5}
            rows={3}
            className="input"
            placeholder="Reason sent to the owner, e.g. photos are unclear, please resubmit."
          />
          {rejectState && (
            <p className={`text-sm font-medium ${rejectState.ok ? "text-brand-700" : "text-[var(--s-late)]"}`}>
              {rejectState.ok ? rejectState.message : rejectState.error}
            </p>
          )}
          <button className="btn-danger w-full" disabled={rejecting}>
            {rejecting ? "Rejecting…" : "Reject"}
          </button>
        </form>
      )}
    </div>
  );
}
