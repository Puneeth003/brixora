import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { broadcastCounts, type BroadcastRow, type BroadcastStatus } from "@/lib/broadcast";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Empty, PageHeader, Pagination, StatCard, Table, Tabs, pageFrom } from "@/components/admin/ui";
import { BroadcastStatusBadge, ProgressBar, accepted, pct } from "./parts";

export const metadata: Metadata = { title: "Broadcasts" };

const PER_PAGE = 25;

const TABS: { key: string; label: string; statuses: BroadcastStatus[] }[] = [
  { key: "all", label: "All", statuses: ["scheduled", "sending", "paused", "done", "cancelled"] },
  { key: "scheduled", label: "Scheduled", statuses: ["scheduled"] },
  { key: "sending", label: "Sending", statuses: ["sending", "paused"] },
  { key: "done", label: "Done", statuses: ["done"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

type ListRow = Pick<BroadcastRow, "id" | "name" | "template_name" | "status" | "scheduled_at" | "started_at" | "finished_at">;

function when(b: ListRow) {
  if (b.status === "scheduled") return { label: "Scheduled", at: b.scheduled_at };
  if (b.status === "done" || b.status === "cancelled") return { label: b.status === "done" ? "Finished" : "Cancelled", at: b.finished_at ?? b.started_at ?? b.scheduled_at };
  return { label: "Started", at: b.started_at ?? b.scheduled_at };
}

export default async function BroadcastsPage({ searchParams }: PageProps<"/admin/broadcasts">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.status) ?? TABS[0];
  const page = pageFrom(sp.page);

  const [statusRows, rows, recent] = await Promise.all([
    db.all<{ status: BroadcastStatus; n: number }>("SELECT status, COUNT(*) AS n FROM broadcasts GROUP BY status"),
    db.all<ListRow>(
      `SELECT id, name, template_name, status, scheduled_at, started_at, finished_at FROM broadcasts
        WHERE status IN (?) ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [tab.statuses, PER_PAGE, (page - 1) * PER_PAGE],
    ),
    db.one<{ broadcasts: number; sent: number; delivered: number; read_n: number; replied: number }>(
      `SELECT COUNT(DISTINCT b.id) AS broadcasts,
              COALESCE(SUM(r.status IN ('sent', 'delivered', 'read')), 0) AS sent,
              COALESCE(SUM(r.status IN ('delivered', 'read')), 0) AS delivered,
              COALESCE(SUM(r.status = 'read'), 0) AS read_n,
              COALESCE(SUM(r.replied_at IS NOT NULL), 0) AS replied
         FROM broadcasts b LEFT JOIN broadcast_recipients r ON r.broadcast_id = b.id
        WHERE b.created_at > UTC_TIMESTAMP(3) - INTERVAL 30 DAY`,
    ),
  ]);

  const byStatus = new Map(statusRows.map((r) => [r.status, Number(r.n)]));
  const tabCount = (t: (typeof TABS)[number]) => t.statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0);
  const counts = await broadcastCounts(rows.map((r) => r.id));
  const href = (key: string, pg = 1) => {
    const q = new URLSearchParams();
    if (key !== "all") q.set("status", key);
    if (pg > 1) q.set("page", String(pg));
    const s = q.toString();
    return s ? `/admin/broadcasts?${s}` : "/admin/broadcasts";
  };

  const sent = Number(recent?.sent ?? 0);
  const total = TABS.reduce((sum, t) => (t.key === "all" ? sum : sum + tabCount(t)), 0);

  return (
    <>
      <PageHeader
        title="Broadcasts"
        description="Send an approved WhatsApp template to many people at once, now or on a schedule, and see who got it, read it and replied."
        actions={
          <>
            <Link href="/admin/broadcasts/opt-outs" className="btn-secondary px-4 py-2 text-sm">
              Opt-outs
            </Link>
            <Link href="/admin/broadcasts/new" className="btn-primary px-4 py-2 text-sm">
              + New broadcast
            </Link>
          </>
        }
      />

      {total > 0 && (
        <>
          <p className="mb-2 text-[13px] font-bold text-[var(--s-muted)]">Last 30 days</p>
          <div className="s-stats mb-7">
            <StatCard label="Broadcasts" value={Number(recent?.broadcasts ?? 0)} />
            <StatCard label="Messages sent" value={sent} />
            <StatCard label="Delivered %" value={pct(Number(recent?.delivered ?? 0), sent)} />
            <StatCard label="Read %" value={pct(Number(recent?.read_n ?? 0), sent)} />
            <StatCard label="Replies" value={Number(recent?.replied ?? 0)} />
          </div>
        </>
      )}

      <Tabs active={tab.key} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: href(t.key), count: tabCount(t) }))} />

      {rows.length ? (
        <>
          <Table>
            <thead>
              <tr>
                <th>Broadcast</th>
                <th>Status</th>
                <th>When</th>
                <th>Recipients</th>
                <th>Progress</th>
                <th>Read</th>
                <th>Replied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const c = counts.get(b.id)!;
                const w = when(b);
                return (
                  <tr key={b.id}>
                    <td className="max-w-xs">
                      <Link href={`/admin/broadcasts/${b.id}`} className="block truncate font-bold text-[var(--s-text)] hover:text-[var(--brand)]">
                        {b.name}
                      </Link>
                      <span className="mt-0.5 block truncate font-mono text-xs text-[var(--s-muted)]">{b.template_name}</span>
                    </td>
                    <td>
                      <BroadcastStatusBadge status={b.status} />
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="block text-xs text-[var(--s-muted)]">{w.label}</span>
                      {formatDateTime(w.at)}
                    </td>
                    <td className="font-semibold tabular-nums">{c.total}</td>
                    <td className="min-w-32">
                      <ProgressBar counts={c} />
                      {c.failed > 0 && <span className="mt-1 block text-xs font-semibold text-[var(--s-late)]">{c.failed} failed</span>}
                    </td>
                    <td className="tabular-nums">{pct(c.read, accepted(c))}</td>
                    <td className="tabular-nums">{c.replied}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} perPage={PER_PAGE} total={tabCount(tab)} href={(pg) => href(tab.key, pg)} />
        </>
      ) : total === 0 ? (
        <Empty>
          <p className="text-base font-extrabold text-[var(--s-text)]">No broadcasts yet</p>
          <p className="mx-auto mt-2 max-w-md font-medium">
            A broadcast sends one approved WhatsApp template to a list of people (CRM clients, website members, recent enquiries or an uploaded
            list), each with their own name and details filled in. Numbers that replied STOP are left out automatically.
          </p>
          <Link href="/admin/broadcasts/new" className="btn-primary mt-5 inline-flex px-4 py-2 text-sm">
            + New broadcast
          </Link>
        </Empty>
      ) : (
        <Empty>No {tab.label.toLowerCase()} broadcasts.</Empty>
      )}
    </>
  );
}
