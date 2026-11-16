import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone, formatDateTime } from "@/lib/format";
import { Empty, PageHeader, Pagination, Table, Tabs, pageFrom } from "@/components/admin/ui";
import type { Enquiry } from "@/lib/types";
import { retryEnquiryForward } from "../../actions";

export const metadata: Metadata = { title: "Enquiries" };

type Row = Enquiry & {
  p_id: string | null;
  p_reference_no: string | null;
  p_title: string | null;
  c_id: string | null;
  c_status: string | null;
  agent_name: string | null;
};

const PER_PAGE = 50;

const TAB_WHERE = {
  // Nobody has contacted them yet: no CRM client, or the client is still "new".
  // Same condition as the sidebar badge (admin layout).
  new: "(c.id IS NULL OR c.status = 'new')",
  all: "1 = 1",
  failed: "e.forwarded = 0",
} as const;
type TabKey = keyof typeof TAB_WHERE;

const FROM = "FROM enquiries e LEFT JOIN properties p ON p.id = e.property_id LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN users a ON a.id = c.assigned_to";

export default async function EnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: TabKey = sp.tab === "all" || sp.tab === "failed" ? sp.tab : "new";
  const page = pageFrom(sp.page);

  const [counts, rows] = await Promise.all([
    db.one<Record<TabKey, number>>(
      `SELECT SUM(${TAB_WHERE.new}) AS new, COUNT(*) AS \`all\`, SUM(${TAB_WHERE.failed}) AS failed ${FROM}`,
    ),
    db.all<Row>(
      `SELECT e.*, p.id AS p_id, p.reference_no AS p_reference_no, p.title AS p_title,
              c.id AS c_id, c.status AS c_status, a.name AS agent_name
         ${FROM} WHERE ${TAB_WHERE[tab]}
        ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [PER_PAGE, (page - 1) * PER_PAGE],
    ),
  ]);
  const href = (t: TabKey, pg = 1) => `/admin/enquiries?${new URLSearchParams({ ...(t !== "new" ? { tab: t } : {}), ...(pg > 1 ? { page: String(pg) } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Every enquiry comes to the brokerage. New ones haven't been contacted yet: open the client to call back and log it."
        actions={
          <a href="/admin/enquiries/export" className="btn-secondary">
            Export CSV
          </a>
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: "new", label: "New", href: href("new"), count: Number(counts?.new ?? 0) },
          { key: "all", label: "All", href: href("all"), count: Number(counts?.all ?? 0) },
          { key: "failed", label: "Not forwarded", href: href("failed"), count: Number(counts?.failed ?? 0) },
        ]}
      />
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Listing</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Message</th>
              <th>Client</th>
              <th>Forwarded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="transition-colors hover:bg-[var(--s-hover)]">
                <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDateTime(e.created_at)}</td>
                <td>
                  {e.p_id ? (
                    <Link
                      href={`/admin/properties/${e.p_id}`}
                      title={e.p_title ?? undefined}
                      className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold whitespace-nowrap text-[var(--s-text-2)] hover:bg-[var(--s-brand-soft)] hover:text-[var(--brand)]"
                    >
                      {e.p_reference_no}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="font-semibold">{e.name}</td>
                <td className="whitespace-nowrap">
                  <a href={`tel:+${e.phone}`} className="tabular-nums hover:text-[var(--brand)]">
                    {displayPhone(e.phone)}
                  </a>
                </td>
                <td className="max-w-sm text-[var(--s-text-2)]">{e.message ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {e.c_id ? (
                    <Link href={`/admin/clients/${e.c_id}`} className="font-semibold text-[var(--brand)] hover:underline">
                      {e.c_status === "new" ? "Not contacted" : "Open client"}
                      <span className="block text-xs font-normal text-[var(--s-muted)]">{e.agent_name ?? "Unassigned"}</span>
                    </Link>
                  ) : (
                    <span className="text-[var(--s-muted)]">No client</span>
                  )}
                </td>
                <td>
                  {e.forwarded ? (
                    <span className="badge inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800">
                      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                      Forwarded
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge inline-flex items-center gap-1.5 bg-red-100 text-red-700" title={e.forward_error ?? ""}>
                        <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
                        Not sent
                      </span>
                      <form action={retryEnquiryForward.bind(null, e.id)}>
                        <button className="btn-secondary px-2.5 py-1 text-xs">Retry</button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>{tab === "new" ? "No new enquiries. Everyone has been contacted." : "No enquiries yet."}</Empty>
      )}
      <Pagination page={page} perPage={PER_PAGE} total={Number(counts?.[tab] ?? 0)} href={(pg) => href(tab, pg)} />
    </>
  );
}
