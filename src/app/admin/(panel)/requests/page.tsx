import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { CHANGE_TYPE_LABELS } from "@/lib/constants";
import { Empty, PageHeader, Table, Tabs } from "@/components/admin/ui";
import { RequestStatusBadge } from "@/components/StatusBadge";
import type { ChangeRequest, Property } from "@/lib/types";

export const metadata: Metadata = { title: "Change requests" };

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

type Row = ChangeRequest & { property: Pick<Property, "id" | "reference_no" | "title" | "price" | "listing_type"> };

export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  await requireAdmin();
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? "pending";

  const order = active === "pending" ? "r.requested_at ASC" : "r.reviewed_at DESC";
  const flat = await db.all<ChangeRequest & { p_id: string; p_reference_no: string; p_title: string; p_price: number; p_listing_type: Property["listing_type"] }>(
    `SELECT r.*, p.id AS p_id, p.reference_no AS p_reference_no, p.title AS p_title, p.price AS p_price, p.listing_type AS p_listing_type
       FROM change_requests r JOIN properties p ON p.id = r.property_id
      WHERE r.status = ? AND r.submitted = 1 ORDER BY ${order} LIMIT 200`,
    [active],
  );
  const rows: Row[] = flat.map(({ p_id, p_reference_no, p_title, p_price, p_listing_type, ...r }) => ({
    ...r,
    property: { id: p_id, reference_no: p_reference_no, title: p_title, price: p_price, listing_type: p_listing_type },
  }));

  return (
    <>
      <PageHeader title="Change requests" description="Owner requests to change price, update details or mark sold." />
      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/requests?tab=${t.key}` }))} />
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>Listing</th>
              <th>Request</th>
              <th>Proposed</th>
              <th>Status</th>
              <th>Requested</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-[var(--s-hover)]">
                <td>
                  <span className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold text-[var(--s-text-2)]">
                    {r.property.reference_no}
                  </span>
                  <span className="mt-1 block max-w-xs truncate text-xs text-[var(--s-muted)]">{r.property.title}</span>
                </td>
                <td>
                  <Link href={`/admin/requests/${r.id}`} className="font-bold text-brand-700 hover:underline">
                    {CHANGE_TYPE_LABELS[r.type]}
                  </Link>
                </td>
                <td className="text-[var(--s-text-2)]">
                  {r.type === "price" && r.proposed.price
                    ? `${formatPrice(r.property.price, r.property.listing_type)} → ${formatPrice(r.proposed.price, r.property.listing_type)}`
                    : r.type === "sold"
                      ? "Hidden; awaiting confirmation"
                      : "Details / photos"}
                </td>
                <td>
                  <RequestStatusBadge status={r.status} />
                </td>
                <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDateTime(r.requested_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>No {active} requests.</Empty>
      )}
    </>
  );
}
