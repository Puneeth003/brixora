import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { displayPhone, formatDate } from "@/lib/format";
import { Empty, PageHeader, Table } from "@/components/admin/ui";
import { AgentForm } from "@/components/crm/forms";
import { PropertyStatusBadge } from "@/components/StatusBadge";
import { openMemberClient, sendAgentWelcome, setMemberActive, setStaffActive } from "../../../crm-actions";
import type { Agent, PropertyStatus } from "@/lib/types";

export const metadata: Metadata = { title: "User" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UserRow = {
  id: string;
  role: "admin" | "agent" | "owner";
  is_active: boolean | number;
  agent_type: "agent" | "broker" | null;
  name: string | null;
  email: string | null;
  work_phone: string | null;
  company: string | null;
  rera_no: string | null;
  commission_pct: number | string | null;
  notes: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  last_login_at: string | null;
  has_password: boolean | number;
  totp_enabled: boolean | number;
  wa_opt_out: boolean | number;
  created_at: string;
};

type Listing = { id: string; reference_no: string | null; title: string; status: PropertyStatus; created_at: string };
type Enquiry = { id: string; property_id: string | null; reference_no: string | null; message: string | null; created_at: string };

function initials(name: string | null, fallback: string | null) {
  const src = (name ?? fallback ?? "?").trim();
  const parts = src.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase() || "?";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[var(--s-hover)] px-4 py-3">
      <div className="text-xl font-extrabold tabular-nums text-[var(--s-text)]">{value}</div>
      <div className="text-xs font-semibold text-[var(--s-muted)]">{label}</div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--s-muted)]">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-[var(--s-text-2)]">{children}</dd>
    </div>
  );
}

const softBtn = "rounded-full bg-[var(--s-brand-soft)] px-4 py-2 text-sm font-bold text-[var(--brand)] transition-colors hover:bg-[var(--s-seg)]";
const dangerBtn = "rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-[var(--s-late)] transition-colors hover:bg-red-100";

export default async function UserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const saved = typeof sp.saved === "string" ? sp.saved.slice(0, 300) : null;
  const inviteError = typeof sp.error === "string" ? sp.error.slice(0, 400) : null;
  if (!UUID_RE.test(id)) notFound();

  const u = await db.one<UserRow>(
    `SELECT id, role, is_active, agent_type, name, email, work_phone, company, rera_no, commission_pct, notes,
            phone, phone_verified_at, last_login_at, (password_hash IS NOT NULL) AS has_password,
            totp_enabled, wa_opt_out, created_at
       FROM users WHERE id = ?`,
    [id],
  );
  if (!u) notFound();

  const staff = u.role === "admin" || u.role === "agent";
  const isActive = Boolean(Number(u.is_active));
  const hasPassword = Boolean(Number(u.has_password));
  const isMe = u.id === me.userId;

  let lastSeen: string | null = u.last_login_at;
  let staffStats = { open: 0, won: 0, referred: 0 };
  let memberStats = { listings: 0, live: 0, enquiries: 0, saved: 0 };
  let listings: Listing[] = [];
  let enquiries: Enquiry[] = [];
  let clientId: string | null = null;

  if (staff) {
    const s = await db.one<{ last_seen: string | null; open: number; won: number; referred: number }>(
      `SELECT (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = ?) AS last_seen,
              (SELECT COUNT(*) FROM clients c WHERE c.assigned_to = ? AND c.status NOT IN ('won', 'lost')) AS open,
              (SELECT COUNT(*) FROM clients c WHERE c.assigned_to = ? AND c.status = 'won') AS won,
              (SELECT COUNT(*) FROM clients c WHERE c.broker_id = ?) AS referred`,
      [id, id, id, id],
    );
    lastSeen = s?.last_seen ?? null;
    staffStats = { open: Number(s?.open ?? 0), won: Number(s?.won ?? 0), referred: Number(s?.referred ?? 0) };
  } else {
    const phone = u.phone ?? "";
    const [s, l, e, c] = await Promise.all([
      db.one<{ listings: number; live: number; enquiries: number; saved: number }>(
        `SELECT (SELECT COUNT(*) FROM properties p WHERE p.owner_id = ? AND p.status <> 'draft') AS listings,
                (SELECT COUNT(*) FROM properties p WHERE p.owner_id = ? AND p.status = 'approved') AS live,
                (SELECT COUNT(*) FROM enquiries e WHERE e.user_id = ? OR (? <> '' AND e.phone = ?)) AS enquiries,
                (SELECT COUNT(*) FROM saved_properties s WHERE s.user_id = ?) AS saved`,
        [id, id, id, phone, phone, id],
      ),
      db.all<Listing>(
        `SELECT id, reference_no, title, status, created_at FROM properties
          WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20`,
        [id],
      ),
      db.all<Enquiry>(
        `SELECT e.id, e.property_id, p.reference_no, e.message, e.created_at
           FROM enquiries e LEFT JOIN properties p ON p.id = e.property_id
          WHERE e.user_id = ? OR (? <> '' AND e.phone = ?)
          ORDER BY e.created_at DESC LIMIT 10`,
        [id, phone, phone],
      ),
      u.phone ? db.one<{ id: string }>("SELECT id FROM clients WHERE phone = ? LIMIT 1", [u.phone]) : Promise.resolve(null),
    ]);
    memberStats = {
      listings: Number(s?.listings ?? 0),
      live: Number(s?.live ?? 0),
      enquiries: Number(s?.enquiries ?? 0),
      saved: Number(s?.saved ?? 0),
    };
    listings = l;
    enquiries = e;
    clientId = c?.id ?? null;
  }

  const roleLabel =
    u.role === "admin"
      ? "Admin"
      : u.role === "agent"
        ? u.agent_type === "broker"
          ? "Broker"
          : "Agent"
        : memberStats.listings > 0
          ? "Owner"
          : "Visitor";
  const roleCls: Record<string, string> = {
    Admin: "bg-zinc-900 text-white",
    Agent: "bg-emerald-100 text-emerald-800",
    Broker: "bg-amber-100 text-amber-800",
    Owner: "bg-violet-100 text-violet-800",
    Visitor: "bg-sky-100 text-sky-800",
  };
  const status = !isActive
    ? { label: "Blocked", cls: "bg-red-100 text-red-700" }
    : staff && u.email && !hasPassword
      ? { label: "Invite pending", cls: "bg-amber-100 text-amber-800" }
      : { label: "Active", cls: "bg-emerald-50 text-emerald-700" };

  const displayName = u.name ?? u.email ?? (u.phone ? displayPhone(u.phone) : "Unnamed");
  const agent: Agent | null = staff
    ? {
        id: u.id,
        role: u.role as Agent["role"],
        is_active: isActive,
        agent_type: u.agent_type,
        name: u.name,
        email: u.email,
        work_phone: u.work_phone,
        company: u.company,
        rera_no: u.rera_no,
        commission_pct: u.commission_pct === null ? null : Number(u.commission_pct),
        notes: u.notes,
        has_password: hasPassword,
        created_at: u.created_at,
      }
    : null;
  const mailReady = mailConfigured || process.env.NODE_ENV !== "production";

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/users" className="hover:text-[var(--brand)]">
            ← Users
          </Link>
        }
        title={displayName}
      />
      {saved && (
        <p role="status" className="mb-5 rounded-[16px] bg-[var(--s-brand-soft)] px-4 py-3 text-sm font-semibold text-[var(--brand)]">
          {saved}
        </p>
      )}
      {inviteError && (
        <p role="alert" className="mb-5 rounded-[16px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {inviteError}
        </p>
      )}

      <section className="card mb-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--s-brand-soft)] text-lg font-extrabold text-[var(--brand)]"
          >
            {initials(u.name, u.email)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold text-[var(--s-text)]">{displayName}</span>
              {isMe && <span className="text-xs font-semibold text-[var(--s-muted)]">(you)</span>}
              <span className={`badge ${roleCls[roleLabel]}`}>{roleLabel}</span>
              <span className={`badge ${status.cls}`}>{status.label}</span>
              {Boolean(Number(u.totp_enabled)) && <span className="badge bg-zinc-100 text-zinc-700">2FA</span>}
              {!staff && Boolean(Number(u.wa_opt_out)) && <span className="badge bg-zinc-100 text-zinc-600">WA opt-out</span>}
            </div>
            <p className="mt-0.5 truncate text-sm text-[var(--s-muted)]">
              {staff
                ? [u.email ?? "No login", u.work_phone ? displayPhone(u.work_phone) : null, u.company].filter(Boolean).join(" · ")
                : displayPhone(u.phone)}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--s-border)] pt-5 sm:grid-cols-4">
          <Meta label="Joined">{formatDate(u.created_at)}</Meta>
          <Meta label={staff ? "Last sign-in" : "Last seen"}>{formatDate(lastSeen)}</Meta>
          {staff ? (
            <>
              <Meta label="Email">{u.email ?? "—"}</Meta>
              <Meta label="Work phone">{u.work_phone ? displayPhone(u.work_phone) : "—"}</Meta>
            </>
          ) : (
            <>
              <Meta label="Phone">{displayPhone(u.phone)}</Meta>
              <Meta label="Phone verified">{formatDate(u.phone_verified_at)}</Meta>
            </>
          )}
        </dl>
      </section>

      {agent ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="card p-6">
            <h2 className="mb-5 text-lg font-extrabold text-[var(--s-text)]">Details</h2>
            <AgentForm agent={agent} mailReady={mailReady} />
          </section>

          <aside className="flex flex-col gap-6">
            <section className="card p-6">
              <h2 className="mb-4 text-lg font-extrabold text-[var(--s-text)]">Clients</h2>
              <div className={`grid gap-3 ${agent.agent_type === "broker" ? "grid-cols-3" : "grid-cols-2"}`}>
                <Stat label="Open" value={staffStats.open} />
                <Stat label="Won" value={staffStats.won} />
                {agent.agent_type === "broker" && <Stat label="Referred" value={staffStats.referred} />}
              </div>
              <Link href={`/admin/clients?agent=${u.id}`} className="mt-4 inline-block text-sm font-bold text-[var(--brand)] hover:underline">
                View clients →
              </Link>
            </section>

            <section className="card p-6">
              <h2 className="mb-1 text-lg font-extrabold text-[var(--s-text)]">Access</h2>
              <p className="mb-4 text-sm text-[var(--s-muted)]">
                {isMe
                  ? "This is your own account. Change your password from your profile."
                  : !u.email
                    ? "No email on file, so this account can't sign in."
                    : hasPassword
                      ? "Can sign in with email and password."
                      : "Hasn't set a password yet."}
              </p>
              <div className="flex flex-wrap gap-2">
                {u.email && isActive && (
                  <form action={sendAgentWelcome.bind(null, u.id)}>
                    <button className={softBtn}>Email a set-password link</button>
                  </form>
                )}
                {!isMe && (
                  <form action={setStaffActive.bind(null, u.id, !isActive)}>
                    <button className={isActive ? dangerBtn : softBtn}>{isActive ? "Deactivate (signs them out)" : "Reactivate"}</button>
                  </form>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section>
              <h2 className="mb-3 text-lg font-extrabold text-[var(--s-text)]">Listings</h2>
              {listings.length ? (
                <Table>
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((p) => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap font-semibold">
                          <Link href={`/admin/properties/${p.id}`} className="text-[var(--brand)] hover:underline">
                            {p.reference_no ?? "Draft"}
                          </Link>
                        </td>
                        <td className="max-w-xs truncate">{p.title}</td>
                        <td>
                          <PropertyStatusBadge status={p.status} />
                        </td>
                        <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDate(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <Empty>No listings yet.</Empty>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-extrabold text-[var(--s-text)]">Recent enquiries</h2>
              {enquiries.length ? (
                <Table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Message</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enquiries.map((e) => (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap font-semibold">
                          {e.property_id && e.reference_no ? (
                            <Link href={`/admin/properties/${e.property_id}`} className="text-[var(--brand)] hover:underline">
                              {e.reference_no}
                            </Link>
                          ) : (
                            <span className="text-[var(--s-muted)]">General</span>
                          )}
                        </td>
                        <td className="max-w-md truncate text-[var(--s-text-2)]">
                          {e.message ? (e.message.length > 120 ? `${e.message.slice(0, 120)}…` : e.message) : "—"}
                        </td>
                        <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDate(e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <Empty>No enquiries yet.</Empty>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="card p-6">
              <h2 className="mb-4 text-lg font-extrabold text-[var(--s-text)]">Summary</h2>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Listings" value={memberStats.listings} />
                <Stat label="Live" value={memberStats.live} />
                <Stat label="Enquiries" value={memberStats.enquiries} />
                <Stat label="Saved" value={memberStats.saved} />
              </div>
            </section>

            <section className="card p-6">
              <h2 className="mb-4 text-lg font-extrabold text-[var(--s-text)]">Actions</h2>
              <div className="flex flex-wrap gap-2">
                {clientId ? (
                  <Link href={`/admin/clients/${clientId}`} className={softBtn}>
                    Open in CRM
                  </Link>
                ) : (
                  u.phone && (
                    <form action={openMemberClient.bind(null, u.id)}>
                      <button className={softBtn}>Add to CRM</button>
                    </form>
                  )
                )}
                <form action={setMemberActive.bind(null, u.id, !isActive)}>
                  <button className={isActive ? dangerBtn : softBtn}>{isActive ? "Block" : "Unblock"}</button>
                </form>
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
