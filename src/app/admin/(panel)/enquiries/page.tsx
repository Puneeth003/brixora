import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone, formatDateTime } from "@/lib/format";
import { Empty, PageHeader, Table, Tabs } from "@/components/admin/ui";
import type { Enquiry } from "@/lib/types";
import { retryEnquiryForward } from "../../actions";

export const metadata: Metadata = { title: "Enquiries" };

type Row = Enquiry & { property: { id: string; reference_no: string; title: string } | null };

export default async function EnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  await requireAdmin();
  const { tab } = await searchParams;
  const failedOnly = tab === "failed";

  const flat = await db.all<Enquiry & { p_id: string | null; p_reference_no: string | null; p_title: string | null }>(
    `SELECT e.*, p.id AS p_id, p.reference_no AS p_reference_no, p.title AS p_title
       FROM enquiries e LEFT JOIN properties p ON p.id = e.property_id
      ${failedOnly ? "WHERE e.forwarded = 0" : ""}
      ORDER BY e.created_at DESC LIMIT 300`,
  );
  const rows: Row[] = flat.map(({ p_id, p_reference_no, p_title, ...e }) => ({
    ...e,
    property: p_id ? { id: p_id, reference_no: p_reference_no!, title: p_title! } : null,
  }));

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Read-only log. Every enquiry is forwarded to the brokerage WhatsApp number."
        actions={
          <a href="/admin/enquiries/export" className="btn-secondary">
            Export CSV
          </a>
        }
      />
      <Tabs
        active={failedOnly ? "failed" : "all"}
        tabs={[
          { key: "all", label: "All", href: "/admin/enquiries" },
          { key: "failed", label: "Not forwarded", href: "/admin/enquiries?tab=failed" },
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
              <th>Forwarded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="transition-colors hover:bg-[var(--s-hover)]">
                <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDateTime(e.created_at)}</td>
                <td>
                  {e.property ? (
                    <Link
                      href={`/admin/properties/${e.property.id}`}
                      title={e.property.title}
                      className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold whitespace-nowrap text-[var(--s-text-2)] hover:bg-[var(--s-brand-soft)] hover:text-[var(--brand)]"
                    >
                      {e.property.reference_no}
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
        <Empty>No enquiries yet.</Empty>
      )}
    </>
  );
}
