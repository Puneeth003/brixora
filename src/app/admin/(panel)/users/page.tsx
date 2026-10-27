import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db, likeEscape } from "@/lib/db";
import { displayPhone, formatDate, normalizeIndianPhone } from "@/lib/format";
import { Empty, PageHeader, Table, Tabs } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Users" };

const PER_PAGE = 50;

type Kind = "admin" | "agent" | "broker" | "owner" | "visitor";

type Row = {
  id: string;
  kind: Kind;
  name: string | null;
  email: string | null;
  phone: string | null;
  work_phone: string | null;
  company: string | null;
  is_active: boolean;
  has_password: boolean;
  totp_enabled: boolean;
  wa_opt_out: boolean;
  created_at: string;
  last_seen: string | null;
  open_clients: number;
  referred: number;
  listings: number;
  live: number;
  enquiries: number;
  saved: number;
  client_id: string | null;
};

const TABS = [
  { key: "all", label: "All" },
  { key: "admins", label: "Admins" },
  { key: "agents", label: "Agents" },
  { key: "brokers", label: "Brokers" },
  { key: "owners", label: "Owners" },
  { key: "visitors", label: "Visitors" },
  { key: "blocked", label: "Blocked" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Every user falls into exactly one kind. Members (role 'owner') with at least one
// non-draft listing are Owners; the rest are Visitors.
const HAS_LISTING = "EXISTS (SELECT 1 FROM properties p WHERE p.owner_id = u.id AND p.status <> 'draft')";
const KIND_SQL = `CASE
  WHEN u.role = 'admin' THEN 'admin'
  WHEN u.role = 'agent' AND u.agent_type = 'broker' THEN 'broker'
  WHEN u.role = 'agent' THEN 'agent'
  WHEN ${HAS_LISTING} THEN 'owner'
  ELSE 'visitor' END`;

const TAB_WHERE: Record<TabKey, string | null> = {
  all: null,
  admins: "u.role = 'admin'",
  agents: "u.role = 'agent' AND (u.agent_type IS NULL OR u.agent_type <> 'broker')",
  brokers: "u.role = 'agent' AND u.agent_type = 'broker'",
  owners: `u.role = 'owner' AND ${HAS_LISTING}`,
  visitors: `u.role = 'owner' AND NOT ${HAS_LISTING}`,
  blocked: "u.is_active = 0",
};

const KIND_BADGE: Record<Kind, { label: string; cls: string }> = {
  admin: { label: "Admin", cls: "bg-zinc-900 text-white" },
  agent: { label: "Agent", cls: "bg-emerald-100 text-emerald-800" },
  broker: { label: "Broker", cls: "bg-amber-100 text-amber-800" },
  owner: { label: "Owner", cls: "bg-violet-100 text-violet-800" },
  visitor: { label: "Visitor", cls: "bg-sky-100 text-sky-800" },
};

function initials(name: string | null, fallback: string | null) {
  const src = (name ?? fallback ?? "?").trim();
  const parts = src.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** One place to manage every account: staff, partner brokers and public members. */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const active: TabKey = TABS.find((t) => t.key === sp.tab)?.key ?? "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const saved = typeof sp.saved === "string" ? sp.saved.slice(0, 200) : null;
  const pageParam = typeof sp.page === "string" ? Number.parseInt(sp.page, 10) : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  // Members only count once their phone is verified; staff always count.
  const base = ["(u.role IN ('admin', 'agent') OR u.phone_verified_at IS NOT NULL)"];
  const baseValues: unknown[] = [];
  if (q) {
    const like = `%${likeEscape(q)}%`;
    const phone = normalizeIndianPhone(q);
    const phoneLike = phone ? `%${phone.slice(2)}%` : like;
    base.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.work_phone LIKE ?)");
    baseValues.push(like, like, phoneLike, phoneLike);
  }

  const counts = await db.one<Record<TabKey, number>>(
    `SELECT COUNT(*) AS \`all\`,
            ${TABS.filter((t) => t.key !== "all")
              .map((t) => `COALESCE(SUM(${TAB_WHERE[t.key]}), 0) AS \`${t.key}\``)
              .join(",\n            ")}
       FROM users u WHERE ${base.join(" AND ")}`,
    baseValues,
  );
  const tabWhere = TAB_WHERE[active];
  const where = tabWhere ? [...base, `(${tabWhere})`] : base;
  const total = Number(counts?.[active] ?? 0);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const rows = await db.all<Row>(
    `SELECT u.id, ${KIND_SQL} AS kind, u.name, u.email, u.phone, u.work_phone, u.company,
            u.is_active, (u.password_hash IS NOT NULL) AS has_password, u.totp_enabled, u.wa_opt_out, u.created_at,
            CASE WHEN u.role = 'owner' THEN u.last_login_at
                 ELSE (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) END AS last_seen,
            CASE WHEN u.role <> 'owner' THEN (SELECT COUNT(*) FROM clients c WHERE c.assigned_to = u.id AND c.status NOT IN ('won', 'lost')) ELSE 0 END AS open_clients,
            CASE WHEN u.role = 'agent' THEN (SELECT COUNT(*) FROM clients c WHERE c.broker_id = u.id) ELSE 0 END AS referred,
            CASE WHEN u.role = 'owner' THEN (SELECT COUNT(*) FROM properties p WHERE p.owner_id = u.id AND p.status <> 'draft') ELSE 0 END AS listings,
            CASE WHEN u.role = 'owner' THEN (SELECT COUNT(*) FROM properties p WHERE p.owner_id = u.id AND p.status = 'approved') ELSE 0 END AS live,
            CASE WHEN u.role = 'owner' THEN (SELECT COUNT(*) FROM enquiries e WHERE e.user_id = u.id OR e.phone = u.phone) ELSE 0 END AS enquiries,
            CASE WHEN u.role = 'owner' THEN (SELECT COUNT(*) FROM saved_properties s WHERE s.user_id = u.id) ELSE 0 END AS saved,
            CASE WHEN u.role = 'owner' AND u.phone IS NOT NULL THEN (SELECT c.id FROM clients c WHERE c.phone = u.phone LIMIT 1) END AS client_id
       FROM users u
      WHERE ${where.join(" AND ")}
      ORDER BY FIELD(u.role, 'admin', 'agent', 'owner'), u.is_active DESC,
               COALESCE(u.last_login_at, u.created_at) DESC, u.id
      LIMIT ? OFFSET ?`,
    [...baseValues, PER_PAGE, (page - 1) * PER_PAGE],
  );

  const href = (params: { tab?: string; page?: number }) => {
    const s = new URLSearchParams();
    const tab = params.tab ?? active;
    if (tab !== "all") s.set("tab", tab);
    if (q) s.set("q", q);
    if (params.page && params.page > 1) s.set("page", String(params.page));
    const qs = s.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account in one place: admins, in-house agents, partner brokers, property owners and visitors."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex gap-2">
              {active !== "all" && <input type="hidden" name="tab" value={active} />}
              <input name="q" defaultValue={q} placeholder="Search name, email or phone" className="input w-64" />
              <button className="btn-secondary">Search</button>
            </form>
            <Link href="/admin/users/new" className="btn-primary">
              + Add staff
            </Link>
          </div>
        }
      />
      {saved && (
        <p role="status" className="mb-5 rounded-[16px] bg-[var(--s-brand-soft)] px-4 py-3 text-sm font-semibold text-[var(--brand)]">
          {saved}
        </p>
      )}
      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: Number(counts?.[t.key] ?? 0), href: href({ tab: t.key }) }))} />

      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Activity</th>
              <th>Joined</th>
              <th>Last seen</th>
              <th className="w-px text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const staff = u.kind === "admin" || u.kind === "agent" || u.kind === "broker";
              const badge = KIND_BADGE[u.kind];
              const contact = staff
                ? [u.email ?? "No login", u.work_phone ? displayPhone(u.work_phone) : null, u.company].filter(Boolean).join(" · ")
                : displayPhone(u.phone);
              return (
                <tr key={u.id} className={`relative cursor-pointer ${u.is_active ? "" : "opacity-60"}`}>
                  <td>
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: "var(--s-brand-soft)", color: "var(--brand)" }}
                      >
                        {initials(u.name, u.email)}
                      </span>
                      <span className="min-w-0">
                        <Link href={`/admin/users/${u.id}`} className="block truncate font-semibold after:absolute after:inset-0 after:content-['']">
                          {u.name ?? (staff ? u.email : null) ?? "Unnamed"}
                          {u.id === me.userId && <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--s-muted)" }}>(you)</span>}
                        </Link>
                        <span className="block truncate text-xs" style={{ color: "var(--s-muted)" }}>
                          {contact}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    {!u.is_active ? (
                      <span className="badge bg-red-100 text-red-700">Blocked</span>
                    ) : staff && u.email && !u.has_password ? (
                      <span className="badge bg-amber-100 text-amber-800">Invite pending</span>
                    ) : (
                      <span className="badge bg-emerald-50 text-emerald-700">Active</span>
                    )}
                    {u.totp_enabled && <span className="badge ml-1 bg-zinc-100 text-zinc-700">2FA</span>}
                    {!staff && u.wa_opt_out && <span className="badge ml-1 bg-zinc-100 text-zinc-600">WA opt-out</span>}
                  </td>
                  <td className="whitespace-nowrap tabular-nums" style={{ color: "var(--s-text-2)" }}>
                    {u.kind === "broker"
                      ? `${u.referred} referred`
                      : staff
                        ? `${u.open_clients} open client${u.open_clients === 1 ? "" : "s"}`
                        : u.kind === "owner"
                          ? `${u.listings} listing${u.listings === 1 ? "" : "s"} (${u.live} live)`
                          : `${u.enquiries} enquir${u.enquiries === 1 ? "y" : "ies"} · ${u.saved} saved`}
                  </td>
                  <td className="whitespace-nowrap" style={{ color: "var(--s-muted)" }}>
                    {formatDate(u.created_at)}
                  </td>
                  <td className="whitespace-nowrap" style={{ color: "var(--s-muted)" }}>
                    {formatDate(u.last_seen)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand)]">
                      Manage
                      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <Empty>{q ? `No users match “${q}”.` : "No users here yet."}</Empty>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          <span style={{ color: "var(--s-muted)" }}>
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} className="btn-secondary px-3 py-1.5">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: page + 1 })} className="btn-secondary px-3 py-1.5">
                Next
              </Link>
            )}
          </span>
        </nav>
      )}
    </>
  );
}
