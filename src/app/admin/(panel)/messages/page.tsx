import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone, formatDateTime } from "@/lib/format";
import { Empty, PageHeader, Table, Tabs } from "@/components/admin/ui";
import { MessageStatusBadge } from "@/components/StatusBadge";
import type { Message } from "@/lib/types";
import { retryWhatsApp } from "../../actions";

export const metadata: Metadata = { title: "WhatsApp messages" };

const TABS = [
  { key: "all", label: "All" },
  { key: "failed", label: "Failed" },
  { key: "queued", label: "Queued" },
] as const;

export default async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireAdmin();
  const { status } = await searchParams;
  const active = TABS.find((t) => t.key === status)?.key ?? "all";

  const rows = await db.all<Message>(
    `SELECT * FROM messages ${active === "all" ? "" : "WHERE status = ?"} ORDER BY created_at DESC LIMIT 300`,
    active === "all" ? [] : [active],
  );

  return (
    <>
      <PageHeader title="WhatsApp messages" description="Every template message sent, with delivery status from the WhatsApp webhook." />
      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "all" ? "/admin/messages" : `/admin/messages?status=${t.key}` }))} />
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>To</th>
              <th>Template</th>
              <th>Parameters</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="transition-colors hover:bg-[var(--s-hover)]">
                <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDateTime(m.created_at)}</td>
                <td className="font-semibold whitespace-nowrap tabular-nums">{displayPhone(m.recipient_phone)}</td>
                <td>
                  <span className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold text-[var(--s-text-2)]">{m.template_name}</span>
                </td>
                <td className="max-w-xs truncate text-xs text-[var(--s-muted)]" title={(m.payload.params ?? []).join(" | ")}>
                  {(m.payload.params ?? []).join(" | ")}
                </td>
                <td>
                  <MessageStatusBadge status={m.status} />
                  {m.error && <span className="mt-1 block max-w-xs truncate text-xs font-medium text-[var(--s-late)]" title={m.error}>{m.error}</span>}
                  {m.attempts > 1 && <span className="mt-0.5 block text-xs text-[var(--s-muted)]">{m.attempts} attempts</span>}
                </td>
                <td>
                  {(m.status === "failed" || m.status === "queued") && m.template_name !== "otp_login" && (
                    <form action={retryWhatsApp.bind(null, m.id)}>
                      <button className="btn-secondary px-3 py-1 text-xs">Retry</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>No messages.</Empty>
      )}
    </>
  );
}
