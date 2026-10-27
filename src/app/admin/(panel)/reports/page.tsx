import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLIENT_SOURCES, CLIENT_STATUSES, label } from "@/lib/crm-constants";
import { fromNow } from "@/lib/time";
import { PageHeader, StatCard, Table, Tabs } from "@/components/admin/ui";
import { PropertyStatusBadge } from "@/components/StatusBadge";
import type { ClientSource, ClientStatus, Property } from "@/lib/types";

export const metadata = { title: "Reports" };

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

const LOGGED_TYPES = ["call", "whatsapp", "email", "meeting", "site_visit"];

type Bar = { key: string; label: string; value: number; href?: string };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-lg font-extrabold tracking-tight text-[var(--s-text)]">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-[var(--s-muted)]">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Bars({ rows, empty = "No data for this period." }: { rows: Bar[]; empty?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max === 0) return <p className="text-sm font-semibold text-[var(--s-muted)]">{empty}</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            {r.href ? (
              <Link href={r.href} className="truncate font-semibold text-[var(--s-text-2)] hover:text-[var(--brand)]">
                {r.label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-[var(--s-text-2)]">{r.label}</span>
            )}
            <span className="font-bold text-[var(--s-text)] tabular-nums">{r.value}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--s-seg)]">
            <div className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${max ? Math.max(r.value ? 2 : 0, (r.value / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin();
  await connection();
  const sp = await searchParams;
  const raw = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = PERIODS.some((p) => p.days === raw) ? raw : 30;
  const since = fromNow(-days * 86_400_000);
  const periodLabel = PERIODS.find((p) => p.days === days)!.label;

  type AgentRow = { id: string; name: string | null; email: string | null; role: string; assigned: number; activities: number; won: number; open_now: number };
  type ListingRow = Pick<Property, "id" | "reference_no" | "title"> & { n: number };

  const [newClients, enquiries, won, lost, submitted, approved, bySource, pipeline, agents, localities, byStatus, topListings] = await Promise.all([
    db.count("SELECT COUNT(*) FROM clients WHERE created_at >= ?", [since]),
    db.count("SELECT COUNT(*) FROM enquiries WHERE created_at >= ?", [since]),
    db.count("SELECT COUNT(*) FROM clients WHERE status = 'won' AND updated_at >= ?", [since]),
    db.count("SELECT COUNT(*) FROM clients WHERE status = 'lost' AND updated_at >= ?", [since]),
    db.count("SELECT COUNT(*) FROM properties WHERE submitted_at >= ?", [since]),
    db.count("SELECT COUNT(*) FROM properties WHERE approved_at >= ?", [since]),
    db.all<{ source: ClientSource; n: number }>("SELECT source, COUNT(*) AS n FROM clients WHERE created_at >= ? GROUP BY source", [since]),
    db.all<{ status: ClientStatus; n: number }>("SELECT status, COUNT(*) AS n FROM clients WHERE status NOT IN ('won', 'lost') GROUP BY status"),
    db.all<AgentRow>(
      `SELECT u.id, u.name, u.email, u.role,
         (SELECT COUNT(*) FROM clients c WHERE c.assigned_to = u.id AND c.created_at >= ?) AS assigned,
         (SELECT COUNT(*) FROM client_activities a WHERE a.actor_id = u.id AND a.created_at >= ? AND a.type IN (?)) AS activities,
         (SELECT COUNT(*) FROM clients c WHERE c.assigned_to = u.id AND c.status = 'won' AND c.updated_at >= ?) AS won,
         (SELECT COUNT(*) FROM clients c WHERE c.assigned_to = u.id AND c.status NOT IN ('won', 'lost')) AS open_now
       FROM users u
       WHERE u.role IN ('admin', 'agent') AND u.is_active = 1 AND (u.agent_type IS NULL OR u.agent_type <> 'broker')
       ORDER BY u.role = 'admin', u.name`,
      [since, since, LOGGED_TYPES, since],
    ),
    db.all<{ locality: string; n: number }>(
      `SELECT p.locality, COUNT(*) AS n FROM enquiries e JOIN properties p ON p.id = e.property_id
        WHERE e.created_at >= ? GROUP BY p.locality ORDER BY n DESC, p.locality LIMIT 8`,
      [since],
    ),
    db.all<{ status: Property["status"]; n: number }>(
      "SELECT status, COUNT(*) AS n FROM properties WHERE status <> 'draft' GROUP BY status ORDER BY n DESC",
    ),
    db.all<ListingRow>(
      `SELECT p.id, p.reference_no, p.title, COUNT(*) AS n FROM enquiries e JOIN properties p ON p.id = e.property_id
        WHERE e.created_at >= ? GROUP BY p.id, p.reference_no, p.title ORDER BY n DESC, p.reference_no LIMIT 5`,
      [since],
    ),
  ]);

  const closed = won + lost;
  const conversion = closed ? `${Math.round((won / closed) * 100)}%` : "—";

  const sourceCounts = new Map(bySource.map((r) => [r.source, r.n]));
  const sourceBars: Bar[] = CLIENT_SOURCES.map((s) => ({ key: s.value, label: label(CLIENT_SOURCES, s.value), value: sourceCounts.get(s.value) ?? 0 }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);

  const pipelineCounts = new Map(pipeline.map((r) => [r.status, r.n]));
  const pipelineBars: Bar[] = CLIENT_STATUSES.filter((s) => s.value !== "won" && s.value !== "lost").map((s) => ({
    key: s.value,
    label: s.label,
    value: pipelineCounts.get(s.value) ?? 0,
    href: `/admin/clients?tab=${s.value}`,
  }));

  const localityBars: Bar[] = localities.map((r) => ({ key: r.locality, label: r.locality, value: r.n }));

  return (
    <>
      <PageHeader title="Reports" description={`Leads, pipeline, team and listings over the last ${periodLabel}.`} />
      <Tabs
        active={String(days)}
        tabs={PERIODS.map((p) => ({ key: String(p.days), label: p.label, href: `/admin/reports?days=${p.days}` }))}
      />

      <div className="s-stats">
        <StatCard label="New clients" value={newClients} href="/admin/clients" />
        <StatCard label="Enquiries" value={enquiries} href="/admin/enquiries" />
        <StatCard label="Won" value={won} />
        <StatCard label="Conversion rate" value={conversion} />
        <StatCard label="Listings submitted" value={submitted} href="/admin/submissions" />
        <StatCard label="Listings approved" value={approved} href="/admin/listings" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Leads by source" description="New clients created in this period.">
          <Bars rows={sourceBars} empty="No new clients in this period." />
        </Section>

        <Section title="Pipeline" description="Open clients right now, by stage.">
          <Bars rows={pipelineBars} empty="No open clients." />
        </Section>

        <section className="xl:col-span-2">
          <h2 className="mb-1 text-lg font-extrabold tracking-tight text-[var(--s-text)]">Agent performance</h2>
          <p className="mb-4 text-[13px] text-[var(--s-muted)]">
            Activities count calls, WhatsApp, email, meetings and site visits logged. Won counts clients closed in this period.
          </p>
          <Table>
            <thead>
              <tr>
                <th>Team member</th>
                <th className="text-right">New clients</th>
                <th className="text-right">Activities</th>
                <th className="text-right">Won</th>
                <th className="text-right">Open now</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center font-semibold text-[var(--s-muted)]">
                    No active team members.
                  </td>
                </tr>
              )}
              {agents.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="font-bold text-[var(--s-text)]">{a.name || a.email || "Unnamed"}</div>
                    <div className="text-xs text-[var(--s-muted)] capitalize">{a.role}</div>
                  </td>
                  <td className="text-right tabular-nums">{a.assigned}</td>
                  <td className="text-right tabular-nums">{a.activities}</td>
                  <td className="text-right font-bold tabular-nums">{a.won}</td>
                  <td className="text-right tabular-nums">{a.open_now}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>

        <Section title="Top localities by enquiries" description="Enquiries in this period, by the listing's locality.">
          <Bars rows={localityBars} empty="No enquiries in this period." />
        </Section>

        <Section title="Listings" description="All listings by status (drafts excluded).">
          {byStatus.length === 0 ? (
            <p className="text-sm font-semibold text-[var(--s-muted)]">No listings yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--s-border)]">
              {byStatus.map((r) => (
                <li key={r.status} className="flex items-center justify-between py-2.5 text-sm">
                  <PropertyStatusBadge status={r.status} />
                  <span className="font-bold text-[var(--s-text)] tabular-nums">{r.n}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-6 mb-3 text-sm font-extrabold text-[var(--s-text)]">Most enquired listings</h3>
          {topListings.length === 0 ? (
            <p className="text-sm font-semibold text-[var(--s-muted)]">No enquiries in this period.</p>
          ) : (
            <ul className="divide-y divide-[var(--s-border)]">
              {topListings.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/admin/properties/${l.id}`} className="min-w-0 hover:text-[var(--brand)]">
                    <span className="mr-2 font-mono text-xs text-[var(--s-muted)]">{l.reference_no}</span>
                    <span className="font-semibold text-[var(--s-text-2)]">{l.title}</span>
                  </Link>
                  <span className="rounded-lg bg-[var(--s-brand-soft)] px-2 py-0.5 text-xs font-bold text-[var(--brand)] tabular-nums">{l.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
