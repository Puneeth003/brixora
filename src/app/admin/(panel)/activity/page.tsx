import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { nowMs, startOfMonthIst, startOfTodayIstIso } from "@/lib/time";
import { Empty, PageHeader, StatCard } from "@/components/admin/ui";
import { Pagination } from "@/components/Pagination";
import { activeStaffSince, countFeed, describe, DOT, feedPage, initials, topPerformers, WON_LIKE, type Entry, type Kind } from "./feed";

export const metadata: Metadata = { title: "Activity" };

const PER_PAGE = 50;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "crm", label: "Clients (CRM)" },
  { value: "listings", label: "Listings" },
];

/** "YYYY-MM-DD" of an instant, in India time. */
function istDayKey(ms: number) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function dayHeading(iso: string, todayKey: string, yesterdayKey: string) {
  const key = istDayKey(new Date(iso).getTime());
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

function istTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

/** Monday 00:00 of this week in India, as ISO. */
function startOfWeekIstIso(todayIso: string) {
  const today = new Date(todayIso).getTime();
  const weekday = new Date(today + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
  return new Date(today - ((weekday + 6) % 7) * DAY_MS).toISOString();
}

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireAdmin();
  await connection();
  const sp = await searchParams;

  const staff = await db.all<{ id: string; name: string | null; email: string | null; is_active: boolean }>(
    "SELECT id, name, email, is_active FROM users WHERE role IN ('admin', 'agent') ORDER BY is_active DESC, name",
  );
  const kind: Kind = KINDS.find((k) => k.value === sp.kind)?.value ?? "all";
  const person = typeof sp.person === "string" && staff.some((s) => s.id === sp.person) ? sp.person : "";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));

  const todayIso = startOfTodayIstIso();
  const weekIso = startOfWeekIstIso(todayIso);
  const monthIso = startOfMonthIst().toISOString();

  const [team, activeToday, actionsToday, actionsWeek, wonMonth, performers, feed] = await Promise.all([
    db.count("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'agent') AND is_active = 1"),
    activeStaffSince(todayIso),
    countFeed({ kind: "all", since: todayIso, staffOnly: true }),
    countFeed({ kind: "all", since: weekIso, staffOnly: true }),
    db.count("SELECT COUNT(DISTINCT client_id) FROM client_activities WHERE type = 'status' AND body LIKE ? AND created_at >= ?", [WON_LIKE, monthIso]),
    topPerformers(monthIso),
    feedPage({ kind, person: person || undefined }, PER_PAGE, (page - 1) * PER_PAGE),
  ]);
  const pages = Math.max(1, Math.ceil(feed.total / PER_PAGE));
  const maxTouches = Math.max(1, ...performers.map((p) => p.touches));

  const now = nowMs();
  const todayKey = istDayKey(now);
  const yesterdayKey = istDayKey(now - DAY_MS);

  // Group consecutive rows by IST day (rows are already newest first).
  const groups: { heading: string; items: { id: string; at: string; entry: Entry }[] }[] = [];
  for (const r of feed.rows) {
    const heading = dayHeading(r.created_at, todayKey, yesterdayKey);
    const last = groups[groups.length - 1];
    const item = { id: `${r.src}-${r.id}`, at: r.created_at, entry: describe(r) };
    if (last?.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }

  const filtered = kind !== "all" || person !== "";

  return (
    <>
      <PageHeader
        title="Activity"
        description="What the team has been doing across clients and listings."
        count={feed.total}
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <select name="person" defaultValue={person} className="input w-auto py-1.5 text-sm" aria-label="Person">
              <option value="">Everyone</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.email}
                  {s.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
            <select name="kind" defaultValue={kind} className="input w-auto py-1.5 text-sm" aria-label="Kind">
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <button className="btn-primary px-4 py-1.5 text-sm">Filter</button>
            {filtered && (
              <Link href="/admin/activity" className="btn-ghost px-3 py-1.5 text-sm">
                Clear
              </Link>
            )}
          </form>
        }
      />

      <div className="s-stats">
        <StatCard label="Team members" value={team} href="/admin/agents" />
        <StatCard label="Active today" value={activeToday} />
        <StatCard label="Actions today" value={actionsToday} />
        <StatCard label="This week" value={actionsWeek} />
        <StatCard label="Clients won this month" value={wonMonth} href="/admin/clients?tab=won" />
      </div>

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
          <Pagination page={page} pages={pages} basePath="/admin/activity" params={{ person: person || undefined, kind: kind === "all" ? undefined : kind }} />
        </section>

        <aside className="card p-5">
          <h2 className="text-base font-extrabold tracking-tight text-[var(--s-text)]">Top performers</h2>
          <p className="mb-4 text-xs text-[var(--s-muted)]">Client calls, meetings, visits and messages this month</p>
          {performers.length ? (
            <ol className="space-y-4">
              {performers.map((p, i) => (
                <li key={p.id}>
                  <Link href={`/admin/activity?person=${p.id}`} className="flex items-center gap-3">
                    <Avatar name={p.name ?? p.email} kind={i === 0 ? "brand" : "staff"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-[var(--s-text)]">{p.name ?? p.email}</span>
                        <span className="text-xs font-bold text-[var(--s-text-2)] tabular-nums">{p.touches}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--s-seg)]">
                        <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.round((p.touches / maxTouches) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-[var(--s-muted)]">
                        {p.won ? `${p.won} won` : "No wins yet"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[var(--s-muted)]">No client activity logged this month yet.</p>
          )}
        </aside>
      </div>
    </>
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
