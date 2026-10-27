import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { CLIENT_STATUSES } from "@/lib/crm-constants";
import { nowMs, startOfMonthIst, startOfTodayIstIso } from "@/lib/time";
import { Empty, PageHeader, SectionHeading, StatCard } from "@/components/admin/ui";
import { requirementSummary } from "@/components/crm/ClientBadges";
import { assignClient } from "../../workload-actions";
import type { Client, ClientStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Workload" };

type Staff = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "agent";
  agent_type: "agent" | "broker" | null;
};

type AgentStats = {
  open: number;
  overdue: number;
  dueToday: number;
  wonMonth: number;
  lastContact: string | null;
  byStatus: Partial<Record<ClientStatus, number>>;
};

type Unassigned = Pick<Client, "id" | "name" | "type" | "listing_type" | "bedrooms" | "budget_min" | "budget_max" | "localities" | "created_at" | "status">;

const OPEN = "c.status NOT IN ('won', 'lost')";
const OPEN_STATUSES = CLIENT_STATUSES.filter((s) => s.value !== "won" && s.value !== "lost");

function initials(text: string | null | undefined) {
  const parts = (text ?? "").replace(/@.*/, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const isHolder = (s: Staff) => s.agent_type === null || s.agent_type === "agent";

export default async function WorkloadPage() {
  await requireAdmin();
  await connection();

  const now = new Date(nowMs());
  const endOfToday = new Date(new Date(startOfTodayIstIso()).getTime() + 86_400_000);
  const monthStart = startOfMonthIst();

  const [staff, statusRows, followRows, wonRows, contactRows, referredRows, unassigned, unassignedCount] = await Promise.all([
    db.all<Staff>("SELECT id, name, email, role, agent_type FROM users WHERE role IN ('admin', 'agent') AND is_active = 1 ORDER BY name"),
    db.all<{ agent: string; status: ClientStatus; n: number }>(
      `SELECT c.assigned_to AS agent, c.status, COUNT(*) AS n FROM clients c
        WHERE c.assigned_to IS NOT NULL AND ${OPEN} GROUP BY c.assigned_to, c.status`,
    ),
    db.all<{ agent: string; overdue: number; due_today: number }>(
      `SELECT c.assigned_to AS agent,
              SUM(c.next_follow_up < ?) AS overdue,
              SUM(c.next_follow_up >= ? AND c.next_follow_up < ?) AS due_today
         FROM clients c
        WHERE c.assigned_to IS NOT NULL AND ${OPEN} AND c.next_follow_up IS NOT NULL
        GROUP BY c.assigned_to`,
      [now, now, endOfToday],
    ),
    db.all<{ agent: string; n: number }>(
      `SELECT c.assigned_to AS agent, COUNT(*) AS n FROM clients c
        WHERE c.assigned_to IS NOT NULL AND c.status = 'won' AND c.updated_at >= ? GROUP BY c.assigned_to`,
      [monthStart],
    ),
    db.all<{ agent: string; last: string | null }>(
      "SELECT c.assigned_to AS agent, MAX(c.last_contact_at) AS last FROM clients c WHERE c.assigned_to IS NOT NULL GROUP BY c.assigned_to",
    ),
    db.all<{ broker: string; total: number; open: number }>(
      `SELECT c.broker_id AS broker, COUNT(*) AS total, SUM(${OPEN}) AS open FROM clients c
        WHERE c.broker_id IS NOT NULL GROUP BY c.broker_id`,
    ),
    db.all<Unassigned>(
      `SELECT c.id, c.name, c.type, c.listing_type, c.bedrooms, c.budget_min, c.budget_max, c.localities, c.created_at, c.status
         FROM clients c WHERE c.assigned_to IS NULL AND ${OPEN} ORDER BY c.created_at DESC LIMIT 50`,
    ),
    db.count(`SELECT COUNT(*) FROM clients c WHERE c.assigned_to IS NULL AND ${OPEN}`),
  ]);

  const stats = new Map<string, AgentStats>();
  const get = (id: string) => {
    let s = stats.get(id);
    if (!s) {
      s = { open: 0, overdue: 0, dueToday: 0, wonMonth: 0, lastContact: null, byStatus: {} };
      stats.set(id, s);
    }
    return s;
  };
  for (const r of statusRows) {
    const s = get(r.agent);
    s.open += Number(r.n);
    s.byStatus[r.status] = Number(r.n);
  }
  for (const r of followRows) {
    const s = get(r.agent);
    s.overdue = Number(r.overdue) || 0;
    s.dueToday = Number(r.due_today) || 0;
  }
  for (const r of wonRows) get(r.agent).wonMonth = Number(r.n);
  for (const r of contactRows) get(r.agent).lastContact = r.last;

  const agents = staff
    .filter(isHolder)
    .map((a) => ({ ...a, stats: get(a.id) }))
    .sort((a, b) => b.stats.open - a.stats.open || (a.name ?? "").localeCompare(b.name ?? ""));
  const brokers = staff
    .filter((s) => s.agent_type === "broker")
    .map((b) => {
      const r = referredRows.find((x) => x.broker === b.id);
      return { ...b, total: Number(r?.total ?? 0), open: Number(r?.open ?? 0) };
    })
    .sort((a, b) => b.total - a.total);

  const openTotal = agents.reduce((n, a) => n + a.stats.open, 0) + unassignedCount;
  const overdueTotal = followRows.reduce((n, r) => n + (Number(r.overdue) || 0), 0);

  return (
    <>
      <PageHeader title="Workload" description="Who is holding which clients, and where follow-ups are slipping." />

      <div className="s-stats mb-8">
        <StatCard label="Open clients" value={openTotal} href="/admin/clients?tab=open" />
        <StatCard label="Unassigned" value={unassignedCount} href="/admin/clients?agent=none&tab=open" tone={unassignedCount ? "warn" : "default"} />
        <StatCard label="Overdue follow-ups" value={overdueTotal} href="/admin/clients?tab=due" tone={overdueTotal ? "bad" : "default"} />
        <StatCard label="Active agents" value={agents.length} href="/admin/agents" />
      </div>

      <SectionHeading count={agents.length}>Agents</SectionHeading>
      {agents.length ? (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      ) : (
        <div className="mb-10">
          <Empty>No active agents yet.</Empty>
        </div>
      )}

      <SectionHeading count={unassignedCount}>Unassigned clients</SectionHeading>
      {unassigned.length ? (
        <div className="card mb-10 divide-y divide-[var(--s-border)] px-5">
          {unassigned.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--s-seg)] text-xs font-extrabold text-[var(--s-text-2)]">
                {initials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/clients/${c.id}`} className="font-bold text-[var(--s-text)] hover:text-[var(--brand)]">
                  {c.name}
                </Link>
                <p className="truncate text-sm text-[var(--s-muted)]">
                  {requirementSummary(c)} · Added {formatDate(c.created_at)}
                </p>
              </div>
              {agents.length > 0 && (
                <form action={assignClient} className="flex items-center gap-2">
                  <input type="hidden" name="client_id" value={c.id} />
                  <select name="agent_id" required defaultValue="" aria-label={`Agent for ${c.name}`} className="input w-auto py-1.5 text-sm">
                    <option value="" disabled>
                      Choose agent
                    </option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name ?? a.email} ({a.stats.open})
                      </option>
                    ))}
                  </select>
                  <button className="btn-primary px-4 py-1.5 text-sm">Assign</button>
                </form>
              )}
            </div>
          ))}
          {unassignedCount > unassigned.length && (
            <div className="py-3 text-center text-sm font-semibold">
              <Link href="/admin/clients?agent=none&tab=open" className="text-[var(--brand)] hover:underline">
                View all {unassignedCount} unassigned clients
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-10">
          <Empty>Every open client has an agent.</Empty>
        </div>
      )}

      {brokers.length > 0 && (
        <>
          <SectionHeading count={brokers.length}>Brokers</SectionHeading>
          <div className="card divide-y divide-[var(--s-border)] px-5">
            {brokers.map((b) => (
              <div key={b.id} className="flex items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--s-seg)] text-[11px] font-extrabold text-[var(--s-text-2)]">
                  {initials(b.name ?? b.email)}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-[var(--s-text)]">{b.name ?? b.email}</span>
                <span className="text-sm text-[var(--s-muted)] tabular-nums">
                  <span className="font-extrabold text-[var(--s-text)]">{b.total}</span> referred
                  {b.open > 0 && <> · {b.open} open</>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function AgentCard({ agent }: { agent: Staff & { stats: AgentStats } }) {
  const s = agent.stats;
  return (
    <div className="card flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--s-brand-soft)] text-sm font-extrabold text-[var(--brand)]">
          {initials(agent.name ?? agent.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-[var(--s-text)]">{agent.name ?? agent.email}</p>
          <p className="text-xs font-semibold text-[var(--s-muted)]">{agent.role === "admin" ? "Admin" : "Agent"}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl leading-none font-extrabold tabular-nums">{s.open}</p>
          <p className="text-xs font-semibold text-[var(--s-muted)]">open</p>
        </div>
      </div>

      <div>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--s-seg)]">
          {s.open > 0 &&
            OPEN_STATUSES.map((st) => {
              const n = s.byStatus[st.value] ?? 0;
              return n ? (
                <div
                  key={st.value}
                  className={`${st.color.split(" ")[1]} bg-current opacity-70`}
                  style={{ width: `${(n / s.open) * 100}%` }}
                  title={`${st.label}: ${n}`}
                />
              ) : null;
            })}
        </div>
        {s.open > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--s-muted)]">
            {OPEN_STATUSES.filter((st) => s.byStatus[st.value]).map((st) => (
              <span key={st.value} className="inline-flex items-center gap-1">
                <span className={`size-1.5 rounded-full bg-current opacity-70 ${st.color.split(" ")[1]}`} />
                {st.label} {s.byStatus[st.value]}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Overdue" value={s.overdue} className={s.overdue ? "text-[var(--s-late)]" : ""} />
        <Metric label="Due today" value={s.dueToday} />
        <Metric label="Won (month)" value={s.wonMonth} className={s.wonMonth ? "text-[var(--brand)]" : ""} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--s-border)] pt-4 text-xs">
        <span className="text-[var(--s-muted)]">
          Last contact <span className="font-semibold text-[var(--s-text-2)]">{s.lastContact ? formatDate(s.lastContact) : "—"}</span>
        </span>
        <Link href={`/admin/clients?agent=${agent.id}&tab=open`} className="font-bold text-[var(--brand)] hover:underline">
          View clients →
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-2xl bg-[var(--s-seg)]/60 px-2 py-2.5">
      <p className={`text-lg leading-none font-extrabold tabular-nums ${className}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-[var(--s-muted)]">{label}</p>
    </div>
  );
}
