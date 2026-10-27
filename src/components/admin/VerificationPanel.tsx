"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cancelVerification, scheduleVerification } from "@/app/admin/verification-actions";
import { istInputValue } from "@/lib/time";

type OpenVisit = { id: string; scheduled_at: string | null; assigned_to: string | null; assignee_name: string | null };
type PastVisit = {
  id: string;
  status: "scheduled" | "completed" | "cancelled";
  result: "verified" | "issues" | null;
  visited_at: string | null;
  assignee_name: string | null;
  notes: string | null;
};
type StaffOption = { id: string; name: string | null; email: string | null };

// Fixed time zone so the server render and the browser agree.
const fmt = (iso: string | null, withTime = true) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: withTime ? undefined : "numeric",
        ...(withTime ? { weekday: "short", hour: "numeric", minute: "2-digit" } : {}),
      })
    : "—";

function ResultBadge({ v }: { v: PastVisit }) {
  if (v.status === "cancelled") return <span className="badge bg-[var(--s-seg)] text-[var(--s-text-2)]">Cancelled</span>;
  if (v.result === "verified") return <span className="badge bg-emerald-100 text-emerald-800">Verified</span>;
  if (v.result === "issues") return <span className="badge bg-red-100 text-red-800">Issues</span>;
  return <span className="badge bg-[var(--s-seg)] text-[var(--s-text-2)]">{v.status}</span>;
}

export function VerificationPanel({
  propertyId,
  verifiedAt,
  verifiedByName,
  openVisit,
  history,
  staff,
  required,
  defaultWhen,
}: {
  propertyId: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
  openVisit: OpenVisit | null;
  history: PastVisit[];
  staff: StaffOption[];
  required: boolean;
  defaultWhen: string;
}) {
  const [state, schedule, scheduling] = useActionState(scheduleVerification, null);

  const fields = (when: string, who: string) => (
    <>
      <input type="hidden" name="property_id" value={propertyId} />
      <div>
        <label className="label" htmlFor="visit_when">
          When
        </label>
        <input id="visit_when" name="scheduled_at" type="datetime-local" required defaultValue={when} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="visit_who">
          Who visits
        </label>
        <select id="visit_who" name="assigned_to" required defaultValue={who} className="input">
          <option value="" disabled>
            Choose staff…
          </option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name ?? s.email ?? "Staff"}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  const message = state && (
    <p className={`text-sm font-medium ${state.ok ? "text-brand-700" : "text-[var(--s-late)]"}`}>{state.ok ? state.message : state.error}</p>
  );

  return (
    <section className="card space-y-5 p-6 text-sm">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">On-site verification</h2>
        {verifiedAt ? (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 font-semibold text-emerald-800">
            <span aria-hidden>✓</span>
            <span>
              Verified on site · {fmt(verifiedAt, false)}
              {verifiedByName && ` · by ${verifiedByName}`}
            </span>
          </p>
        ) : (
          <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2.5 font-semibold text-amber-900">
            Not verified yet
            {required && <span className="mt-0.5 block text-xs font-medium text-amber-800">Required before approval</span>}
          </p>
        )}
      </div>

      {openVisit ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--s-border)] p-4">
            <p className="text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">Visit scheduled</p>
            <p className="mt-1 font-bold">{fmt(openVisit.scheduled_at)}</p>
            <p className="text-[var(--s-text-2)]">{openVisit.assignee_name ?? "Unassigned"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/admin/verifications/${openVisit.id}`} className="btn-primary">
                Open visit →
              </Link>
              <form action={cancelVerification.bind(null, openVisit.id)}>
                <button className="btn-secondary">Cancel visit</button>
              </form>
            </div>
          </div>
          <details className="group">
            <summary className="cursor-pointer text-xs font-bold text-[var(--s-muted)] hover:text-[var(--brand)]">Reschedule or reassign</summary>
            <form action={schedule} className="mt-3 space-y-3">
              {fields(istInputValue(openVisit.scheduled_at) || defaultWhen, openVisit.assigned_to ?? "")}
              {message}
              <button className="btn-secondary w-full" disabled={scheduling}>
                {scheduling ? "Saving…" : "Save changes"}
              </button>
            </form>
          </details>
        </div>
      ) : (
        <form action={schedule} className="space-y-3">
          {fields(defaultWhen, "")}
          {message}
          <button className="btn-primary w-full" disabled={scheduling}>
            {scheduling ? "Scheduling…" : "Schedule visit"}
          </button>
          <p className="text-xs text-[var(--s-muted)]">The owner is told the visit time on WhatsApp.</p>
        </form>
      )}

      {history.length > 0 && (
        <div className="border-t border-[var(--s-border)] pt-4">
          <h3 className="mb-2 text-xs font-bold tracking-wider text-[var(--s-muted)] uppercase">Past visits</h3>
          <ul className="space-y-1">
            {history.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/verifications/${v.id}`} className="block rounded-xl px-3 py-2 hover:bg-[var(--s-hover)]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{v.assignee_name ?? "—"}</span>
                    <ResultBadge v={v} />
                  </span>
                  <span className="block text-xs text-[var(--s-muted)]">{v.visited_at ? fmt(v.visited_at) : "Not visited"}</span>
                  {v.notes && <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--s-text-2)]">{v.notes}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
