import type { Metadata } from "next";
import Link from "next/link";
import { adminMfaRequired, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { site } from "@/lib/site";
import { PageHeader } from "@/components/admin/ui";
import { ChangePasswordForm } from "@/components/crm/forms";
import { signOutAllStaff } from "@/app/admin/settings-actions";
import { OrganizationForm, ProfileForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { key: "profile", label: "Profile", hint: "Your name, phone and password", adminOnly: false },
  { key: "organization", label: "Organization", hint: "Colours, listings and verification", adminOnly: true },
  { key: "users", label: "Users & roles", hint: "Staff accounts and workload", adminOnly: true },
  { key: "security", label: "Security", hint: "Sign-in and integrations", adminOnly: true },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const sp = await searchParams;
  const visible = SECTIONS.filter((s) => isAdmin || !s.adminOnly);
  const requested = typeof sp.section === "string" ? sp.section : "profile";
  const active: SectionKey = visible.find((s) => s.key === requested)?.key ?? "profile";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description={isAdmin ? "Your profile and how the workspace is set up." : "Your profile and password."} />
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <nav aria-label="Settings sections" className="md:w-60 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {visible.map((s) => {
              const on = s.key === active;
              return (
                <li key={s.key} className="shrink-0">
                  <Link
                    href={`/admin/settings?section=${s.key}`}
                    aria-current={on ? "page" : undefined}
                    className={`block rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                      on ? "bg-white text-[var(--s-text)] shadow-[0_1px_3px_rgba(10,16,12,0.1)]" : "text-[var(--s-muted)] hover:bg-[var(--s-hover)] hover:text-[var(--s-text)]"
                    }`}
                  >
                    {s.label}
                    <span className="hidden text-xs font-medium text-[var(--s-muted)] md:block">{s.hint}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 space-y-6">
          {active === "profile" && <ProfileSection userId={staff.userId} email={staff.email} />}
          {active === "organization" && <OrganizationSection />}
          {active === "users" && <UsersSection />}
          {active === "security" && <SecuritySection />}
        </div>
      </div>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6 sm:p-7">
      <h2 className="text-lg font-extrabold tracking-tight text-[var(--s-text)]">{title}</h2>
      {description && <p className="mt-1 text-sm text-[var(--s-muted)]">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatusRow({ label, on, detail }: { label: string; on: boolean; detail?: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--s-text)]">{label}</p>
        {detail && <p className="text-xs text-[var(--s-muted)]">{detail}</p>}
      </div>
      <span
        className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ${
          on ? "bg-[var(--s-brand-soft)] text-[var(--brand)]" : "bg-[var(--s-seg)] text-[var(--s-text-2)]"
        }`}
      >
        {on ? "On" : "Off"}
      </span>
    </li>
  );
}

async function ProfileSection({ userId, email }: { userId: string; email: string }) {
  const user = await db.one<{ name: string | null; work_phone: string | null; totp_enabled: boolean }>(
    "SELECT name, work_phone, totp_enabled FROM users WHERE id = ?",
    [userId],
  );
  return (
    <>
      <Card title="Profile" description="How you appear to the team and to clients.">
        <ProfileForm name={user?.name ?? ""} workPhone={user?.work_phone ?? ""} email={email} />
      </Card>
      <Card title="Password" description="Change the password you sign in with.">
        <ChangePasswordForm />
      </Card>
      <Card title="Two-factor authentication">
        <ul className="divide-y divide-[var(--s-border)]">
          <StatusRow label="Required for staff" on={adminMfaRequired} detail="Controlled by the ADMIN_2FA environment variable." />
          <StatusRow label="Authenticator set up on your account" on={Boolean(user?.totp_enabled)} />
        </ul>
      </Card>
    </>
  );
}

async function OrganizationSection() {
  const rows = await db.all<{ name: string; value: string }>(
    "SELECT name, value FROM app_config WHERE name IN ('brand_color', 'sidebar_color', 'listing_expiry_days', 'ref_prefix', 'require_site_verification')",
  );
  const get = (name: string) => rows.find((r) => r.name === name)?.value;
  const hex = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
  const expiry = Number(get("listing_expiry_days"));
  const details = [
    { label: "Site name", value: site.name },
    { label: "Phone", value: site.brokerage.phone },
    { label: "WhatsApp", value: site.brokerage.whatsapp },
    { label: "Email", value: site.brokerage.email },
  ];
  return (
    <>
      <Card title="Organization" description="Workspace colours and listing defaults.">
        <OrganizationForm
          brandColor={hex(get("brand_color"), "#0e5e44")}
          sidebarColor={hex(get("sidebar_color"), "#27292f")}
          expiryDays={Number.isInteger(expiry) && expiry >= 1 && expiry <= 365 ? expiry : 90}
          refPrefix={get("ref_prefix") ?? "BRX"}
          requireVerification={(get("require_site_verification") ?? "1") === "1"}
        />
      </Card>
      <Card title="Website details" description="Set through environment variables (NEXT_PUBLIC_BRAND_NAME, NEXT_PUBLIC_BROKERAGE_*). Changing them needs a redeploy.">
        <dl className="grid gap-4 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="label">{d.label}</dt>
              <dd className="text-sm font-semibold text-[var(--s-text)]">{d.value || <span className="text-[var(--s-muted)]">Not set</span>}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

function UsersSection() {
  return (
    <Card title="Users & roles" description="Admins can see and change everything. Agents work in the CRM with their own clients.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/users" className="rounded-2xl border border-[var(--s-border)] p-4 transition-colors hover:bg-[var(--s-hover)]">
          <p className="text-sm font-bold text-[var(--s-text)]">Users</p>
          <p className="mt-1 text-xs text-[var(--s-muted)]">Invite staff, change roles and deactivate accounts.</p>
        </Link>
        <Link href="/admin/workload" className="rounded-2xl border border-[var(--s-border)] p-4 transition-colors hover:bg-[var(--s-hover)]">
          <p className="text-sm font-bold text-[var(--s-text)]">Workload</p>
          <p className="mt-1 text-xs text-[var(--s-muted)]">See how clients and follow-ups are spread across agents.</p>
        </Link>
      </div>
    </Card>
  );
}

async function SecuritySection() {
  const sessions = await db.count("SELECT COUNT(*) FROM sessions WHERE kind = 'admin' AND expires_at > UTC_TIMESTAMP(3)");
  return (
    <>
      <Card title="Security" description="Read-only. These are configured through environment variables.">
        <ul className="divide-y divide-[var(--s-border)]">
          <StatusRow label="Two-factor authentication" on={adminMfaRequired} detail="ADMIN_2FA" />
          <StatusRow label="Email" on={mailConfigured} detail="SMTP_HOST" />
          <StatusRow label="WhatsApp" on={Boolean(process.env.WHATSAPP_TOKEN)} detail="WHATSAPP_TOKEN" />
          <StatusRow label="Turnstile (bot protection)" on={Boolean(process.env.TURNSTILE_SECRET_KEY)} detail="TURNSTILE_SECRET_KEY" />
        </ul>
      </Card>
      <Card title="Staff sessions" description={`${sessions} active staff ${sessions === 1 ? "session" : "sessions"}.`}>
        <form action={signOutAllStaff} className="space-y-4">
          <label className="flex items-start gap-2 text-sm text-[var(--s-text-2)]">
            <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
            I understand this signs out every admin and agent, including me.
          </label>
          <button className="btn-secondary px-4 py-2 text-sm text-[var(--s-late)]">Sign out all staff</button>
        </form>
      </Card>
    </>
  );
}
