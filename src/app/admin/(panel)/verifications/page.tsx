import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone, formatDate, formatDateTime } from "@/lib/format";
import { fromNow, startOfMonthIst, startOfTodayIstIso } from "@/lib/time";
import { Empty, PageHeader, SectionHeading, StatCard, Tabs } from "@/components/admin/ui";
import type { SiteVerification } from "@/lib/types";

export const metadata: Metadata = { title: "Site visits" };

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "verified", label: "Verified" },
  { key: "issues", label: "Issues" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TAB_SQL: Record<TabKey, { where: string; order: string }> = {
  upcoming: { where: "v.status = 'scheduled'", order: "v.scheduled_at IS NULL, v.scheduled_at ASC" },
  verified: { where: "v.status = 'completed' AND v.result = 'verified'", order: "v.visited_at DESC" },
  issues: { where: "v.status = 'completed' AND v.result = 'issues'", order: "v.visited_at DESC" },
  cancelled: { where: "v.status = 'cancelled'", order: "v.updated_at DESC" },
  all: { where: "1 = 1", order: "v.created_at DESC" },
};

type Row = Pick<SiteVerification, "id" | "property_id" | "status" | "result" | "scheduled_at" | "visited_at"> & {
  reference_no: string;
  title: string;
  locality: string;
  city: string | null;
  assignee_name: string | null;
  owner_name: string | null;
  owner_phone: string | null;
};

type Awaiting = { id: string; reference_no: string; title: string; locality: string; status: string; submitted_at: string | null };

function StatusBadge({ r, overdue }: { r: Row; overdue: boolean }) {
  if (r.status === "cancelled") return <span className="badge bg-[var(--s-seg)] text-[var(--s-text-2)]">Cancelled</span>;
  if (r.result === "verified") return <span className="badge bg-emerald-100 text-emerald-800">Verified</span>;
  if (r.result === "issues") return <span className="badge bg-red-100 text-red-800">Issues</span>;
  return overdue ? <span className="badge bg-red-100 text-red-800">Overdue</span> : <span className="badge bg-sky-100 text-sky-800">Scheduled</span>;
}

export default async function VerificationsPage({ searchParams }: PageProps<"/admin/verifications">) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const { tab } = await searchParams;
  const active: TabKey = TABS.find((t) => t.key === tab)?.key ?? "upcoming";

  // Agents only see visits assigned to them.
  const scope = isAdmin ? "1 = 1" : "v.assigned_to = ?";
  const scopeArgs = isAdmin ? [] : [staff.userId];

  const now = fromNow(0);
  const todayEnd = new Date(new Date(startOfTodayIstIso()).getTime() + 86_400_000);
  const monthStart = startOfMonthIst();

  const [rows, counts, awaiting] = await Promise.all([
    db.all<Row>(
      `SELECT v.id, v.property_id, v.status, v.result, v.scheduled_at, v.visited_at,
              p.reference_no, p.title, p.locality, p.city,
              a.name AS assignee_name, o.name AS owner_name, o.phone AS owner_phone
         FROM site_verifications v
         JOIN properties p ON p.id = v.property_id
         LEFT JOIN users a ON a.id = v.assigned_to
         LEFT JOIN users o ON o.id = p.owner_id
        WHERE ${scope} AND ${TAB_SQL[active].where}
        ORDER BY ${TAB_SQL[active].order} LIMIT 200`,
      scopeArgs,
    ),
    db.one<Record<string, number | null>>(
      `SELECT
         SUM(v.status = 'scheduled') AS upcoming,
         SUM(v.status = 'completed' AND v.result = 'verified') AS verified,
         SUM(v.status = 'completed' AND v.result = 'issues') AS issues,
         SUM(v.status = 'cancelled') AS cancelled,
         COUNT(*) AS total,
         SUM(v.status = 'scheduled' AND v.scheduled_at >= ? AND v.scheduled_at < ?) AS due_today,
         SUM(v.status = 'scheduled' AND v.scheduled_at < ?) AS overdue,
         SUM(v.status = 'completed' AND v.result = 'verified' AND v.visited_at >= ?) AS verified_month
         FROM site_verifications v WHERE ${scope}`,
      [now, todayEnd, now, monthStart, ...scopeArgs],
    ),
    isAdmin
      ? db.all<Awaiting>(
          `SELECT p.id, p.reference_no, p.title, p.locality, p.status, p.submitted_at
             FROM properties p
            WHERE p.status IN ('pending', 'under_review') AND p.verified_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM site_verifications v WHERE v.property_id = p.id AND v.status = 'scheduled')
            ORDER BY p.submitted_at ASC LIMIT 50`,
        )
      : Promise.resolve([] as Awaiting[]),
  ]);

  const n = (k: string) => Number(counts?.[k] ?? 0);
  const tabCount: Record<TabKey, number> = {
    upcoming: n("upcoming"),
    verified: n("verified"),
    issues: n("issues"),
    cancelled: n("cancelled"),
    all: n("total"),
  };
  const nowAt = now.getTime();
  const base = "/admin/verifications";

  return (
    <>
      <PageHeader
        title="Site visits"
        description={isAdmin ? "On-site checks of submitted properties before they go live." : "Properties you've been asked to visit and verify."}
      />

      <div className="s-stats mb-6">
        <StatCard label="Due today" value={n("due_today")} href={`${base}?tab=upcoming`} />
        <StatCard label="Overdue" value={n("overdue")} href={`${base}?tab=upcoming`} tone={n("overdue") ? "bad" : "default"} />
        <StatCard label="Verified this month" value={n("verified_month")} href={`${base}?tab=verified`} />
        <StatCard label="Issues" value={n("issues")} href={`${base}?tab=issues`} tone={n("issues") ? "warn" : "default"} />
      </div>

      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?tab=${t.key}`, count: tabCount[t.key] }))} />

      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => {
            const overdue = r.status === "scheduled" && !!r.scheduled_at && new Date(r.scheduled_at).getTime() < nowAt;
            return (
              <li
                key={r.id}
                className={`card flex flex-wrap items-center gap-x-6 gap-y-3 p-5 ${overdue ? "ring-2 ring-red-200" : ""}`}
              >
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold text-[var(--s-text-2)]">
                      {r.reference_no}
                    </span>
                    <StatusBadge r={r} overdue={overdue} />
                  </div>
                  <p className="mt-1.5 truncate font-bold">{r.title}</p>
                  <p className="truncate text-sm text-[var(--s-muted)]">
                    {r.locality}
                    {r.city && `, ${r.city}`}
                  </p>
                </div>

                <div className="min-w-0 basis-44 text-sm">
                  <p className="text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">{r.visited_at ? "Visited" : "Scheduled"}</p>
                  <p className={`font-semibold ${overdue ? "text-[var(--s-late)]" : ""}`}>{formatDateTime(r.visited_at ?? r.scheduled_at)}</p>
                  {isAdmin && <p className="truncate text-[var(--s-text-2)]">{r.assignee_name ?? "Unassigned"}</p>}
                </div>

                <div className="min-w-0 basis-44 text-sm">
                  <p className="text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">Owner</p>
                  <p className="truncate font-semibold">{r.owner_name ?? "—"}</p>
                  {r.owner_phone ? (
                    <a href={`tel:+${r.owner_phone}`} className="font-semibold text-brand-700 hover:underline">
                      {displayPhone(r.owner_phone)}
                    </a>
                  ) : (
                    <span className="text-[var(--s-muted)]">No phone</span>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {isAdmin && (
                    <Link href={`/admin/properties/${r.property_id}`} className="btn-secondary">
                      Property
                    </Link>
                  )}
                  <Link href={`/admin/verifications/${r.id}`} className={r.status === "scheduled" ? "btn-primary" : "btn-secondary"}>
                    {r.status === "scheduled" ? "Start visit" : "View"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>{active === "upcoming" ? "No visits scheduled." : "No visits here yet."}</Empty>
      )}

      {isAdmin && (
        <section className="mt-10">
          <SectionHeading count={awaiting.length}>Awaiting verification</SectionHeading>
          <p className="-mt-2 mb-4 text-sm text-[var(--s-muted)]">Submissions not yet verified and with no visit scheduled. Open one to schedule a visit.</p>
          {awaiting.length ? (
            <ul className="card divide-y divide-[var(--s-border)] overflow-hidden p-2">
              {awaiting.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/admin/properties/${a.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors hover:bg-[var(--s-hover)]"
                  >
                    <span className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold text-[var(--s-text-2)]">
                      {a.reference_no}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {a.title}
                      <span className="font-normal text-[var(--s-muted)]"> · {a.locality}</span>
                    </span>
                    <span className="text-xs text-[var(--s-muted)]">Submitted {formatDate(a.submitted_at)}</span>
                    <span className="font-bold text-[var(--brand)]">Schedule →</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Every submission is verified or has a visit scheduled.</Empty>
          )}
        </section>
      )}
    </>
  );
}
