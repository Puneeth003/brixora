import Link from "next/link";
import { formatDate, formatPrice } from "@/lib/format";
import { propertyTypeLabel } from "@/lib/constants";
import { PropertyStatusBadge } from "@/components/StatusBadge";
import { Table } from "./ui";
import { ListingRemoveMenu } from "./ListingRemoveMenu";
import type { Property } from "@/lib/types";

export type PropertyRow = Pick<
  Property,
  | "id"
  | "reference_no"
  | "title"
  | "status"
  | "price"
  | "listing_type"
  | "property_type"
  | "locality"
  | "featured"
  | "submitted_at"
  | "approved_at"
  | "expires_at"
  | "rejected_reason"
> & { owner_name: string | null };

export const PROPERTY_ROW_SELECT =
  "SELECT p.id, p.reference_no, p.title, p.status, p.price, p.listing_type, p.property_type, p.locality, p.featured, p.submitted_at, p.approved_at, p.expires_at, p.rejected_reason, u.name AS owner_name FROM properties p LEFT JOIN users u ON u.id = p.owner_id";

const TYPE_TONES: Record<string, { mono: string; tone: string }> = {
  apartment: { mono: "AP", tone: "bg-sky-100 text-sky-800" },
  villa: { mono: "VL", tone: "bg-violet-100 text-violet-800" },
  independent_house: { mono: "IH", tone: "bg-emerald-100 text-emerald-800" },
  plot: { mono: "PL", tone: "bg-amber-100 text-amber-800" },
  commercial: { mono: "CB", tone: "bg-rose-100 text-rose-800" },
  office: { mono: "OF", tone: "bg-indigo-100 text-indigo-800" },
  shop: { mono: "SH", tone: "bg-pink-100 text-pink-800" },
  warehouse: { mono: "WH", tone: "bg-stone-200 text-stone-800" },
};

export function PropertyTable({
  rows,
  dateField = "submitted_at",
  actions = false,
}: {
  rows: PropertyRow[];
  dateField?: "submitted_at" | "approved_at" | "expires_at";
  /** Show the "⋯" menu (remove from website / restore / delete). */
  actions?: boolean;
}) {
  const dateLabel = { submitted_at: "Submitted", approved_at: "Approved", expires_at: "Expires" }[dateField];
  return (
    <Table>
      <thead>
        <tr>
          <th>Ref</th>
          <th>Title</th>
          <th>Owner</th>
          <th>Price</th>
          <th>Status</th>
          <th>{dateLabel}</th>
          {actions && <th className="w-12" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const t = TYPE_TONES[p.property_type] ?? { mono: p.property_type.slice(0, 2).toUpperCase(), tone: "bg-[var(--s-seg)] text-[var(--s-text-2)]" };
          return (
            <tr key={p.id} className="transition-colors hover:bg-[var(--s-hover)]">
              <td>
                <Link
                  href={`/admin/properties/${p.id}`}
                  className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold whitespace-nowrap text-[var(--s-text-2)] hover:bg-[var(--s-brand-soft)] hover:text-[var(--brand)]"
                >
                  {p.reference_no}
                </Link>
              </td>
              <td className="max-w-sm">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold tracking-wide ${t.tone}`}
                    title={propertyTypeLabel(p.property_type)}
                    aria-hidden
                  >
                    {t.mono}
                  </span>
                  <div className="min-w-0">
                    <Link href={`/admin/properties/${p.id}`} className="block truncate font-semibold hover:text-[var(--brand)]">
                      {p.featured && <span className="mr-1 text-amber-500">★</span>}
                      {p.title}
                    </Link>
                    <span className="block truncate text-xs text-[var(--s-muted)]">
                      {propertyTypeLabel(p.property_type)} · {p.locality}
                    </span>
                    {p.status === "rejected" && p.rejected_reason && (
                      <span className="block truncate text-xs font-medium text-[var(--s-late)]">{p.rejected_reason}</span>
                    )}
                  </div>
                </div>
              </td>
              <td className="text-[var(--s-text-2)]">{p.owner_name ?? "—"}</td>
              <td className="font-semibold whitespace-nowrap tabular-nums">{formatPrice(p.price, p.listing_type)}</td>
              <td>
                <PropertyStatusBadge status={p.status} />
              </td>
              <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDate(p[dateField])}</td>
              {actions && (
                <td className="text-right">
                  <ListingRemoveMenu id={p.id} refNo={p.reference_no} title={p.title} status={p.status} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
