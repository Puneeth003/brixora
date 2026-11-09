"use client";

import { useActionState, useState } from "react";
import { saveOrganization, sendTestEmail, updateStaffProfile } from "@/app/admin/settings-actions";
import type { ActionState } from "@/lib/types";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

export function ProfileForm({ name, workPhone, email }: { name: string; workPhone: string; email: string }) {
  const [state, action, pending] = useActionState(updateStaffProfile, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="st-name">
          Name
        </label>
        <input id="st-name" name="name" defaultValue={name} required minLength={2} maxLength={80} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="st-phone">
          Work phone
        </label>
        <input id="st-phone" name="work_phone" defaultValue={workPhone} maxLength={20} inputMode="tel" className="input" placeholder="Optional" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="st-email">
          Email
        </label>
        <input id="st-email" value={email} readOnly disabled className="input opacity-70" />
        <p className="mt-1 text-xs text-[var(--s-muted)]">Your sign-in email. Ask an admin to change it.</p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="btn-primary px-4 py-2 text-sm">
          {pending ? "Saving…" : "Save profile"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

function ColorField({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div>
      <label className="label" htmlFor={`st-${name}`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border border-[var(--s-border-strong)] bg-white p-1"
        />
        <input
          id={`st-${name}`}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          required
          className="input font-mono"
        />
      </div>
    </div>
  );
}

export function OrganizationForm({
  brandColor,
  sidebarColor,
  expiryDays,
  refPrefix,
  requireVerification,
}: {
  brandColor: string;
  sidebarColor: string;
  expiryDays: number;
  refPrefix: string;
  requireVerification: boolean;
}) {
  const [state, action, pending] = useActionState(saveOrganization, null);
  const [brand, setBrand] = useState(brandColor);
  const [sidebar, setSidebar] = useState(sidebarColor);
  const ok = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField name="brand_color" label="Brand colour" value={brand} onChange={setBrand} />
        <ColorField name="sidebar_color" label="Sidebar colour" value={sidebar} onChange={setSidebar} />
      </div>

      <div>
        <p className="label">Preview</p>
        <div className="w-full max-w-xs rounded-[22px] p-3" style={{ background: ok(sidebar, "#27292f") }}>
          <div className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-white" style={{ background: ok(brand, "#0e5e44") }}>
            <span className="size-2 rounded-full bg-white/90" />
            Dashboard
          </div>
          <div className="mt-1 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-white/75">
            <span className="size-2 rounded-full bg-white/40" />
            Listings
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="st-expiry">
            Listing expiry (days)
          </label>
          <input id="st-expiry" name="listing_expiry_days" type="number" min={1} max={365} defaultValue={expiryDays} required className="input" />
          <p className="mt-1 text-xs text-[var(--s-muted)]">Approved listings expire after this many days.</p>
        </div>
        <div>
          <label className="label" htmlFor="st-prefix">
            Reference prefix
          </label>
          <input
            id="st-prefix"
            name="ref_prefix"
            defaultValue={refPrefix}
            required
            pattern="[A-Za-z]{2,6}"
            minLength={2}
            maxLength={6}
            className="input font-mono uppercase"
          />
          <p className="mt-1 text-xs text-[var(--s-muted)]">2–6 letters, used for new reference numbers.</p>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-[var(--s-text-2)]">
        <input type="checkbox" name="require_site_verification" value="1" defaultChecked={requireVerification} className="mt-0.5" />
        <span>
          <span className="font-bold text-[var(--s-text)]">Require on-site verification before approving a listing</span>
          <span className="block text-xs text-[var(--s-muted)]">Listings can only be approved after a completed site visit.</span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary px-4 py-2 text-sm">
          {pending ? "Saving…" : "Save settings"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

/** One button: emails the signed-in admin so SMTP delivery can be checked. */
export function TestEmailForm({ to }: { to: string }) {
  const [state, action, pending] = useActionState(() => sendTestEmail(), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="btn-secondary px-4 py-2 text-sm">
        {pending ? "Sending…" : `Send test email to ${to}`}
      </button>
      <Status state={state} />
    </form>
  );
}
