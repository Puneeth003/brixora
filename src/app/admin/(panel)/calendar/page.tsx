import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientScope } from "@/lib/crm";
import { displayPhone } from "@/lib/format";
import { nowMs } from "@/lib/time";
import { Empty, PageHeader, StatCard, Tabs } from "@/components/admin/ui";
import { ClientStatusBadge, requirementSummary } from "@/components/crm/ClientBadges";
import type { Client } from "@/lib/types";

export const metadata: Metadata = { title: "Calendar" };

// All day maths happens on "IST-shifted" milliseconds: real UTC ms + 5:30, read back
// with the getUTC* methods, so day buckets follow India time whatever the server zone.
const IST = 5.5 * 60 * 60 * 1000;
const DAY = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Row = Pick<
  Client,
  "id" | "name" | "phone" | "status" | "type" | "listing_type" | "bedrooms" | "budget_min" | "budget_max" | "localities" | "next_follow_up"
> & { agent_name: string | null; agent_email: string | null };

/** Real UTC ms → "YYYY-MM-DD" of that instant in India. */
function istDayKey(ms: number) {
  return new Date(ms + IST).toISOString().slice(0, 10);
}

/** Real UTC ms of midnight (India) on the day containing `ms`. */
function istMidnight(ms: number) {
  const shifted = ms + IST;
  return shifted - (((shifted % DAY) + DAY) % DAY) - IST;
}

const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const monthFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
const todayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });

function fmtTime(iso: string) {
  return timeFmt.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => m.trim().toLowerCase());
}

function monthKey(y: number, m0: number) {
  const d = new Date(Date.UTC(y, m0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const staff = await requireStaff();
  await connection();
  const sp = await searchParams;
  const view = sp.view === "agenda" ? "agenda" : "month";
  const isAdmin = staff.role === "admin";

  const now = nowMs();
  const todayStart = istMidnight(now);
  const tomorrowStart = todayStart + DAY;
  const dayAfterStart = todayStart + 2 * DAY;
  const weekEnd = todayStart + 7 * DAY;
  const todayKey = istDayKey(now);

  // Month being shown (IST calendar month).
  const nowIst = new Date(now + IST);
  let year = nowIst.getUTCFullYear();
  let month0 = nowIst.getUTCMonth();
  const mParam = typeof sp.month === "string" ? sp.month : "";
  const mMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mParam);
  if (mMatch) {
    year = Number(mMatch[1]);
    month0 = Number(mMatch[2]) - 1;
  }
  const firstShifted = Date.UTC(year, month0, 1);
  const lead = (new Date(firstShifted).getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cellCount = Math.ceil((lead + daysInMonth) / 7) * 7;
  const gridStartShifted = firstShifted - lead * DAY;
  const gridStart = gridStartShifted - IST;
  const gridEnd = gridStart + cellCount * DAY;

  const scope = clientScope(staff);
  const base = `FROM clients c LEFT JOIN users u ON u.id = c.assigned_to
     WHERE ${scope.sql} AND c.status NOT IN ('won', 'lost') AND c.next_follow_up IS NOT NULL`;

  // One query for the visible range: the month grid, or (agenda) everything up to ~2 months out.
  const rangeSql =
    view === "month" ? "AND c.next_follow_up >= ? AND c.next_follow_up < ?" : "AND c.next_follow_up < ?";
  const rangeValues = view === "month" ? [new Date(gridStart), new Date(gridEnd)] : [new Date(todayStart + 60 * DAY)];

  const [rows, stats] = await Promise.all([
    db.all<Row>(
      `SELECT c.id, c.name, c.phone, c.status, c.type, c.listing_type, c.bedrooms, c.budget_min, c.budget_max,
              c.localities, c.next_follow_up, u.name AS agent_name, u.email AS agent_email
         ${base} ${rangeSql}
        ORDER BY c.next_follow_up ASC LIMIT 500`,
      [...scope.values, ...rangeValues],
    ),
    db.one<{ overdue: number | null; today: number | null; week: number | null }>(
      `SELECT SUM(c.next_follow_up < ?) AS overdue,
              SUM(c.next_follow_up >= ? AND c.next_follow_up < ?) AS today,
              SUM(c.next_follow_up >= ? AND c.next_follow_up < ?) AS week
         ${base}`,
      [new Date(now), new Date(now), new Date(tomorrowStart), new Date(now), new Date(weekEnd), ...scope.values],
    ),
  ]);
  const overdue = Number(stats?.overdue ?? 0);
  const dueToday = Number(stats?.today ?? 0);
  const dueWeek = Number(stats?.week ?? 0);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(view === "agenda" ? { view } : {}), ...(mMatch ? { month: mParam } : {}), ...extra });
    const s = p.toString();
    return `/admin/calendar${s ? `?${s}` : ""}`;
  };
  const currentMonthKey = monthKey(year, month0);

  return (
    <>
      <PageHeader
        eyebrow={todayFmt.format(new Date(now))}
        title="Calendar"
        description={isAdmin ? "Follow-ups for every open client." : "Follow-ups for your open clients."}
        actions={
          <Link href="/admin/clients?tab=due" className="btn-secondary px-4 py-2 text-sm">
            Follow-ups due
          </Link>
        }
      />

      <div className="s-stats mb-7">
        <StatCard label="Overdue" value={overdue} tone={overdue > 0 ? "bad" : "default"} href="/admin/calendar?view=agenda" />
        <StatCard label="Today" value={dueToday} />
        <StatCard label="This week" value={dueWeek} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Tabs
          active={view}
          tabs={[
            { key: "month", label: "Month", href: mMatch ? `/admin/calendar?month=${mParam}` : "/admin/calendar" },
            { key: "agenda", label: "Agenda", href: "/admin/calendar?view=agenda" },
          ]}
        />
        {view === "month" && (
          <div className="mb-5 flex items-center gap-2">
            <Link href={qs({ month: monthKey(year, month0 - 1) })} aria-label="Previous month" className="btn-secondary px-3 py-1.5 text-sm">
              ‹
            </Link>
            <Link href="/admin/calendar" className="btn-secondary px-3.5 py-1.5 text-sm">
              Today
            </Link>
            <Link href={qs({ month: monthKey(year, month0 + 1) })} aria-label="Next month" className="btn-secondary px-3 py-1.5 text-sm">
              ›
            </Link>
          </div>
        )}
      </div>

      {view === "month" ? (
        <MonthGrid
          rows={rows}
          title={monthFmt.format(new Date(firstShifted))}
          monthKey={currentMonthKey}
          gridStartShifted={gridStartShifted}
          cellCount={cellCount}
          todayKey={todayKey}
          now={now}
        />
      ) : (
        <Agenda
          rows={rows}
          now={now}
          isAdmin={isAdmin}
          bounds={{ tomorrowStart, dayAfterStart, weekEnd }}
        />
      )}
    </>
  );
}

function MonthGrid({
  rows,
  title,
  monthKey: mk,
  gridStartShifted,
  cellCount,
  todayKey,
  now,
}: {
  rows: Row[];
  title: string;
  monthKey: string;
  gridStartShifted: number;
  cellCount: number;
  todayKey: string;
  now: number;
}) {
  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.next_follow_up) continue;
    const key = istDayKey(new Date(r.next_follow_up).getTime());
    const list = byDay.get(key);
    if (list) list.push(r);
    else byDay.set(key, [r]);
  }

  const cells = Array.from({ length: cellCount }, (_, i) => {
    const key = new Date(gridStartShifted + i * DAY).toISOString().slice(0, 10);
    return { key, day: Number(key.slice(8, 10)), inMonth: key.startsWith(mk), items: byDay.get(key) ?? [] };
  });

  return (
    <div className="card overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <h2 className="text-lg font-extrabold tracking-tight text-[var(--s-text)]">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-[var(--s-border)] px-3 pb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 text-xs font-bold text-[var(--s-muted)]">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-[var(--s-border)]">
            {cells.map((c) => {
              const isToday = c.key === todayKey;
              const extra = c.items.length - 3;
              return (
                <div key={c.key} className={`min-h-[112px] p-2 ${c.inMonth ? "bg-white" : "bg-[var(--s-bg)]"}`}>
                  <div className="mb-1.5 flex justify-end">
                    <span
                      className={`grid size-7 place-items-center rounded-full text-[13px] font-bold tabular-nums ${
                        isToday
                          ? "bg-[var(--s-brand-soft)] text-[var(--brand)] ring-2 ring-[var(--brand)]"
                          : c.inMonth
                            ? "text-[var(--s-text-2)]"
                            : "text-[var(--s-muted)] opacity-60"
                      }`}
                    >
                      {c.day}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {c.items.slice(0, 3).map((r) => {
                      const late = new Date(r.next_follow_up!).getTime() < now;
                      return (
                        <Link
                          key={r.id}
                          href={`/admin/clients/${r.id}`}
                          title={`${r.name} · ${fmtTime(r.next_follow_up!)}`}
                          className={`flex items-center gap-1.5 truncate rounded-lg px-2 py-1 text-[12.5px] transition-colors ${
                            late
                              ? "bg-[color-mix(in_srgb,var(--s-late)_9%,#fff)] text-[var(--s-late)]"
                              : "bg-[var(--s-brand-soft)] text-[var(--s-text)] hover:text-[var(--brand)]"
                          } ${c.inMonth ? "" : "opacity-60"}`}
                        >
                          <span className="shrink-0 font-bold tabular-nums">{fmtTime(r.next_follow_up!)}</span>
                          <span className="truncate font-semibold">{r.name}</span>
                        </Link>
                      );
                    })}
                    {extra > 0 && (
                      <Link href="/admin/calendar?view=agenda" className="block px-2 text-xs font-bold text-[var(--s-muted)] hover:text-[var(--brand)]">
                        +{extra} more
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Agenda({
  rows,
  now,
  isAdmin,
  bounds,
}: {
  rows: Row[];
  now: number;
  isAdmin: boolean;
  bounds: { tomorrowStart: number; dayAfterStart: number; weekEnd: number };
}) {
  const sections: { key: string; title: string; late?: boolean; items: Row[] }[] = [
    { key: "overdue", title: "Overdue", late: true, items: [] },
    { key: "today", title: "Today", items: [] },
    { key: "tomorrow", title: "Tomorrow", items: [] },
    { key: "week", title: "This week", items: [] },
    { key: "later", title: "Later", items: [] },
  ];
  for (const r of rows) {
    const t = new Date(r.next_follow_up!).getTime();
    const i = t < now ? 0 : t < bounds.tomorrowStart ? 1 : t < bounds.dayAfterStart ? 2 : t < bounds.weekEnd ? 3 : 4;
    sections[i].items.push(r);
  }
  const visible = sections.filter((s) => s.items.length);
  if (!visible.length) return <Empty>No follow-ups scheduled. Set one from a client&apos;s page.</Empty>;

  return (
    <div className="space-y-8">
      {visible.map((s) => (
        <section key={s.key}>
          <h2 className={`mb-3 flex items-center gap-2 text-base font-extrabold tracking-tight ${s.late ? "text-[var(--s-late)]" : "text-[var(--s-text)]"}`}>
            {s.title}
            <span
              className={`rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${
                s.late ? "bg-[color-mix(in_srgb,var(--s-late)_10%,#fff)]" : "bg-[var(--s-seg)] text-[var(--s-text-2)]"
              }`}
            >
              {s.items.length}
            </span>
          </h2>
          <div className="card divide-y divide-[var(--s-border)] overflow-hidden">
            {s.items.map((r) => (
              <Link
                key={r.id}
                href={`/admin/clients/${r.id}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-[var(--s-hover)] sm:flex-nowrap"
              >
                <div
                  className={`w-28 shrink-0 text-sm font-bold tabular-nums ${s.late ? "text-[var(--s-late)]" : "text-[var(--s-text)]"}`}
                >
                  {s.key === "today" || s.key === "tomorrow" ? fmtTime(r.next_follow_up!) : dateTimeFmt.format(new Date(r.next_follow_up!))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-[var(--s-text)]">{r.name}</div>
                  <div className="truncate text-[13px] text-[var(--s-muted)]">
                    {displayPhone(r.phone)} · {requirementSummary(r)}
                  </div>
                </div>
                {isAdmin && (
                  <div className="hidden w-36 shrink-0 truncate text-[13px] text-[var(--s-text-2)] md:block">
                    {r.agent_name ?? r.agent_email ?? <span className="font-semibold text-amber-700">Unassigned</span>}
                  </div>
                )}
                <div className="shrink-0">
                  <ClientStatusBadge status={r.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
