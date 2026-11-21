import type { Metadata } from "next";
import Link from "next/link";
import { adminMfaRequired, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { envOverview, envs } from "@/lib/env";
import { mailConfigured, mailSummary } from "@/lib/mail";
import { site } from "@/lib/site";
import { PageHeader } from "@/components/admin/ui";
import { ChangePasswordForm } from "@/components/crm/forms";
import { signOutAllStaff } from "@/app/admin/settings-actions";
import { brokeragePhone, graphVersion, metaTemplates, normalizePhone, phoneProfile, templateSettings, TEMPLATES, whatsappConnection, whatsappEnvProblems } from "@/lib/whatsapp";
import { formatDateTime } from "@/lib/format";
import { OrganizationForm, ProfileForm, SiteDetailsForm, TestEmailForm } from "./SettingsForms";
import { SITE_FIELDS, savedSiteDetails } from "@/lib/site-settings";
import { EnvVariables } from "./EnvVariables";
import { WhatsAppConnect } from "./WhatsAppConnect";
import { CopyText, WhatsAppHealth } from "./WhatsAppHealth";
import { WhatsAppTemplates } from "./WhatsAppTemplates";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { key: "profile", label: "Profile", hint: "Your name, phone and password", adminOnly: false },
  { key: "organization", label: "Organization", hint: "Colours, listings and verification", adminOnly: true },
  { key: "users", label: "Users & roles", hint: "Staff accounts and workload", adminOnly: true },
  { key: "whatsapp", label: "WhatsApp", hint: "Cloud API number and health check", adminOnly: true },
  { key: "templates", label: "WhatsApp templates", hint: "Names, language, test sends", adminOnly: true },
  { key: "env", label: "Environment variables", hint: "WhatsApp and email keys", adminOnly: true },
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
          {active === "whatsapp" && <WhatsAppSection />}
          {active === "templates" && <TemplatesSection />}
          {active === "env" && <EnvSection />}
          {active === "security" && <SecuritySection email={staff.email} />}
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
          <StatusRow label="Required for staff" on={await adminMfaRequired()} detail="ADMIN_2FA in Settings → Environment variables." />
          <StatusRow label="Authenticator set up on your account" on={Boolean(user?.totp_enabled)} />
        </ul>
      </Card>
    </>
  );
}

async function OrganizationSection() {
  const rows = await db.all<{ name: string; value: string }>(
    "SELECT name, value FROM app_config WHERE name IN ('brand_color', 'sidebar_color', 'listing_expiry_days', 'ref_prefix')",
  );
  const get = (name: string) => rows.find((r) => r.name === name)?.value;
  const hex = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
  const expiry = Number(get("listing_expiry_days"));
  const saved = await savedSiteDetails();
  const fallback: Record<string, string> = {
    name: site.name,
    defaultCity: site.defaultCity,
    ...site.brokerage,
  };
  const wa = await envs("BROKERAGE_ENQUIRY_WHATSAPP", "WHATSAPP_PHONE_NUMBER_ID");
  // Hosting-panel placeholders such as "<LATER: …>" show as empty.
  const real = (v: string | undefined) => (v && !/[<>]|\bLATER\b/.test(v) ? v.trim() : "");
  const conn = await whatsappConnection();
  // Before the first save the form shows what the website currently uses.
  const fields = SITE_FIELDS.map((f) => ({ key: f.key, label: f.label, hint: f.hint, required: f.required, value: saved[f.key] ?? fallback[f.key] ?? "" }));
  return (
    <>
      <Card title="Organization" description="Workspace colours and listing defaults.">
        <OrganizationForm
          brandColor={hex(get("brand_color"), "#0e5e44")}
          sidebarColor={hex(get("sidebar_color"), "#27292f")}
          expiryDays={Number.isInteger(expiry) && expiry >= 1 && expiry <= 365 ? expiry : 90}
          refPrefix={get("ref_prefix") ?? "BRX"}
        />
      </Card>
      <Card title="Website details" description="Brand name and the contact details shown across the public site, emails and legal pages. Saving updates every page straight away, with no redeploy. A contact field left empty isn't shown anywhere on the website.">
        <SiteDetailsForm
          fields={fields}
          whatsapp={{
            enquiryTo: real(wa.BROKERAGE_ENQUIRY_WHATSAPP),
            phoneNumberId: real(wa.WHATSAPP_PHONE_NUMBER_ID),
            connected: conn?.source === "connected" ? (conn.displayPhone ?? "the connected number") : null,
          }}
        />
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

async function WhatsAppSection() {
  const conn = await whatsappConnection();
  const configured = (value: string | undefined) => Boolean(value?.trim() && !/[<>]|placeholder|\bLATER\b/i.test(value));
  const e = await envs("META_APP_ID", "WHATSAPP_ES_CONFIG_ID", "WHATSAPP_APP_SECRET");
  const appId = configured(e.META_APP_ID) ? e.META_APP_ID!.trim() : "";
  const configId = configured(e.WHATSAPP_ES_CONFIG_ID) ? e.WHATSAPP_ES_CONFIG_ID!.trim() : "";
  const appSecretReady = configured(e.WHATSAPP_APP_SECRET);
  const signupReady = Boolean(appId && configId && appSecretReady);
  const showCoexistence = conn?.source === "connected" || signupReady;
  const envProblems = await whatsappEnvProblems();
  const forwardTo = await brokeragePhone();
  const profile = conn ? await phoneProfile(conn) : null;
  const selfForward = Boolean(profile?.displayPhone && forwardTo && normalizePhone(profile.displayPhone) === forwardTo);
  const webhookUrl = `${site.url}/api/whatsapp/webhook`;
  const rows = conn
    ? [
        { label: "Number", value: profile?.displayPhone || "—" },
        { label: "Business name", value: profile?.verifiedName || "—" },
        { label: "Phone number ID", value: conn.phoneNumberId },
        { label: "WhatsApp Business Account ID", value: conn.wabaId || "—" },
        { label: "Source", value: conn.source === "env" ? "Environment variables (WHATSAPP_TOKEN)" : conn.connectedAt ? `Linked app number, ${formatDateTime(conn.connectedAt)}` : "Linked app number" },
      ]
    : [];
  const links = [
    { href: "/admin/templates", label: "Templates", hint: "Create and check message templates" },
    { href: "/admin/broadcasts", label: "Broadcasts", hint: "Send campaigns to clients and lists" },
    { href: "/admin/messages", label: "Message log", hint: "Every message and its delivery status" },
  ];
  return (
    <>
      <Card
        title="WhatsApp Cloud API"
        description="Website messages (login codes, welcome, listing updates, enquiry replies, broadcasts) go out from this number."
      >
        {conn ? (
          <>
            <dl className="mb-5 grid gap-4 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.label}>
                  <dt className="label">{r.label}</dt>
                  <dd className="break-all text-sm font-semibold text-[var(--s-text)]">{r.value}</dd>
                </div>
              ))}
            </dl>
            <WhatsAppHealth />
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-[var(--s-muted)]">Not set up yet. Messages are logged but not sent.</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--s-text-2)]">
              <li>
                In Meta Business Suite, add a phone number to your WhatsApp Business Account and create a System User with a permanent token
                (whatsapp_business_messaging and whatsapp_business_management).
              </li>
              <li>
                In <Link href="/admin/settings?section=env" className="font-semibold underline">Environment variables</Link>, set <code>WHATSAPP_TOKEN</code>,{" "}
                <code>WHATSAPP_WABA_ID</code>, <code>WHATSAPP_APP_SECRET</code>, <code>WHATSAPP_VERIFY_TOKEN</code> and <code>META_APP_ID</code>.
              </li>
              <li>
                In <Link href="/admin/settings?section=organization" className="font-semibold underline">Website details</Link>, enter the WhatsApp Phone number ID.
              </li>
            </ol>
            {envProblems.length > 0 && (
              <p className="mt-4 rounded-xl bg-[var(--s-seg)] p-3 text-sm text-[var(--s-late)]">
                {envProblems.join(" and ")} {envProblems.length > 1 ? "are" : "is"} set on the server but still{" "}
                {envProblems.length > 1 ? "hold placeholder text" : "holds placeholder text"}, not a real value.
              </p>
            )}
          </>
        )}
        {selfForward && (
          <p className="mt-4 rounded-xl bg-[var(--s-seg)] p-3 text-sm text-[var(--s-late)]">
            Enquiry forwards go to {forwardTo}, which is this connected number. WhatsApp can&apos;t message itself: set BROKERAGE_ENQUIRY_WHATSAPP to
            another number (for example the manager&apos;s personal WhatsApp).
          </p>
        )}
      </Card>
      <Card title="Quick links">
        <div className="grid gap-3 sm:grid-cols-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-2xl border border-[var(--s-border)] p-4 transition-colors hover:bg-[var(--s-hover)]">
              <p className="text-sm font-bold text-[var(--s-text)]">{l.label}</p>
              <p className="mt-1 text-xs text-[var(--s-muted)]">{l.hint}</p>
            </Link>
          ))}
        </div>
        <div className="mt-4">
          <p className="label">Webhook URL</p>
          <CopyText value={webhookUrl} />
          <p className="mt-1 text-xs text-[var(--s-muted)]">
            Paste into Meta → WhatsApp → Configuration with your WHATSAPP_VERIFY_TOKEN, and subscribe to the messages field.
          </p>
        </div>
      </Card>
      {showCoexistence && (
        <details className="card p-6 sm:p-7">
          <summary className="cursor-pointer text-sm font-bold text-[var(--s-text)]">Advanced: link a WhatsApp Business app number (coexistence)</summary>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-[var(--s-text-2)]">
              Optional. Links a number that stays in use in the WhatsApp Business app on a phone, so the team can keep chatting there. Not needed for a
              Cloud API number.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--s-text-2)]">
              <li>Have the phone with the WhatsApp Business app (latest version) nearby. Meta shows a QR code or prompt to confirm in the app.</li>
              <li>Open the WhatsApp Business app at least once every 14 days, or Meta disconnects the API.</li>
              <li>Chats sent from the app and from the website show up in the same conversation on the phone.</li>
              <li>When Meta asks, choose to connect without importing existing contacts or chat history.</li>
            </ul>
            {signupReady ? (
              <WhatsAppConnect appId={appId} configId={configId} version={await graphVersion()} connected={conn?.source === "connected"} />
            ) : (
              <p className="text-sm text-[var(--s-text-2)]">
                To relink or change this number, set <code>META_APP_ID</code>, <code>WHATSAPP_ES_CONFIG_ID</code> and <code>WHATSAPP_APP_SECRET</code> in{" "}
                <Link href="/admin/settings?section=env" className="underline">Environment variables</Link>.
              </p>
            )}
          </div>
        </details>
      )}
    </>
  );
}

async function TemplatesSection() {
  const [settings, meta] = await Promise.all([templateSettings(), metaTemplates()]);
  const templates = TEMPLATES.map((t) => ({ ...t, ...settings[t.key] }));
  return (
    <>
      <Card
        title="WhatsApp templates"
        description="Each message the website sends, shown with the wording you designed and Meta approved. Create or edit the wording in Meta (WhatsApp Manager → Message templates), then choose it here."
      >
        <WhatsAppTemplates templates={templates} meta={meta} />
      </Card>
      {meta === null && (
        <p className="px-1 text-xs text-[var(--s-muted)]">
          Your Meta templates and their previews appear here once a number is connected, or once WHATSAPP_TOKEN and WHATSAPP_WABA_ID are set in{" "}
          <Link href="/admin/settings?section=env" className="underline">Environment variables</Link>. Until then, type the name and language.
        </p>
      )}
    </>
  );
}

async function EnvSection() {
  const vars = await envOverview();
  const fromServer = vars.filter((v) => !v.saved && v.onServer).map((v) => v.name);
  return (
    <>
      <Card
        title="Environment variables"
        description="WhatsApp and email keys used by the website. Values saved here take effect within 15 seconds, with no redeploy, and override the hosting panel's. They're stored encrypted; saved secrets are never shown again."
      >
        <EnvVariables vars={vars} />
      </Card>
      <Card title="Set in the hosting panel" description="Database, AUTH_SECRET and NEXT_PUBLIC_* website details can only be set on the server, because the site needs them to start or bakes them in at build time.">
        {fromServer.length ? (
          <p className="text-sm text-[var(--s-text-2)]">
            Also coming from the server (no value saved here): <span className="font-mono text-xs">{fromServer.join(", ")}</span>
          </p>
        ) : (
          <p className="text-sm text-[var(--s-muted)]">No other WhatsApp or email variables are set on the server.</p>
        )}
      </Card>
    </>
  );
}

async function SecuritySection({ email }: { email: string }) {
  const sessions = await db.count("SELECT COUNT(*) FROM sessions WHERE kind = 'admin' AND expires_at > UTC_TIMESTAMP(3)");
  const whatsappOn = Boolean(await whatsappConnection());
  const envProblems = await whatsappEnvProblems();
  const mailOn = await mailConfigured();
  const mail = await mailSummary();
  return (
    <>
      <Card title="Security" description="Read-only. These are configured through environment variables.">
        <ul className="divide-y divide-[var(--s-border)]">
          <StatusRow label="Two-factor authentication" on={await adminMfaRequired()} detail="ADMIN_2FA" />
          <StatusRow label="Email" on={mailOn} detail={mailOn ? `${mail.host} · from ${mail.from || "(no sender set)"}` : "SMTP_HOST"} />
          <StatusRow label="WhatsApp" on={whatsappOn}
            detail={!whatsappOn && envProblems.length ? `${envProblems.join(", ")}: placeholder text, not a real value` : "Settings → WhatsApp, or WHATSAPP_TOKEN"}
          />
        </ul>
      </Card>
      <Card title="Outgoing email" description="Password-reset codes, welcome emails and password-changed notices go out over SMTP. Send yourself a test to check delivery.">
        {mailOn ? (
          <TestEmailForm to={email} />
        ) : (
          <p className="text-sm text-[var(--s-text-2)]">
            Not configured, so password resets can&apos;t be emailed. Create a mailbox for the domain (Hostinger: hPanel → Emails), then set{" "}
            <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_SECURE</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>MAIL_FROM</code> in the
            hosting panel (Hostinger → Environment variables) and redeploy. Mail settings are kept on the server only.
          </p>
        )}
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
