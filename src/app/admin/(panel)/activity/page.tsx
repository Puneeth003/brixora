import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ACTION_FILTERS,
  KINDS,
  PERIODS,
  feedRange,
  filterQuery,
  groupBursts,
  isFiltered,
  istDayKey,
  parseFeedFilters,
  periodStart,
  toQueryString,
  type FeedFilters,
} from "@/lib/activity-feed";
import { ACTIVITY_TYPES, label } from "@/lib/crm-constants";
import { formatDateTime } from "@/lib/format";
import { nowMs, startOfTodayIstIso } from "@/lib/time";
import { Empty, PageHeader, StatCard } from "@/components/admin/ui";
import { Pagination } from "@/components/Pagination";
import {
  activeStaffSince,
  agentStats,
  CONTACT_TYPES,
  countFeed,
  describe,
  DOT,
  feedPage,
  initials,
  istDateTime,
  topPerformers,
  wonSince,
  type Entry,
  type FeedOpts,
} from "./feed";

export const metadata: Metadata = { title: "Activity" };

const PER_PAGE = 50;
const DAY_MS = 86_400_000;

function dayHeading(iso: string, todayKey: string, yesterdayKey: string) {
  const key = istDayKey(new Date(iso).getTime());
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

function istTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireAdmin();
  await connection();
  const sp = await searchParams;

  const staff = await db.all<{ id: string; name: string | null; email: string | null; is_active: boolean }>(
    "SELECT id, name, email, is_active FROM users WHERE role IN ('admin', 'agent') ORDER BY is_active DESC, name",
  );
  const filters = parseFeedFilters(sp, (id) => staff.some((s) => s.id === id));
  const selected = staff.find((s) => s.id === filters.person) ?? null;
  const feedOpts: FeedOpts = {
    kind: filters.kind,
    person: filters.person || undefined,
    action: filters.action || undefined,
    q: filters.q || undefined,
    ...feedRange(filters),
  };

  const now = nowMs();
  const todayIso = startOfTodayIstIso();
  const weekIso = periodStart("week", now);
  const monthIso = periodStart("month", now);
  const periodIso = periodStart(filters.period, now);
  const period = PERIODS.find((p) => p.value === filters.period) ?? PERIODS[1];

  const [feed, performers, agent, team] = await Promise.all([
    feedPage(feedOpts, PER_PAGE, (filters.page - 1) * PER_PAGE),
    topPerformers(periodIso),
    selected ? agentStats(selected.id, periodIso) : null,
    // The team cards are replaced by one person's figures when a person is selected.
    selected
      ? null
      : Promise.all([
          db.count("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'agent') AND is_active = 1"),
          activeStaffSince(todayIso),
          countFeed({ kind: "all", since: todayIso, staffOnly: true, noSignIns: true }),
          countFeed({ kind: "all", since: weekIso, staffOnly: true, noSignIns: true }),
          wonSince(monthIso),
        ]),
  ]);
  const pages = Math.max(1, Math.ceil(feed.total / PER_PAGE));
  const maxTouches = Math.max(1, ...performers.map((p) => p.touches));

  const todayKey = istDayKey(now);
  const yesterdayKey = istDayKey(now - DAY_MS);

  // Group consecutive rows by IST day (rows are already newest first).
  const groups: { heading: string; items: { id: string; at: string; entry: Entry }[] }[] = [];
  for (const { row, count } of groupBursts(feed.rows)) {
    const heading = dayHeading(row.created_at, todayKey, yesterdayKey);
    const last = groups[groups.length - 1];
    const item = { id: `${row.src}-${row.id}`, at: row.created_at, entry: describe(row, count) };
    if (last?.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }

  const filtered = isFiltered(filters);
  const query = filterQuery(filters);

  return (
    <>
      <PageHeader
        title="Activity"
        description="What the team has been doing across clients and listings."
        count={feed.total}
        actions={
          <div className="flex items-center gap-2">
            <a href={`/admin/activity/export${toQueryString(query)}`} className="btn-secondary" title="A formatted Excel report of the entries matching the filters below">
              Export Excel
            </a>
            <a href={`/admin/activity/export${toQueryString({ ...query, format: "csv" })}`} className="btn-ghost" title="The same entries as plain CSV, for other tools">
              CSV
            </a>
          </div>
        }
      />

      {/* Keyed on the filters: the fields are uncontrolled, so a link that changes the filters must remount them. */}
      <form key={toQueryString(query)} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[200px] flex-[2]">
          <span className="label">Search</span>
          <input name="q" type="search" defaultValue={filters.q} maxLength={80} placeholder="Client, listing reference or user" className="input" />
        </label>
        <label className="min-w-[150px] flex-1">
          <span className="label">Person</span>
          <select name="person" defaultValue={filters.person} className="input">
            <option value="">Everyone</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.email}
                {s.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[150px] flex-1">
          <span className="label">Area</span>
          <select name="kind" defaultValue={filters.kind} className="input">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[170px] flex-1">
          <span className="label">Action</span>
          <select name="action" defaultValue={filters.action} className="input">
            <option value="">Any action</option>
            {ACTION_FILTERS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">From</span>
          <input name="from" type="date" defaultValue={filters.from} max={todayKey} className="input" />
        </label>
        <label>
          <span className="label">To</span>
          <input name="to" type="date" defaultValue={filters.to} max={todayKey} className="input" />
        </label>
        {filters.period !== "month" && <input type="hidden" name="period" value={filters.period} />}
        <div className="flex items-center gap-2">
          <button className="btn-primary">Filter</button>
          {filtered && (
            <Link href={`/admin/activity${toQueryString({ period: query.period })}`} className="btn-ghost">
              Clear
            </Link>
          )}
        </div>
      </form>

      {selected && agent ? (
        <section aria-label={`${selected.name ?? selected.email}'s performance`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-extrabold tracking-tight text-[var(--s-text)]">
              {selected.name ?? selected.email} <span className="font-semibold text-[var(--s-muted)]">· {period.phrase}</span>
            </h2>
            <PeriodSwitch filters={filters} />
          </div>
          <div className="s-stats">
            <StatCard label="Client contacts" value={agent.contacts} />
            <StatCard label="Clients won" value={agent.won} />
            <StatCard label="Open clients now" value={agent.openClients} />
            <StatCard label="Listing actions" value={agent.listingActions} />
            <StatCard label="Last active" value={agent.lastActiveAt ? istDateTime(agent.lastActiveAt) : "Never"} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-[var(--s-muted)]">
            {[...CONTACT_TYPES, "note" as const].map((t) => `${label(ACTIVITY_TYPES, t)} ${agent.byType[t] ?? 0}`).join(" · ")}
          </p>
        </section>
      ) : team ? (
        <div className="s-stats">
          <StatCard label="Team members" value={team[0]} href="/admin/agents" />
          <StatCard label="Active today" value={team[1]} />
          <StatCard label="Actions today" value={team[2]} />
          <StatCard label="This week" value={team[3]} />
          <StatCard label="Clients won this month" value={team[4]} href="/admin/clients?tab=won" />
        </div>
      ) : null}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card p-5 sm:p-6">
          {groups.length ? (
            groups.map((g) => (
              <div key={g.heading} className="mb-6 last:mb-0">
                <h2 className="mb-3 text-[13px] font-bold tracking-wide text-[var(--s-muted)] uppercase">{g.heading}</h2>
                <ol className="relative ml-[15px] border-l border-[var(--s-border)]">
                  {g.items.map(({ id, at, entry }) => (
                    <FeedItem key={id} at={at} entry={entry} />
                  ))}
                </ol>
              </div>
            ))
          ) : (
            <Empty>{filtered ? "No activity matches these filters." : "No activity yet."}</Empty>
          )}
          <Pagination page={filters.page} pages={pages} basePath="/admin/activity" params={query} />
        </section>

        <aside className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold tracking-tight text-[var(--s-text)]">Top performers</h2>
            <PeriodSwitch filters={filters} />
          </div>
          <p className="mt-1 mb-4 text-xs text-[var(--s-muted)]">Client calls, meetings, visits and messages {period.phrase}</p>
          {performers.length ? (
            <ol className="space-y-4">
              {performers.map((p, i) => (
                <li key={p.id}>
                  <Link href={`/admin/activity${toQueryString({ person: p.id, period: query.period })}`} className="flex items-center gap-3">
                    <Avatar name={p.name ?? p.email} kind={i === 0 ? "brand" : "staff"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-[var(--s-text)]">{p.name ?? p.email}</span>
                        <span className="text-xs font-bold text-[var(--s-text-2)] tabular-nums">{p.touches}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--s-seg)]">
                        <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.round((p.touches / maxTouches) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-[var(--s-muted)]">{p.won ? `${p.won} won` : "No wins yet"}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[var(--s-muted)]">No client activity logged {period.phrase} yet.</p>
          )}
        </aside>
      </div>
    </>
  );
}

/** Week / Month / Quarter links for the performance figures; the feed filters are kept. */
function PeriodSwitch({ filters }: { filters: FeedFilters }) {
  return (
    <div className="inline-flex rounded-xl bg-[var(--s-seg)] p-0.5 text-xs font-bold" role="group" aria-label="Period">
      {PERIODS.map((p) => {
        const active = p.value === filters.period;
        return (
          <Link
            key={p.value}
            href={`/admin/activity${toQueryString(filterQuery(filters, { period: p.value }))}`}
            aria-current={active ? "true" : undefined}
            className={active ? "rounded-[10px] bg-white px-2.5 py-1 text-[var(--s-text)] shadow-sm" : "px-2.5 py-1 text-[var(--s-muted)] hover:text-[var(--s-text)]"}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

function Avatar({ name, kind }: { name: string | null; kind: "staff" | "brand" | "owner" | "system" | "client" }) {
  const cls =
    kind === "brand"
      ? "bg-[var(--brand)] text-white"
      : kind === "staff"
        ? "bg-[var(--s-brand-soft)] text-[var(--brand)]"
        : kind === "system"
          ? "bg-zinc-800 text-white"
          : kind === "owner"
            ? "bg-amber-100 text-amber-800"
            : "bg-sky-100 text-sky-800";
  return (
    <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${cls}`} aria-hidden>
      {kind === "system" ? "S" : initials(name)}
    </span>
  );
}

function FeedItem({ at, entry }: { at: string; entry: Entry }) {
  const target = entry.target ? (
    entry.href ? (
      <Link href={entry.href} className="font-bold text-[var(--s-text)] hover:text-[var(--brand)] hover:underline">
        {entry.target}
      </Link>
    ) : (
      <span className="font-bold text-[var(--s-text)]">{entry.target}</span>
    )
  ) : null;
  const actor =
    !entry.target && entry.href ? (
      <Link href={entry.href} className="font-bold text-[var(--s-text)] hover:text-[var(--brand)] hover:underline">
        {entry.actor}
      </Link>
    ) : (
      <span className="font-bold text-[var(--s-text)]">{entry.actor}</span>
    );

  return (
    <li className="relative pb-4 pl-6 last:pb-0">
      <span className={`absolute top-3 -left-[5px] size-[9px] rounded-full ring-4 ring-white ${DOT[entry.tone] ?? "bg-zinc-400"}`} aria-hidden />
      <div className="flex items-start gap-3">
        <Avatar name={entry.actor} kind={entry.actorKind} />
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-sm leading-snug text-[var(--s-text-2)]">
            {actor} {entry.verb} {target}
            {entry.actorKind === "owner" && <span className="ml-1.5 rounded bg-[var(--s-seg)] px-1.5 py-px text-[10px] font-bold text-[var(--s-muted)]">Owner</span>}
            {entry.sub && <span className="text-[var(--s-muted)]"> · {entry.sub}</span>}
          </p>
          {entry.excerpt && <p className="mt-1 text-[13px] leading-snug text-[var(--s-muted)]">{entry.excerpt}</p>}
        </div>
        <time dateTime={at} title={formatDateTime(at)} className="shrink-0 pt-1 text-xs font-semibold whitespace-nowrap text-[var(--s-muted)] tabular-nums">
          {istTime(at)}
        </time>
      </div>
    </li>
  );
}
