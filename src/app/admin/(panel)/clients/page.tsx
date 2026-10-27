import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { db, likeEscape } from "@/lib/db";
import { clientScope, staffOptions } from "@/lib/crm";
import { normalizeIndianPhone, displayPhone, formatDate } from "@/lib/format";
import { CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/crm-constants";
import { fromNow, nowMs } from "@/lib/time";
import { Empty, PageHeader, Table, Tabs } from "@/components/admin/ui";
import { ClientStatusBadge, FollowUp, requirementSummary } from "@/components/crm/ClientBadges";
import type { Client } from "@/lib/types";

export const metadata: Metadata = { title: "Clients" };

const TABS = [
  { key: "open", label: "Open" },
  { key: "due", label: "Follow-ups due" },
  ...CLIENT_STATUSES.map((s) => ({ key: s.value, label: s.label })),
  { key: "all", label: "All" },
];

type Row = Client & { agent_name: string | null; agent_email: string | null; enquiries: number; unread: number };

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  const staff = await requireStaff();
  await connection();
  const sp = await searchParams;
  const active = TABS.find((t) => t.key === sp.tab)?.key ?? "open";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const agent = staff.role === "admin" && typeof sp.agent === "string" ? sp.agent : "";
  const type = typeof sp.type === "string" && CLIENT_TYPES.some((t) => t.value === sp.type) ? sp.type : "";
  const now = nowMs();

  const scope = clientScope(staff);
  const where = [scope.sql];
  const values: unknown[] = [...scope.values];
  if (active === "open") where.push("c.status NOT IN ('won', 'lost')");
  else if (active === "due") {
    where.push("c.status NOT IN ('won', 'lost')", "c.next_follow_up <= ?");
    values.push(fromNow(86_400_000));
  } else if (active !== "all") {
    where.push("c.status = ?");
    values.push(active);
  }
  if (q) {
    const like = `%${likeEscape(q)}%`;
    const phone = normalizeIndianPhone(q);
    where.push("(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.localities LIKE ?)");
    values.push(like, phone ? `%${phone}%` : like, like, like);
  }
  if (agent === "none") where.push("c.assigned_to IS NULL");
  else if (agent) {
    where.push("c.assigned_to = ?");
    values.push(agent);
  }
  if (type) {
    where.push("c.type = ?");
    values.push(type);
  }

  const order = active === "due" ? "c.next_follow_up ASC" : "unread DESC, (c.next_follow_up IS NULL), c.next_follow_up ASC, c.updated_at DESC";
  const [rows, staffList] = await Promise.all([
    db.all<Row>(
      `SELECT c.*, u.name AS agent_name, u.email AS agent_email,
              (SELECT COUNT(*) FROM enquiries e WHERE e.client_id = c.id) AS enquiries,
              (SELECT COUNT(*) FROM enquiry_messages m JOIN enquiries e ON e.id = m.enquiry_id
                WHERE e.client_id = c.id AND m.sender = 'member' AND m.read_at IS NULL) AS unread
         FROM clients c LEFT JOIN users u ON u.id = c.assigned_to
        WHERE ${where.join(" AND ")}
        ORDER BY ${order} LIMIT 300`,
      values,
    ),
    staff.role === "admin" ? staffOptions() : Promise.resolve([]),
  ]);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(agent ? { agent } : {}), ...(type ? { type } : {}), ...extra });
    return `/admin/clients?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Clients"
        description={staff.role === "admin" ? "Buyers, tenants, sellers and landlords. Website enquiries arrive here automatically." : "Clients assigned to you."}
        actions={
          <Link href="/admin/clients/new" className="btn-primary">
            + Add client
          </Link>
        }
      />
      <form className="card mb-5 flex flex-wrap items-center gap-2.5 p-3 sm:p-4">
        <input type="hidden" name="tab" value={active} />
        <input name="q" defaultValue={q} placeholder="Search name, phone, email, locality" className="input min-w-0 flex-1 sm:max-w-sm" />
        <select name="type" defaultValue={type} className="input w-auto">
          <option value="">All types</option>
          {CLIENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {staff.role === "admin" && (
          <select name="agent" defaultValue={agent} className="input w-auto">
            <option value="">All agents</option>
            <option value="none">Unassigned</option>
            {staffList
              .filter((s) => s.agent_type !== "broker")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.email}
                </option>
              ))}
          </select>
        )}
        <button className="btn-primary ml-auto px-5">Filter</button>
      </form>
      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: qs({ tab: t.key }) }))} />
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Looking for</th>
              <th>Status</th>
              {staff.role === "admin" && <th>Agent</th>}
              <th>Next follow-up</th>
              <th>Last contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--s-hover)]">
                <td>
                  <div className="flex items-center gap-3">
                    <Initials name={c.name} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/clients/${c.id}`} className="font-bold text-[var(--s-text)] hover:text-[var(--brand)]">
                          {c.name}
                        </Link>
                        {c.unread > 0 && (
                          <span className="inline-flex items-center rounded-full bg-[var(--s-late)] px-2 py-0.5 text-[11px] font-extrabold text-white">{c.unread} new</span>
                        )}
                      </div>
                      <span className="block text-xs text-[var(--s-muted)]">
                        {displayPhone(c.phone)}
                        {c.enquiries > 0 && ` · ${c.enquiries} enquir${c.enquiries === 1 ? "y" : "ies"}`}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="max-w-xs text-[var(--s-text-2)]">{requirementSummary(c)}</td>
                <td>
                  <ClientStatusBadge status={c.status} />
                </td>
                {staff.role === "admin" && <td className="text-[var(--s-text-2)]">{c.agent_name ?? c.agent_email ?? <span className="font-semibold text-amber-700">Unassigned</span>}</td>}
                <td className="whitespace-nowrap">
                  <FollowUp at={c.next_follow_up} now={now} />
                </td>
                <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDate(c.last_contact_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>{active === "due" ? "No follow-ups due. Nice." : "No clients here yet."}</Empty>
      )}
    </>
  );
}

function Initials({ name }: { name: string }) {
  const initials =
    name
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--s-brand-soft)] text-sm font-extrabold text-[var(--brand)]">
      {initials}
    </span>
  );
}
