import Link from "next/link";
import { connection } from "next/server";
import { requireStaff, type Staff } from "@/lib/auth";
import { clientScope } from "@/lib/crm";
import { CLIENT_STATUSES } from "@/lib/crm-constants";
import { ClientStatusBadge, FollowUp, requirementSummary } from "@/components/crm/ClientBadges";
import type { Client, Property } from "@/lib/types";
import { db } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { daysFromNowIso, istHour, nowMs, startOfMonthIst, startOfTodayIstIso } from "@/lib/time";
import { Empty, SectionHeading, StatCard } from "@/components/admin/ui";
import { PropertyStatusBadge } from "@/components/StatusBadge";

/** e.g. "Monday, 26 October" in India time. */
function todayLabel() {
  return new Date(nowMs()).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
}

const LIST_MAX = 6;

function greeting() {
  const h = istHour();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "You have 4 listings to review and 4 follow-ups due today." (zero counts are left out) */
function summarize(items: [number, string, string, string][]) {
  const parts = items.filter(([n]) => n > 0).map(([n, one, many, tail]) => `${n} ${n === 1 ? one : many}${tail ? ` ${tail}` : ""}`);
  if (!parts.length) return "You're all caught up. Nothing needs your attention right now.";
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `You have ${list}.`;
}

function Welcome({ name, summary, actions }: { name: string | null; summary: string; actions: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <section className="admin-hero mb-8">
      <p className="relative text-sm font-semibold text-white/70">{todayLabel()}</p>
      <h1 className="relative mt-1 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
        {greeting()}
        {name ? `, ${name.split(" ")[0]}` : ""}
      </h1>
      <p className="relative mt-2 max-w-xl text-[15px] text-white/80">{summary}</p>
      <div className="relative mt-5 flex flex-wrap gap-2.5">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="admin-hero-btn" data-primary={a.primary ? "" : undefined}>
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const staff = await requireStaff();
  await connection();
  const crm = await loadCrm(staff);

  if (staff.role !== "admin") {
    return (
      <>
        <Welcome
          name={staff.name}
          summary={summarize([
            [crm.due, "follow-up", "follow-ups", "due today"],
            [crm.fresh, "new lead", "new leads", "to call"],
            [crm.unread, "unread message", "unread messages", ""],
          ])}
          actions={[
            { href: "/admin/clients/new", label: "Add client", primary: true },
            { href: "/admin/calendar", label: "Calendar" },
            { href: "/admin/inbox", label: "Inbox" },
          ]}
        />
        <div className="s-stats">
          <StatCard label="Follow-ups due today" value={crm.due} href="/admin/clients?tab=due" tone={crm.due ? "warn" : "default"} />
          <StatCard label="New leads" value={crm.fresh} href="/admin/clients?tab=new" tone={crm.fresh ? "warn" : "default"} />
          <StatCard label="Unread messages" value={crm.unread} href="/admin/inbox" tone={crm.unread ? "bad" : "default"} />
        </div>
        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
          <FollowUpList followUps={crm.followUps} now={crm.now} />
          <div className="space-y-6">
            <Pipeline byStatus={crm.byStatus} />
            <Glance
              rows={[
                { label: "Open clients", value: crm.openCount, href: "/admin/clients" },
                { label: "Won this month", value: crm.wonMonth, href: "/admin/clients?tab=won" },
              ]}
            />
          </div>
        </div>
      </>
    );
  }

  const startOfDay = startOfTodayIstIso();
  const weekAhead = daysFromNowIso(7);

  type QueueRow = Pick<Property, "id" | "reference_no" | "title" | "status" | "price" | "listing_type" | "locality" | "submitted_at">;
  const [pending, requests, live, enquiriesToday, failed, expiring, queue] = await Promise.all([
    db.count("SELECT COUNT(*) FROM properties WHERE status IN ('pending', 'under_review')"),
    db.count("SELECT COUNT(*) FROM change_requests WHERE status = 'pending' AND submitted = 1"),
    db.count("SELECT COUNT(*) FROM properties WHERE status = 'approved'"),
    db.count("SELECT COUNT(*) FROM enquiries WHERE created_at >= ?", [startOfDay]),
    db.count("SELECT COUNT(*) FROM messages WHERE status = 'failed'"),
    db.count("SELECT COUNT(*) FROM properties WHERE status = 'approved' AND expires_at <= ?", [weekAhead]),
    db.all<QueueRow>(
      `SELECT id, reference_no, title, status, price, listing_type, locality, submitted_at FROM properties
        WHERE status IN ('pending', 'under_review') ORDER BY submitted_at ASC LIMIT 8`,
    ),
  ]);
  const queueShown = queue.slice(0, LIST_MAX);

  return (
    <>
      <Welcome
        name={staff.name}
        summary={summarize([
          [pending, "listing", "listings", "to review"],
          [crm.due, "follow-up", "follow-ups", "due today"],
          [crm.unread, "unread message", "unread messages", ""],
        ])}
        actions={[
          { href: "/admin/submissions", label: "Review submissions", primary: true },
          { href: "/admin/clients/new", label: "Add client" },
          { href: "/admin/reports", label: "Reports" },
        ]}
      />
      <div className="s-stats">
        <StatCard label="Pending submissions" value={pending} href="/admin/submissions" tone={pending ? "warn" : "default"} />
        <StatCard label="Follow-ups due today" value={crm.due} href="/admin/clients?tab=due" tone={crm.due ? "warn" : "default"} />
        <StatCard label="Unread messages" value={crm.unread} href="/admin/inbox" tone={crm.unread ? "bad" : "default"} />
        <StatCard label="Live listings" value={live} href="/admin/listings" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionHeading count={pending}>
              Review queue <span className="text-sm font-bold tracking-normal text-[var(--s-muted)]">oldest first</span>
            </SectionHeading>
            {queueShown.length ? (
              <ul className="card divide-y divide-[var(--s-border)] overflow-hidden p-0">
                {queueShown.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/properties/${p.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-[var(--s-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-[var(--s-text)]">{p.title}</p>
                        <p className="truncate text-xs text-[var(--s-muted)]">
                          <span className="font-mono">{p.reference_no}</span> · {p.locality} · {formatDateTime(p.submitted_at)}
                        </p>
                      </div>
                      <span className="text-sm font-bold whitespace-nowrap tabular-nums">{formatPrice(p.price, p.listing_type)}</span>
                      <PropertyStatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing waiting for review.</Empty>
            )}
          </section>
          <FollowUpList followUps={crm.followUps} now={crm.now} />
        </div>

        <div className="space-y-6">
          <Glance
            rows={[
              { label: "Change requests pending", value: requests, href: "/admin/requests" },
              { label: "New leads", value: crm.fresh, href: "/admin/clients?tab=new" },
              { label: "Open clients", value: crm.openCount, href: "/admin/clients" },
              { label: "Won this month", value: crm.wonMonth, href: "/admin/clients?tab=won" },
              { label: "Enquiries today", value: enquiriesToday, href: "/admin/enquiries" },
              { label: "Expiring within 7 days", value: expiring, href: "/admin/listings?tab=expiring" },
              { label: "Failed WhatsApp messages", value: failed, href: "/admin/messages?status=failed", bad: true },
            ]}
          />
          <Pipeline byStatus={crm.byStatus} />
        </div>
      </div>
    </>
  );
}

/** Follow-ups, new leads and the pipeline: everyone's for admins, an agent's own otherwise. */
async function loadCrm(staff: Staff) {
  const scope = clientScope(staff);
  const now = nowMs();
  const endOfToday = new Date(new Date(startOfTodayIstIso()).getTime() + 86_400_000);
  const monthStart = startOfMonthIst();
  const open = "c.status NOT IN ('won', 'lost')";

  const [due, fresh, openCount, wonMonth, unread, byStatus, followUps] = await Promise.all([
    db.count(`SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND ${open} AND c.next_follow_up < ?`, [...scope.values, endOfToday]),
    db.count(`SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND c.status = 'new'`, scope.values),
    db.count(`SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND ${open}`, scope.values),
    db.count(
      `SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND c.status = 'won' AND c.updated_at >= ?`,
      [...scope.values, monthStart],
    ),
    db.count(
      `SELECT COUNT(*) FROM enquiry_messages m JOIN enquiries e ON e.id = m.enquiry_id LEFT JOIN clients c ON c.id = e.client_id
        WHERE ${staff.role === "admin" ? "1 = 1" : scope.sql} AND m.sender = 'member' AND m.read_at IS NULL`,
      scope.values,
    ),
    db.all<{ status: Client["status"]; n: number }>(`SELECT c.status, COUNT(*) AS n FROM clients c WHERE ${scope.sql} GROUP BY c.status`, scope.values),
    db.all<Client>(
      `SELECT c.* FROM clients c WHERE ${scope.sql} AND ${open} AND c.next_follow_up IS NOT NULL
        ORDER BY c.next_follow_up ASC LIMIT 8`,
      scope.values,
    ),
  ]);
  return { now, due, fresh, openCount, wonMonth, unread, byStatus, followUps: followUps.slice(0, LIST_MAX) };
}

function FollowUpList({ followUps, now }: { followUps: Client[]; now: number }) {
  return (
    <section className="min-w-0">
      <SectionHeading count={followUps.length}>Upcoming follow-ups</SectionHeading>
      {followUps.length ? (
        <ul className="card divide-y divide-[var(--s-border)] overflow-hidden p-0">
          {followUps.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/clients/${c.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-[var(--s-hover)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[var(--s-text)]">{c.name}</p>
                  <p className="truncate text-xs text-[var(--s-muted)]">{requirementSummary(c)}</p>
                </div>
                <ClientStatusBadge status={c.status} />
                <span className="text-sm whitespace-nowrap">
                  <FollowUp at={c.next_follow_up} now={now} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No follow-ups scheduled.</Empty>
      )}
    </section>
  );
}

function Glance({ rows }: { rows: { label: string; value: number; href: string; bad?: boolean }[] }) {
  return (
    <div className="card p-6">
      <p className="mb-3 text-xl font-extrabold tracking-tight text-[var(--s-text)]">At a glance</p>
      <ul className="-mx-2">
        {rows.map((r) => (
          <li key={r.label}>
            <Link
              href={r.href}
              className="flex items-baseline gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-[var(--s-text-2)] transition-colors hover:bg-[var(--s-hover)] hover:text-[var(--brand)]"
            >
              <span>{r.label}</span>
              <span className="flex-1 translate-y-[-3px] border-b border-dotted border-[var(--s-border)]" aria-hidden />
              <span className={`font-extrabold tabular-nums ${r.bad && r.value > 0 ? "text-[var(--s-late)]" : "text-[var(--s-text)]"}`}>{r.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pipeline({ byStatus }: { byStatus: { status: Client["status"]; n: number }[] }) {
  const total = byStatus.reduce((a, r) => a + r.n, 0);
  const count = (s: Client["status"]) => byStatus.find((r) => r.status === s)?.n ?? 0;
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-xl font-extrabold tracking-tight text-[var(--s-text)]">Pipeline</p>
        <p className="text-sm font-bold text-[var(--s-muted)] tabular-nums">{total} clients</p>
      </div>
      <div className="flex h-2 gap-1 overflow-hidden rounded-full bg-[var(--s-seg)]">
        {total > 0 &&
          CLIENT_STATUSES.map((s) => {
            const n = count(s.value);
            return n ? (
              <div
                key={s.value}
                className={`${s.color.split(" ")[1]} rounded-full bg-current opacity-70`}
                style={{ width: `${(n / total) * 100}%` }}
                title={`${s.label}: ${n}`}
              />
            ) : null;
          })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] font-semibold text-[var(--s-text-2)]">
        {CLIENT_STATUSES.map((s) => (
          <Link key={s.value} href={`/admin/clients?tab=${s.value}`} className="inline-flex items-center gap-1.5 hover:text-[var(--brand)]">
            <span className={`size-2 rounded-full bg-current opacity-70 ${s.color.split(" ")[1]}`} />
            {s.label}
            <span className="ml-auto font-extrabold text-[var(--s-text)] tabular-nums">{count(s.value)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
