import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db, likeEscape } from "@/lib/db";
import { displayPhone, formatDate, normalizeIndianPhone } from "@/lib/format";
import { Empty, PageHeader, Table, Tabs } from "@/components/admin/ui";
import { openMemberClient, setMemberActive } from "../../crm-actions";

export const metadata: Metadata = { title: "Members" };

type Row = {
  id: string;
  name: string | null;
  phone: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  wa_opt_out: boolean;
  listings: number;
  live: number;
  enquiries: number;
  saved: number;
  client_id: string | null;
};

const TABS = [
  { key: "all", label: "All" },
  { key: "owners", label: "Owners" },
  { key: "visitors", label: "Visitors" },
  { key: "blocked", label: "Blocked" },
] as const;

function initials(name: string | null, phone: string) {
  const parts = (name ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!parts.length) return phone.slice(-2);
  return ((parts[0][0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Public accounts: visitors and property owners (WhatsApp OTP sign-in). */
export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  await requireAdmin();
  const sp = await searchParams;
  const active = TABS.find((t) => t.key === sp.tab)?.key ?? "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";

  const where = ["u.role = 'owner'", "u.phone_verified_at IS NOT NULL"];
  const values: unknown[] = [];
  if (active === "blocked") where.push("u.is_active = 0");
  if (q) {
    const phone = normalizeIndianPhone(q);
    where.push("(u.name LIKE ? OR u.phone LIKE ?)");
    values.push(`%${likeEscape(q)}%`, phone ? `%${phone}%` : `%${likeEscape(q)}%`);
  }
  const having = active === "owners" ? "HAVING listings > 0" : active === "visitors" ? "HAVING listings = 0" : "";

  const rows = await db.all<Row>(
    `SELECT u.id, u.name, u.phone, u.is_active, u.created_at, u.last_login_at, u.wa_opt_out,
            (SELECT COUNT(*) FROM properties p WHERE p.owner_id = u.id AND p.status <> 'draft') AS listings,
            (SELECT COUNT(*) FROM properties p WHERE p.owner_id = u.id AND p.status = 'approved') AS live,
            (SELECT COUNT(*) FROM enquiries e WHERE e.user_id = u.id OR e.phone = u.phone) AS enquiries,
            (SELECT COUNT(*) FROM saved_properties s WHERE s.user_id = u.id) AS saved,
            (SELECT c.id FROM clients c WHERE c.phone = u.phone) AS client_id
       FROM users u
      WHERE ${where.join(" AND ")}
      ${having}
      ORDER BY COALESCE(u.last_login_at, u.created_at) DESC LIMIT 300`,
    values,
  );

  const stats = [
    { label: "Members", value: rows.length },
    { label: "Owners", value: rows.filter((m) => m.listings > 0).length },
    { label: "Visitors", value: rows.filter((m) => m.listings === 0).length },
    { label: "Blocked", value: rows.filter((m) => !m.is_active).length },
  ];
  const pill = "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold transition-colors";

  return (
    <>
      <PageHeader
        title="Members"
        description="Visitors and owners with an account. They sign in with their WhatsApp number to see their enquiries, replies, listings and saved properties."
        actions={
          <form className="flex gap-2">
            <input type="hidden" name="tab" value={active} />
            <input name="q" defaultValue={q} placeholder="Search name or phone" className="input w-56" />
            <button className="btn-secondary">Search</button>
          </form>
        }
      />
      <div className="s-stats mb-6">
        {stats.map((s) => (
          <div key={s.label} className="s-stat" data-tone={s.label === "Blocked" && s.value > 0 ? "bad" : undefined}>
            <span className="s-stat-lbl">{s.label}</span>
            <span className="s-stat-val">{s.value}</span>
          </div>
        ))}
      </div>
      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/members?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}` }))} />
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Type</th>
              <th>Listings</th>
              <th>Enquiries</th>
              <th>Saved</th>
              <th>Joined</th>
              <th>Last sign-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className={`hover:bg-[var(--s-hover)] ${m.is_active ? "" : "opacity-60"}`}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--s-brand-soft)] text-sm font-extrabold text-[var(--brand)]">
                      {initials(m.name, m.phone)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-[var(--s-text)]">{m.name ?? "—"}</span>
                        {!m.is_active && <span className="badge bg-red-100 text-red-700">Blocked</span>}
                        {m.wa_opt_out && <span className="badge bg-[var(--s-seg)] text-[var(--s-text-2)]">WhatsApp opt-out</span>}
                      </span>
                      <span className="block text-xs text-[var(--s-muted)]">{displayPhone(m.phone)}</span>
                    </span>
                  </div>
                </td>
                <td>{m.listings > 0 ? <span className="badge bg-violet-100 text-violet-800">Owner</span> : <span className="badge bg-sky-100 text-sky-800">Visitor</span>}</td>
                <td className="tabular-nums">{m.listings ? `${m.listings} (${m.live} live)` : "—"}</td>
                <td className="tabular-nums">{m.enquiries || "—"}</td>
                <td className="tabular-nums">{m.saved || "—"}</td>
                <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDate(m.created_at)}</td>
                <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDate(m.last_login_at)}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {m.client_id ? (
                      <Link href={`/admin/clients/${m.client_id}`} className={`${pill} bg-[var(--s-brand-soft)] text-[var(--brand)] hover:bg-[var(--s-seg)]`}>
                        Open in CRM
                      </Link>
                    ) : (
                      <form action={openMemberClient.bind(null, m.id)}>
                        <button className={`${pill} bg-[var(--s-brand-soft)] text-[var(--brand)] hover:bg-[var(--s-seg)]`}>Add to CRM</button>
                      </form>
                    )}
                    <form action={setMemberActive.bind(null, m.id, !m.is_active)}>
                      <button
                        className={`${pill} ${m.is_active ? "bg-red-50 text-[var(--s-late)] hover:bg-red-100" : "bg-[var(--s-brand-soft)] text-[var(--brand)] hover:bg-[var(--s-seg)]"}`}
                      >
                        {m.is_active ? "Block" : "Unblock"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>No members yet.</Empty>
      )}
    </>
  );
}
