import Link from "next/link";
import { connection } from "next/server";
import { requireStaff, type Staff } from "@/lib/auth";
import { clientScope, newMatchesFor } from "@/lib/crm";
import { NEW_MATCH_DAYS } from "@/lib/match";
import { requirementSummary } from "@/components/crm/ClientBadges";
import { ShareListingActions } from "@/components/crm/MatchActions";
import { ACTIVITY_TYPES, CLIENT_STATUSES, label } from "@/lib/crm-constants";
import type { Client, ClientActivityType, Property } from "@/lib/types";
import { db } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { istHour, nowMs, startOfMonthIst, startOfTodayIstIso } from "@/lib/time";
import { Empty } from "@/components/admin/ui";
import { PropertyStatusBadge } from "@/components/StatusBadge";

// Dashboard: welcome banner, four quick numbers, the client pipeline (donut) and, on
// the right, "My activity": upcoming follow-ups, site visits and the latest activity.
// Admins see everything; agents see their own clients and visits.

const IST = "Asia/Kolkata";
const STATUS_HEX: Record<Client["status"], string> = {
  new: "#3b82f6",
  contacted: "#6366f1",
  site_visit: "#8b5cf6",
  negotiation: "#f59e0b",
  won: "#10b981",
  lost: "#a1a1aa",
};

function greeting() {
  const h = istHour();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Welcome back";
}

/** "You have 4 listings to review and 4 follow-ups due today." (zero counts are left out) */
function summarize(items: [number, string, string, string][]) {
  const parts = items.filter(([n]) => n > 0).map(([n, one, many, tail]) => `${n} ${n === 1 ? one : many}${tail ? ` ${tail}` : ""}`);
  if (!parts.length) return "You're all caught up. Nothing needs your attention right now.";
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `You have ${list}.`;
}

const initialsOf = (name: string | null | undefined) =>
  (name ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "•";

export default async function DashboardPage() {
  const staff = await requireStaff();
  await connection();
  const isAdmin = staff.role === "admin";
  const crm = await loadCrm(staff);
  const matches = await newMatchesFor(staff, crm.now);

  type QueueRow = Pick<Property, "id" | "reference_no" | "title" | "status" | "price" | "listing_type" | "locality" | "submitted_at">;
  const [pending, live, queue] = isAdmin
    ? await Promise.all([
        db.count("SELECT COUNT(*) FROM properties WHERE status IN ('pending', 'under_review')"),
        db.count("SELECT COUNT(*) FROM properties WHERE status = 'approved'"),
        db.all<QueueRow>(
          `SELECT id, reference_no, title, status, price, listing_type, locality, submitted_at FROM properties
            WHERE status IN ('pending', 'under_review') ORDER BY submitted_at ASC LIMIT 5`,
        ),
      ])
    : [0, 0, [] as QueueRow[]];

  const stats = isAdmin
    ? [
        { label: "To review", value: pending, href: "/admin/submissions", icon: ICONS.inbox },
        { label: "Live listings", value: live, href: "/admin/listings", icon: ICONS.home },
        { label: "Open clients", value: crm.openCount, href: "/admin/clients", icon: ICONS.users },
        { label: "Site visits", value: crm.visitsOpen, href: "/admin/verifications", icon: ICONS.shield },
      ]
    : [
        { label: "Due today", value: crm.due, href: "/admin/clients?tab=due", icon: ICONS.clock },
        { label: "New leads", value: crm.fresh, href: "/admin/clients?tab=new", icon: ICONS.star },
        { label: "Open clients", value: crm.openCount, href: "/admin/clients", icon: ICONS.users },
        { label: "Site visits", value: crm.visitsOpen, href: "/admin/verifications", icon: ICONS.shield },
      ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">Dashboard</h1>

        <section className="admin-hero-gold flex items-center gap-6">
          <div className="relative min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-[26px]">
              {greeting()}
              {staff.name ? `, ${staff.name.split(" ")[0]}` : ""}!
            </h2>
            <p className="mt-1.5 max-w-lg text-sm text-white/85">
              {summarize(
                isAdmin
                  ? [
                      [pending, "listing", "listings", "to review"],
                      [crm.due, "follow-up", "follow-ups", "due today"],
                      [crm.unread, "unread message", "unread messages", ""],
                    ]
                  : [
                      [crm.due, "follow-up", "follow-ups", "due today"],
                      [crm.fresh, "new lead", "new leads", "to call"],
                      [crm.unread, "unread message", "unread messages", ""],
                    ],
              )}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {(isAdmin
                ? [
                    { href: "/admin/submissions", label: "Review submissions" },
                    { href: "/admin/clients/new", label: "Add client" },
                  ]
                : [
                    { href: "/admin/clients/new", label: "Add client" },
                    { href: "/admin/calendar", label: "Open calendar" },
                  ]
              ).map((a) => (
                <Link key={a.href} href={a.href} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#1c1a14] shadow-sm transition hover:bg-white/90">
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="relative hidden size-28 shrink-0 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/30 sm:flex">
            <span className="flex size-[88px] items-center justify-center rounded-full bg-white text-3xl font-extrabold text-[var(--accent)]">
              {initialsOf(staff.name ?? staff.email)}
            </span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="card flex items-center gap-3.5 p-4 transition hover:shadow-[var(--s-shadow-lg)]">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,white)] text-[var(--accent)]">
                {s.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xl leading-tight font-extrabold tabular-nums">{s.value}</span>
                <span className="block truncate text-xs font-semibold text-[var(--s-muted)]">{s.label}</span>
              </span>
            </Link>
          ))}
        </div>

        <PipelineCard byStatus={crm.byStatus} />

        <section className="card p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              New matches
              {matches.total > 0 && <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold tabular-nums">{matches.total}</span>}
            </h2>
            <p className="text-xs text-[var(--s-muted)]">
              Listings approved in the last {NEW_MATCH_DAYS} days that suit {isAdmin ? "a client" : "your clients"}
            </p>
          </div>
          {matches.rows.length ? (
            <ul className="divide-y divide-[var(--s-border)]">
              {matches.rows.map(({ client, listing, preferred }) => (
                <li key={`${client.id}:${listing.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="truncate text-sm">
                      <Link href={`/admin/clients/${client.id}`} className="font-bold hover:text-[var(--brand)]">
                        {client.name}
                      </Link>
                      <span className="text-[var(--s-muted)]"> · {requirementSummary(client)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--s-muted)]">
                      <Link href={`/properties/${listing.reference_no}`} target="_blank" className="font-bold text-[var(--brand)] hover:underline">
                        {listing.title}
                      </Link>{" "}
                      · {formatPrice(listing.price, listing.listing_type)} · {listing.locality}
                      {isAdmin && ` · ${client.agent_name ?? "Unassigned"}`}
                    </p>
                    {preferred && <span className="badge mt-1.5 bg-[var(--s-brand-soft)] text-[var(--brand)]">Preferred area</span>}
                  </div>
                  <ShareListingActions client={client} listing={listing} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No new matches. They appear here when a newly approved listing fits a client&apos;s requirements.</Empty>
          )}
          {matches.total > matches.rows.length && (
            <p className="mt-4 text-xs text-[var(--s-muted)]">
              Showing {matches.rows.length} of {matches.total}. Mark matches as shared to see the rest.
            </p>
          )}
        </section>

        {isAdmin && (
          <section className="card p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold tracking-tight">Review queue</h2>
              <Link href="/admin/submissions" className="text-sm font-bold text-[var(--accent)] hover:underline">
                View all
              </Link>
            </div>
            {queue.length ? (
              <ul className="-mx-2 divide-y divide-[var(--s-border)]">
                {queue.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/properties/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3 hover:bg-[var(--s-hover)]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{p.title}</p>
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
        )}
      </div>

      <aside className="min-w-0 space-y-6 rounded-[24px] bg-[#f6efe3] p-5 sm:p-6">
        <h2 className="text-[26px] font-extrabold tracking-tight">My activity</h2>

        <ActivitySection title="Upcoming follow-ups" href="/admin/calendar" empty="No follow-ups scheduled.">
          {crm.followUps.map((c) => (
            <DateRow
              key={c.id}
              href={`/admin/clients/${c.id}`}
              at={c.next_follow_up!}
              overdue={new Date(c.next_follow_up!).getTime() < crm.now}
              title={c.name}
              sub={`${timeOf(c.next_follow_up!)} · ${label(CLIENT_STATUSES, c.status)}`}
            />
          ))}
        </ActivitySection>

        <ActivitySection title="Upcoming site visits" href="/admin/verifications" empty="No site visits booked.">
          {crm.visits.map((v) => (
            <DateRow
              key={v.id}
              href={`/admin/verifications/${v.id}`}
              at={v.scheduled_at}
              overdue={new Date(v.scheduled_at).getTime() < crm.now}
              title={v.title}
              sub={`${timeOf(v.scheduled_at)} · ${v.reference_no}${isAdmin && v.assignee ? ` · ${v.assignee}` : ""}`}
            />
          ))}
        </ActivitySection>

        <ActivitySection title="Latest activity" href={isAdmin ? "/admin/activity" : "/admin/clients"} empty="Nothing logged yet.">
          {crm.recent.map((a) => (
            <Link key={a.id} href={`/admin/clients/${a.client_id}`} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-sm transition hover:shadow-md">
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,white)] text-xs font-extrabold text-[#7a5d1f]">
                {initialsOf(a.actor_name ?? a.client_name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{a.actor_name ?? a.client_name}</span>
                <span className="block truncate text-xs text-[var(--s-muted)]">
                  {label(ACTIVITY_TYPES, a.type)} · {a.client_name}
                </span>
              </span>
            </Link>
          ))}
        </ActivitySection>
      </aside>
    </div>
  );
}

/** Follow-ups, pipeline, visits and recent activity: everyone's for admins, an agent's own otherwise. */
async function loadCrm(staff: Staff) {
  const scope = clientScope(staff);
  const now = nowMs();
  const endOfToday = new Date(new Date(startOfTodayIstIso()).getTime() + 86_400_000);
  const monthStart = startOfMonthIst();
  const open = "c.status NOT IN ('won', 'lost')";
  const mineVisit = staff.role === "admin" ? "" : " AND v.assigned_to = ?";
  const visitArgs = staff.role === "admin" ? [] : [staff.userId];

  const [due, fresh, openCount, wonMonth, unread, byStatus, followUps, visitsOpen, visits, recent] = await Promise.all([
    db.count(`SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND ${open} AND c.next_follow_up < ?`, [...scope.values, endOfToday]),
    db.count(`SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND c.status = 'new'`, scope.values),
    db.count(`SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND ${open}`, scope.values),
    db.count(`SELECT COUNT(*) FROM clients c WHERE ${scope.sql} AND c.status = 'won' AND c.updated_at >= ?`, [...scope.values, monthStart]),
    db.count(
      `SELECT COUNT(*) FROM enquiry_messages m JOIN enquiries e ON e.id = m.enquiry_id LEFT JOIN clients c ON c.id = e.client_id
        WHERE ${staff.role === "admin" ? "1 = 1" : scope.sql} AND m.sender = 'member' AND m.read_at IS NULL`,
      scope.values,
    ),
    db.all<{ status: Client["status"]; n: number }>(`SELECT c.status, COUNT(*) AS n FROM clients c WHERE ${scope.sql} GROUP BY c.status`, scope.values),
    db.all<Client>(
      `SELECT c.* FROM clients c WHERE ${scope.sql} AND ${open} AND c.next_follow_up IS NOT NULL ORDER BY c.next_follow_up ASC LIMIT 3`,
      scope.values,
    ),
    db.count(`SELECT COUNT(*) FROM site_verifications v WHERE v.status = 'scheduled'${mineVisit}`, visitArgs),
    db.all<{ id: string; scheduled_at: string; reference_no: string; title: string; assignee: string | null }>(
      `SELECT v.id, v.scheduled_at, p.reference_no, p.title, u.name AS assignee
         FROM site_verifications v JOIN properties p ON p.id = v.property_id LEFT JOIN users u ON u.id = v.assigned_to
        WHERE v.status = 'scheduled' AND v.scheduled_at IS NOT NULL${mineVisit}
        ORDER BY v.scheduled_at ASC LIMIT 3`,
      visitArgs,
    ),
    db.all<{ id: string; type: ClientActivityType; client_id: string; client_name: string; actor_name: string | null }>(
      `SELECT a.id, a.type, a.client_id, c.name AS client_name, u.name AS actor_name
         FROM client_activities a JOIN clients c ON c.id = a.client_id LEFT JOIN users u ON u.id = a.actor_id AND u.role IN ('admin', 'agent')
        WHERE ${scope.sql} ORDER BY a.created_at DESC LIMIT 3`,
      scope.values,
    ),
  ]);
  return { now, due, fresh, openCount, wonMonth, unread, byStatus, followUps, visitsOpen, visits, recent };
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit" });

function ActivitySection({ title, href, empty, children }: { title: string; href: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-[var(--s-text)]">{title}</h3>
        <Link href={href} className="text-xs font-bold text-[var(--accent)] hover:underline">
          View all
        </Link>
      </div>
      {children.length ? <div className="space-y-2.5">{children}</div> : <p className="rounded-2xl bg-white/60 px-4 py-3 text-xs text-[var(--s-muted)]">{empty}</p>}
    </section>
  );
}

/** Row with a small date badge (day + month), title and a time line. */
function DateRow({ href, at, title, sub, overdue }: { href: string; at: string; title: string; sub: string; overdue?: boolean }) {
  const d = new Date(at);
  const day = d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric" });
  const mon = d.toLocaleDateString("en-IN", { timeZone: IST, month: "short" });
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-sm transition hover:shadow-md">
      <span
        className={`flex size-10 shrink-0 flex-col items-center justify-center rounded-xl leading-none ${
          overdue ? "bg-red-50 text-red-600" : "bg-[color-mix(in_srgb,var(--accent)_14%,white)] text-[#7a5d1f]"
        }`}
      >
        <span className="text-sm font-extrabold">{day}</span>
        <span className="mt-0.5 text-[9px] font-bold uppercase">{mon}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className={`block truncate text-xs ${overdue ? "font-semibold text-red-600" : "text-[var(--s-muted)]"}`}>{overdue ? `Overdue · ${sub}` : sub}</span>
      </span>
    </Link>
  );
}

/** Donut of clients by pipeline stage, with a bar per stage beside it. */
function PipelineCard({ byStatus }: { byStatus: { status: Client["status"]; n: number }[] }) {
  const total = byStatus.reduce((a, r) => a + r.n, 0);
  const count = (s: Client["status"]) => byStatus.find((r) => r.status === s)?.n ?? 0;
  const max = Math.max(1, ...CLIENT_STATUSES.map((s) => count(s.value)));
  const R = 52;
  const C = 2 * Math.PI * R;
  const GAP = total > 1 ? 3 : 0;
  let offset = 0;

  return (
    <section className="card p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold tracking-tight">Client pipeline</h2>
        <p className="text-sm font-extrabold tabular-nums">{total} clients</p>
      </div>
      <div className="grid items-center gap-8 sm:grid-cols-[180px_1fr]">
        <div className="relative mx-auto size-[180px]">
          <svg viewBox="0 0 140 140" className="size-full -rotate-90" aria-label={`${total} clients by stage`}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--s-seg)" strokeWidth="18" />
            {total > 0 &&
              CLIENT_STATUSES.map((s) => {
                const n = count(s.value);
                if (!n) return null;
                const len = (n / total) * C;
                const seg = (
                  <circle
                    key={s.value}
                    cx="70"
                    cy="70"
                    r={R}
                    fill="none"
                    stroke={STATUS_HEX[s.value]}
                    strokeWidth="18"
                    strokeDasharray={`${Math.max(len - GAP, 0.5)} ${C}`}
                    strokeDashoffset={-offset}
                  >
                    <title>{`${s.label}: ${n}`}</title>
                  </circle>
                );
                offset += len;
                return seg;
              })}
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold tabular-nums">{total}</span>
            <span className="text-xs font-semibold text-[var(--s-muted)]">clients</span>
          </span>
        </div>
        <ul className="space-y-3.5">
          {CLIENT_STATUSES.map((s) => (
            <li key={s.value}>
              <Link href={`/admin/clients?tab=${s.value}`} className="group block">
                <span className="flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 group-hover:text-[var(--brand)]">
                    <span className="size-2.5 rounded-full" style={{ background: STATUS_HEX[s.value] }} />
                    {s.label}
                  </span>
                  <span className="font-extrabold tabular-nums">{count(s.value)}</span>
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-[var(--s-seg)]">
                  <span className="block h-full rounded-full" style={{ width: `${(count(s.value) / max) * 100}%`, background: STATUS_HEX[s.value] }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ICONS = {
  inbox: svg("M12 3v12m-5-5 5 5 5-5M5 21h14"),
  home: svg("M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6"),
  users: svg("M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6"),
  shield: svg("M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4"),
  clock: svg("M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"),
  star: svg("M12 3l2.2 5.6L20 9.3l-4.5 3.8 1.4 5.9L12 15.9 7.1 19l1.4-5.9L4 9.3l5.8-.7z"),
};
