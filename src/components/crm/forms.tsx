"use client";

import { PasswordInput } from "@/components/admin/PasswordInput";
import { useActionState, useState } from "react";
import { addClientActivity, changeClientStatus, changeOwnPassword, replyToEnquiry, saveAgent, saveClient } from "@/app/admin/crm-actions";
import { ACTIVITY_TYPES, AGENT_TYPES, CLIENT_SOURCES, CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/crm-constants";
import { PROPERTY_TYPES } from "@/lib/constants";
import type { ActionState, Agent, Client } from "@/lib/types";

export type StaffOption = { id: string; name: string | null; email: string | null; role: string; agent_type: string | null };

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>{state.ok ? state.message : state.error}</p>;
}

const staffLabel = (s: StaffOption) => `${s.name ?? s.email ?? "—"}${s.role === "admin" ? " (admin)" : s.agent_type === "broker" ? " (broker)" : ""}`;

// ---------------------------------------------------------------------------
// Client details
// ---------------------------------------------------------------------------

export function ClientForm({
  client,
  staff,
  isAdmin,
  followUpValue,
}: {
  client?: Client;
  staff: StaffOption[];
  isAdmin: boolean;
  followUpValue?: string;
}) {
  const [state, action, pending] = useActionState(saveClient, null);
  const brokers = staff.filter((s) => s.agent_type === "broker");
  const assignable = staff.filter((s) => s.agent_type !== "broker");
  return (
    <form action={action} className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
      {client && <input type="hidden" name="id" value={client.id} />}
      <Caption first>Contact</Caption>
      <Field label="Name">
        <input name="name" defaultValue={client?.name} required className="input" />
      </Field>
      <Field label="Mobile">
        <input name="phone" defaultValue={client?.phone ? client.phone.replace(/^91/, "") : ""} required inputMode="tel" className="input" placeholder="98765 43210" />
      </Field>
      <Field label="Alternate phone">
        <input name="alt_phone" defaultValue={client?.alt_phone ?? ""} className="input" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={client?.email ?? ""} className="input" />
      </Field>
      <Field label="Client type">
        <select name="type" defaultValue={client?.type ?? "buyer"} className="input">
          {CLIENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Source">
        <select name="source" defaultValue={client?.source ?? "phone"} className="input">
          {CLIENT_SOURCES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Caption>Requirement</Caption>
      <Field label="Looking to">
        <select name="listing_type" defaultValue={client?.listing_type ?? ""} className="input">
          <option value="">—</option>
          <option value="sale">Buy / sell</option>
          <option value="rent">Rent</option>
        </select>
      </Field>
      <Field label="Bedrooms (min)">
        <input name="bedrooms" type="number" min={0} max={20} defaultValue={client?.bedrooms ?? ""} className="input" />
      </Field>
      <Field label="Budget from (₹)">
        <input name="budget_min" inputMode="numeric" defaultValue={client?.budget_min ?? ""} className="input" placeholder="e.g. 5000000" />
      </Field>
      <Field label="Budget up to (₹)">
        <input name="budget_max" inputMode="numeric" defaultValue={client?.budget_max ?? ""} className="input" placeholder="e.g. 8000000" />
      </Field>
      <Field label="Preferred localities" className="sm:col-span-2">
        <input name="localities" defaultValue={client?.localities ?? ""} className="input" placeholder="Kadri, Bejai, Kodialbail" />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="label">Property types</legend>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map((t) => (
            <label
              key={t.value}
              className="cursor-pointer rounded-full border border-[var(--s-border-strong)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--s-text-2)] transition hover:bg-[var(--s-hover)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--s-brand-soft)] has-[:checked]:text-[var(--brand)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)]"
            >
              <input type="checkbox" name="property_types" value={t.value} defaultChecked={client?.property_types?.includes(t.value)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Caption>Assignment</Caption>
      {isAdmin && (
        <Field label="Assigned agent">
          <select name="assigned_to" defaultValue={client?.assigned_to ?? ""} className="input">
            <option value="">Unassigned</option>
            {assignable.map((s) => (
              <option key={s.id} value={s.id}>
                {staffLabel(s)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Referred by broker">
        <select name="broker_id" defaultValue={client?.broker_id ?? ""} className="input">
          <option value="">None</option>
          {brokers.map((s) => (
            <option key={s.id} value={s.id}>
              {staffLabel(s)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Next follow-up">
        <input name="next_follow_up" type="datetime-local" defaultValue={followUpValue ?? ""} className="input" />
      </Field>
      <Caption>Notes</Caption>
      <Field label="Notes" className="sm:col-span-2">
        <textarea name="notes" rows={3} defaultValue={client?.notes ?? ""} className="input" />
      </Field>
      <div className="flex items-center gap-3 border-t border-[var(--s-border)] pt-4 sm:col-span-2">
        <button className="btn-primary px-5" disabled={pending}>
          {pending ? "Saving…" : client ? "Save client" : "Add client"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

function Caption({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <p className={`text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--s-muted)] sm:col-span-2 ${first ? "" : "mt-2 border-t border-[var(--s-border)] pt-4"}`}>
      {children}
    </p>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Pipeline status
// ---------------------------------------------------------------------------

export function StatusForm({ client }: { client: Pick<Client, "id" | "status" | "lost_reason"> }) {
  const [state, action, pending] = useActionState(changeClientStatus, null);
  const [status, setStatus] = useState(client.status);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={client.id} />
      <div className="flex flex-wrap gap-1 rounded-2xl bg-[var(--s-seg)] p-1">
        {CLIENT_STATUSES.map((s) => (
          <label
            key={s.value}
            className={`flex-1 cursor-pointer whitespace-nowrap rounded-xl px-3 py-2 text-center text-sm font-bold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)] ${
              status === s.value ? `${s.color} shadow-[var(--s-field-shadow)]` : "text-[var(--s-muted)] hover:bg-white/70 hover:text-[var(--s-text)]"
            }`}
          >
            <input type="radio" name="status" value={s.value} checked={status === s.value} onChange={() => setStatus(s.value)} className="sr-only" />
            {s.label}
          </label>
        ))}
      </div>
      {status === "lost" && <input name="lost_reason" defaultValue={client.lost_reason ?? ""} placeholder="Why was this client lost?" className="input" required />}
      {status !== client.status && (
        <div className="flex items-center gap-3">
          <button className="btn-primary px-4 py-2 text-sm" disabled={pending}>
            {pending ? "Saving…" : "Update status"}
          </button>
          <button type="button" className="text-sm font-bold text-[var(--s-muted)] hover:text-[var(--s-text)]" onClick={() => setStatus(client.status)}>
            Cancel
          </button>
        </div>
      )}
      <Status state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export function ActivityForm({ clientId, properties }: { clientId: string; properties: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await addClientActivity(prev, fd);
    if (res?.ok) (document.getElementById(`activity-${clientId}`) as HTMLFormElement | null)?.reset();
    return res;
  }, null);
  return (
    <form id={`activity-${clientId}`} action={action} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="flex flex-wrap gap-2.5">
        <select name="type" defaultValue="call" className="input w-auto font-semibold">
          {ACTIVITY_TYPES.filter((t) => t.loggable).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {properties.length > 0 && (
          <select name="property_id" defaultValue="" className="input w-auto min-w-0 flex-1">
            <option value="">About a listing (optional)</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <textarea name="body" rows={2} required placeholder="What happened? e.g. Called, wants a site visit on Saturday." className="input" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Next follow-up</span>
          <input name="next_follow_up" type="datetime-local" className="input w-auto" />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 pb-3 text-xs font-semibold text-[var(--s-muted)]">
          <input type="checkbox" name="clear_follow_up" /> Clear follow-up
        </label>
        <button className="btn-primary ml-auto px-5" disabled={pending}>
          {pending ? "Saving…" : "Log activity"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Enquiry reply (staff → member)
// ---------------------------------------------------------------------------

export function ReplyForm({ enquiryId }: { enquiryId: string }) {
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await replyToEnquiry(prev, fd);
    if (res?.ok) (document.getElementById(`reply-${enquiryId}`) as HTMLFormElement | null)?.reset();
    return res;
  }, null);
  return (
    <form id={`reply-${enquiryId}`} action={action} className="space-y-2">
      <input type="hidden" name="enquiry_id" value={enquiryId} />
      <textarea name="body" rows={2} required maxLength={2000} placeholder="Reply to this enquiry. The client sees it in their account." className="input" />
      <div className="flex items-center justify-end gap-3">
        <Status state={state} />
        <button className="btn-primary px-4 py-2 text-sm" disabled={pending}>
          {pending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Agents & brokers
// ---------------------------------------------------------------------------

export function AgentForm({ agent, mailReady }: { agent?: Agent; mailReady: boolean }) {
  const [state, action, pending] = useActionState(saveAgent, null);
  const [role, setRole] = useState<"agent" | "admin">(agent?.role ?? "agent");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {agent && <input type="hidden" name="id" value={agent.id} />}
      <Field label="Name">
        <input name="name" defaultValue={agent?.name ?? ""} required className="input" />
      </Field>
      <Field label="Email (sign-in)">
        <input name="email" type="email" defaultValue={agent?.email ?? ""} className="input" placeholder="Leave empty for a record without login" />
      </Field>
      <Field label="Access">
        <select name="role" value={role} onChange={(e) => setRole(e.target.value as "agent" | "admin")} className="input">
          <option value="agent">Agent – own clients only</option>
          <option value="admin">Admin – everything</option>
        </select>
      </Field>
      {role === "agent" && (
        <Field label="Type">
          <select name="agent_type" defaultValue={agent?.agent_type ?? "agent"} className="input">
            {AGENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Phone">
        <input name="work_phone" defaultValue={agent?.work_phone ?? ""} className="input" />
      </Field>
      <Field label="Company / agency">
        <input name="company" defaultValue={agent?.company ?? ""} className="input" />
      </Field>
      <Field label="RERA agent no.">
        <input name="rera_no" defaultValue={agent?.rera_no ?? ""} className="input" />
      </Field>
      <Field label="Commission %">
        <input name="commission_pct" type="number" step="0.01" min={0} max={100} defaultValue={agent?.commission_pct ?? ""} className="input" />
      </Field>
      <Field label={agent ? "Set a new password (optional)" : "Initial password (optional)"}>
        <PasswordInput name="password" autoComplete="new-password" minLength={12} placeholder="12+ characters" />
      </Field>
      <Field label="Notes">
        <input name="notes" defaultValue={agent?.notes ?? ""} className="input" />
      </Field>
      {!agent && (
        <label className="flex items-center gap-2 text-sm text-zinc-600 sm:col-span-2">
          <input type="checkbox" name="send_welcome" defaultChecked />
          Send them an invite by email and WhatsApp (a link to set their password)
          {!mailReady && <span className="text-xs font-semibold text-amber-700">(email isn&apos;t set up on this server yet, so this will fail until SMTP is added)</span>}
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : agent ? "Save" : "Add"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Own password
// ---------------------------------------------------------------------------

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, null);
  return (
    <form action={action} className="max-w-sm space-y-3">
      <Field label="Current password">
        <PasswordInput name="current" autoComplete="current-password" required />
      </Field>
      <Field label="New password">
        <PasswordInput name="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label="Confirm new password">
        <PasswordInput name="confirm" autoComplete="new-password" required />
      </Field>
      <p className="text-xs text-zinc-500">At least 12 characters. Changing it signs you out everywhere, including here.</p>
      <button className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
      <Status state={state} />
    </form>
  );
}
