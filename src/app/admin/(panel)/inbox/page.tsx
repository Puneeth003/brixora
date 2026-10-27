import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientScope } from "@/lib/crm";
import { displayPhone, formatDateTime } from "@/lib/format";
import { Empty, PageHeader, Tabs } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Inbox" };

type Row = {
  id: string;
  client_id: string | null;
  name: string;
  phone: string;
  reference_no: string | null;
  first_message: string | null;
  last_body: string | null;
  last_sender: "staff" | "member" | null;
  last_at: string;
  unread: number;
  has_account: boolean;
};

function initials(name: string) {
  const parts = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Enquiry conversations, newest activity first. Agents see their own clients only. */
export default async function InboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  const staff = await requireStaff();
  const { tab } = await searchParams;
  const active = tab === "all" ? "all" : tab === "unanswered" ? "unanswered" : "unread";
  const scope = clientScope(staff);

  const having =
    active === "unread" ? "HAVING unread > 0" : active === "unanswered" ? "HAVING last_sender IS NULL OR last_sender = 'member'" : "";
  const rows = await db.all<Row>(
    `SELECT e.id, e.client_id, e.name, e.phone, p.reference_no, e.message AS first_message, (e.user_id IS NOT NULL) AS has_account,
            (SELECT m.body FROM enquiry_messages m WHERE m.enquiry_id = e.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
            (SELECT m.sender FROM enquiry_messages m WHERE m.enquiry_id = e.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
            COALESCE((SELECT MAX(m.created_at) FROM enquiry_messages m WHERE m.enquiry_id = e.id), e.created_at) AS last_at,
            (SELECT COUNT(*) FROM enquiry_messages m WHERE m.enquiry_id = e.id AND m.sender = 'member' AND m.read_at IS NULL) AS unread
       FROM enquiries e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN properties p ON p.id = e.property_id
      WHERE ${staff.role === "admin" ? "1 = 1" : scope.sql}
      ${having}
      ORDER BY unread DESC, last_at DESC LIMIT 200`,
    scope.values,
  );

  return (
    <>
      <PageHeader title="Inbox" description="Website enquiries and members' messages. Reply from the client page; members read replies in their account." />
      <Tabs
        active={active}
        tabs={[
          { key: "unread", label: "Unread", href: "/admin/inbox" },
          { key: "unanswered", label: "Awaiting reply", href: "/admin/inbox?tab=unanswered" },
          { key: "all", label: "All", href: "/admin/inbox?tab=all" },
        ]}
      />
      {rows.length ? (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const inner = (
              <>
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-[var(--s-brand-soft)] text-sm font-extrabold text-[var(--brand)]">
                  {initials(r.name)}
                  {r.unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-[var(--s-late)]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[var(--s-text)] ${r.unread > 0 ? "font-extrabold" : "font-bold"}`}>{r.name}</span>
                    {r.unread > 0 && <span className="rounded-full bg-[var(--s-late)] px-2 py-0.5 text-[11px] font-extrabold text-white">{r.unread} new</span>}
                    {r.has_account && <span className="badge bg-[var(--s-seg)] text-[var(--s-text-2)]">Member</span>}
                    {r.reference_no && <span className="font-mono text-xs text-[var(--s-muted)]">{r.reference_no}</span>}
                  </span>
                  <span className={`mt-0.5 block truncate text-sm ${r.unread > 0 ? "font-semibold text-[var(--s-text-2)]" : "text-[var(--s-muted)]"}`}>
                    {r.last_sender === "staff" && <span className="text-[var(--s-muted)]">You: </span>}
                    {r.last_body ?? r.first_message ?? "(no message)"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block whitespace-nowrap text-xs font-semibold text-[var(--s-muted)]">{formatDateTime(r.last_at)}</span>
                  <span className="block whitespace-nowrap text-xs text-[var(--s-muted)]">{displayPhone(r.phone)}</span>
                </span>
              </>
            );
            const cls = "flex items-center gap-4 rounded-[20px] bg-white px-5 py-4 shadow-[var(--s-shadow)] transition-shadow";
            return r.client_id ? (
              <Link key={r.id} href={`/admin/clients/${r.client_id}#enquiry-${r.id}`} className={`${cls} hover:shadow-[var(--s-shadow-lg)]`}>
                {inner}
              </Link>
            ) : (
              <div key={r.id} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      ) : (
        <Empty>{active === "unread" ? "No unread messages." : "Nothing here."}</Empty>
      )}
    </>
  );
}
