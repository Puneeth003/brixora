import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  broadcastCounts,
  getBroadcast,
  type AudienceSpec,
  type BroadcastConfig,
  type RecipientRow,
  type VariableSource,
} from "@/lib/broadcast";
import { db } from "@/lib/db";
import { displayPhone, formatDateTime } from "@/lib/format";
import { Empty, Pagination, SectionHeading, StatCard, Table, Tabs, pageFrom } from "@/components/admin/ui";
import { BroadcastStatusBadge, ProgressBar, accepted, parsed, pct } from "../parts";
import { BroadcastControls } from "./BroadcastControls";

export const metadata: Metadata = { title: "Broadcast report" };

const PER_PAGE = 50;

const RECIPIENT_TABS = [
  { key: "all", label: "All", where: "" },
  { key: "failed", label: "Failed", where: "AND status = 'failed'" },
  { key: "pending", label: "Pending", where: "AND status IN ('pending', 'sending')" },
  { key: "sent", label: "Sent", where: "AND status = 'sent'" },
  { key: "delivered", label: "Delivered", where: "AND status = 'delivered'" },
  { key: "read", label: "Read", where: "AND status = 'read'" },
  { key: "replied", label: "Replied", where: "AND replied_at IS NOT NULL" },
] as const;

const RECIPIENT_STYLE: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-700",
  sending: "bg-zinc-100 text-zinc-700",
  sent: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  read: "bg-emerald-200 text-emerald-900",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-zinc-100 text-zinc-500",
};

function sourceLabel(s: VariableSource | undefined) {
  if (!s) return "not set";
  if (s.kind === "text") return `"${s.value}"`;
  const field = s.field === "name" ? "Name" : s.field === "phone" ? "Phone" : `column "${s.field}"`;
  return s.fallback ? `${field}, or "${s.fallback}" if empty` : field;
}

/** Template text with each {{n}} shown as a coloured chip. */
function WithChips({ text, sources }: { text: string; sources: VariableSource[] }) {
  return (
    <>
      {text.split(/(\{\{\d+\}\})/g).map((part, i) => {
        const m = /^\{\{(\d+)\}\}$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <span
            key={i}
            title={sourceLabel(sources[Number(m[1]) - 1])}
            className="mx-px inline-flex rounded-md bg-[var(--s-brand-soft)] px-1.5 font-mono text-[12px] font-bold text-[var(--brand)]"
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

function Preview({ config }: { config: BroadcastConfig }) {
  const media = config.headerMedia;
  return (
    <div className="rounded-2xl bg-[#e7ddd3] p-3">
      <div className="max-w-sm rounded-xl rounded-tl-none bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm">
        {media && (
          <div className="mb-2 rounded-lg bg-zinc-100 px-2.5 py-2 text-xs text-zinc-600">
            <span className="font-bold capitalize">{media.type}:</span>{" "}
            <a href={media.link} target="_blank" rel="noreferrer" className="break-all text-[#027eb5] hover:underline">
              {media.filename || media.link}
            </a>
          </div>
        )}
        {config.header && !media && (
          <p className="mb-1 font-bold">
            <WithChips text={config.header} sources={config.headerVariables ?? []} />
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">
          <WithChips text={config.body ?? ""} sources={config.variables ?? []} />
        </p>
        {config.footer && <p className="mt-1 text-xs text-zinc-500">{config.footer}</p>}
      </div>
      {(config.buttons ?? []).map((b, i) => (
        <div key={i} className="mt-1 max-w-sm rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-[#027eb5] shadow-sm">
          {b}
        </div>
      ))}
    </div>
  );
}

function AudienceSummary({ audience }: { audience: AudienceSpec & { uploaded?: number } }) {
  const items: React.ReactNode[] = [];
  const list = (label: string, values: string[] | undefined) =>
    values?.length ? `${label}: ${values.map((v) => v.replace(/_/g, " ")).join(", ")}` : null;
  if (audience.clients) {
    const filters = [list("type", audience.clients.types), list("status", audience.clients.statuses), list("source", audience.clients.sources)].filter(Boolean);
    items.push(<>CRM clients{filters.length ? ` (${filters.join("; ")})` : " (all)"}</>);
  }
  if (audience.members) items.push(<>Website members with a phone number</>);
  if (audience.enquiries) items.push(<>People who enquired {audience.enquiries.days ? `in the last ${audience.enquiries.days} days` : "at any time"}</>);
  if (audience.uploaded) items.push(<>{audience.uploaded} uploaded or pasted number{audience.uploaded === 1 ? "" : "s"}</>);
  if (!items.length) return <p className="text-sm text-[var(--s-muted)]">Not recorded.</p>;
  return (
    <ul className="space-y-1.5 text-sm text-[var(--s-text)]">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
          <span>{item}</span>
        </li>
      ))}
      <li className="pt-1 text-xs text-[var(--s-muted)]">De-duplicated by phone number; opted-out and invalid numbers were left out.</li>
    </ul>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold text-[var(--s-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-[var(--s-text)]">{children}</dd>
    </div>
  );
}

export default async function BroadcastReportPage({ params, searchParams }: PageProps<"/admin/broadcasts/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await getBroadcast(id);
  if (!b) notFound();

  const config = parsed<BroadcastConfig>(b.config);
  const audience = parsed<AudienceSpec & { uploaded?: number }>(b.audience);
  const tab = RECIPIENT_TABS.find((t) => t.key === sp.status) ?? RECIPIENT_TABS[0];
  const page = pageFrom(sp.page);

  const [counts, recipients] = await Promise.all([
    broadcastCounts([id]).then((m) => m.get(id)!),
    db.all<RecipientRow>(
      `SELECT id, phone, name, params, status, error, sent_at, replied_at, updated_at FROM broadcast_recipients
        WHERE broadcast_id = ? ${tab.where} ORDER BY id LIMIT ? OFFSET ?`,
      [id, PER_PAGE, (page - 1) * PER_PAGE],
    ),
  ]);

  const ok = accepted(counts);
  const delivered = counts.delivered + counts.read;
  const waiting = counts.pending + counts.sending;
  const tabCount: Record<string, number> = {
    all: counts.total,
    failed: counts.failed,
    pending: waiting,
    sent: counts.sent,
    delivered: counts.delivered,
    read: counts.read,
    replied: counts.replied,
  };
  const href = (key: string, pg = 1) => {
    const q = new URLSearchParams();
    if (key !== "all") q.set("status", key);
    if (pg > 1) q.set("page", String(pg));
    const s = q.toString();
    return `/admin/broadcasts/${id}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <Link href="/admin/broadcasts" className="mb-3 inline-flex text-sm font-bold text-[var(--s-muted)] hover:text-[var(--s-text)]">
        ← Broadcasts
      </Link>

      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2.5 text-[28px] leading-tight font-extrabold tracking-tight text-[var(--s-text)]">
            <span className="min-w-0 break-words">{b.name}</span>
            <BroadcastStatusBadge status={b.status} />
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[var(--s-muted)]">
            <span className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--s-text-2)]">{b.template_name}</span>
            <span>{b.template_lang}</span>
            {b.template_category && <span className="capitalize">· {b.template_category.toLowerCase()}</span>}
          </p>
        </div>
        <BroadcastControls
          id={b.id}
          name={b.name}
          status={b.status}
          scheduledAt={b.scheduled_at}
          pending={waiting}
          failed={counts.failed}
        />
      </div>

      <dl className="mb-7 grid grid-cols-2 gap-4 rounded-3xl bg-white p-5 shadow-[var(--s-shadow)] sm:grid-cols-4">
        <Meta label="Created by">{b.created_by_name ?? "—"}</Meta>
        <Meta label="Scheduled for">{formatDateTime(b.scheduled_at)}</Meta>
        <Meta label="Started">{formatDateTime(b.started_at)}</Meta>
        <Meta label={b.status === "cancelled" ? "Cancelled" : "Finished"}>{formatDateTime(b.finished_at)}</Meta>
      </dl>

      <div className="s-stats mb-5">
        <StatCard label="Recipients" value={counts.total} />
        <StatCard label="Sent" value={ok} />
        <StatCard label="Delivered" value={delivered} />
        <StatCard label="Read" value={counts.read} />
        <StatCard label="Replied" value={counts.replied} />
        <StatCard label="Failed" value={counts.failed} tone={counts.failed ? "bad" : "default"} />
        <StatCard label="Pending" value={waiting} />
        <StatCard label="Delivered rate" value={pct(delivered, ok)} />
        <StatCard label="Read rate" value={pct(counts.read, ok)} />
      </div>

      <div className="mb-8 rounded-3xl bg-white p-5 shadow-[var(--s-shadow)]">
        <div className="mb-3 flex items-baseline justify-between gap-3 text-sm">
          <span className="font-bold text-[var(--s-text)]">Progress</span>
          <span className="text-[var(--s-muted)] tabular-nums">
            {counts.total - waiting} of {counts.total} processed
            {counts.skipped ? ` · ${counts.skipped} skipped` : ""}
          </span>
        </div>
        <ProgressBar counts={counts} size="lg" />
      </div>

      <div className="mb-10 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading>Message</SectionHeading>
          <Preview config={config} />
          {(config.variables?.length > 0 || config.headerVariables?.length > 0) && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--s-muted)]">
              {(config.headerVariables ?? []).map((s, i) => (
                <li key={`h${i}`}>
                  <span className="font-mono font-bold text-[var(--brand)]">Header {`{{${i + 1}}}`}</span> = {sourceLabel(s)}
                </li>
              ))}
              {(config.variables ?? []).map((s, i) => (
                <li key={`b${i}`}>
                  <span className="font-mono font-bold text-[var(--brand)]">{`{{${i + 1}}}`}</span> = {sourceLabel(s)}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <SectionHeading>Audience</SectionHeading>
          <div className="rounded-3xl bg-white p-5 shadow-[var(--s-shadow)]">
            <AudienceSummary audience={audience} />
          </div>
        </section>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionHeading className="!mb-0" count={counts.total}>
          Recipients
        </SectionHeading>
        <a href={`/admin/broadcasts/${id}/export${tab.key === "all" ? "" : `?status=${tab.key}`}`} className="btn-secondary px-4 py-2 text-sm" download>
          Download CSV
        </a>
      </div>
      <Tabs active={tab.key} tabs={RECIPIENT_TABS.map((t) => ({ key: t.key, label: t.label, href: href(t.key), count: tabCount[t.key] }))} />

      {recipients.length ? (
        <>
          <Table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Name</th>
                <th>Variables</th>
                <th>Status</th>
                <th>Error</th>
                <th>Sent</th>
                <th>Replied</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => {
                const p = parsed<{ body?: string[]; header?: string[] }>(r.params);
                const vars = [...(p.header ?? []), ...(p.body ?? [])].join(" | ");
                return (
                  <tr key={r.id}>
                    <td className="font-semibold whitespace-nowrap tabular-nums">{displayPhone(r.phone)}</td>
                    <td className="max-w-40 truncate">{r.name ?? <span className="text-[var(--s-muted)]">—</span>}</td>
                    <td className="max-w-xs truncate text-xs text-[var(--s-muted)]" title={vars}>
                      {vars || "—"}
                    </td>
                    <td>
                      <span className={`badge whitespace-nowrap capitalize ${RECIPIENT_STYLE[r.status] ?? RECIPIENT_STYLE.pending}`}>{r.status}</span>
                    </td>
                    <td className="max-w-56 truncate text-xs font-medium text-[var(--s-late)]" title={r.error ?? undefined}>
                      {r.error ?? ""}
                    </td>
                    <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDateTime(r.sent_at)}</td>
                    <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDateTime(r.replied_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} perPage={PER_PAGE} total={tabCount[tab.key] ?? 0} href={(pg) => href(tab.key, pg)} />
        </>
      ) : (
        <Empty>No {tab.key === "all" ? "" : `${tab.label.toLowerCase()} `}recipients.</Empty>
      )}
    </>
  );
}
