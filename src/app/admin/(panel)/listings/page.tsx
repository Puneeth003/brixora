import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { daysFromNowIso } from "@/lib/time";
import { db, likeEscape } from "@/lib/db";
import { Empty, PageHeader, Tabs } from "@/components/admin/ui";
import { PROPERTY_ROW_SELECT, PropertyTable, type PropertyRow } from "@/components/admin/PropertyTable";

export const metadata: Metadata = { title: "Listings" };

const TABS = [
  { key: "approved", label: "Live" },
  { key: "expiring", label: "Expiring soon" },
  { key: "sold_pending", label: "Sold – pending" },
  { key: "sold", label: "Sold" },
  { key: "expired", label: "Expired" },
  { key: "archived", label: "Archived" },
] as const;

export default async function ListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  await requireAdmin();
  await connection();
  const sp = await searchParams;
  const active = TABS.find((t) => t.key === sp.tab)?.key ?? "approved";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";

  const where: string[] = [];
  const values: unknown[] = [];
  if (active === "expiring") {
    where.push("p.status = 'approved'", "p.expires_at <= ?");
    values.push(daysFromNowIso(7));
  } else {
    where.push("p.status = ?");
    values.push(active);
  }
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push("(p.title LIKE ? OR p.reference_no LIKE ? OR p.locality LIKE ?)");
    values.push(like, like, like);
  }
  const order = active === "expiring" ? "p.expires_at ASC" : active === "approved" ? "p.approved_at DESC" : "p.updated_at DESC";
  const rows = await db.all<PropertyRow>(`${PROPERTY_ROW_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 200`, values);

  return (
    <>
      <PageHeader
        title="Listings"
        actions={
          <form className="flex w-full gap-2 sm:w-auto">
            <input type="hidden" name="tab" value={active} />
            <input name="q" defaultValue={q} placeholder="Search ref, title, locality" className="input w-full sm:w-72" />
            <button className="btn-secondary">Search</button>
          </form>
        }
      />
      {typeof sp.removed === "string" && (
        <p className="mb-4 rounded-2xl bg-[var(--s-brand-soft)] px-4 py-3 text-sm font-semibold text-[var(--brand)]">
          {sp.removed} was deleted permanently.
        </p>
      )}
      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/listings?tab=${t.key}` }))} />
      {rows.length ? (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold tracking-tight">
            {q ? `Results for “${q}”` : TABS.find((t) => t.key === active)!.label}
            <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{rows.length}</span>
          </h2>
          <PropertyTable rows={rows} actions dateField={active === "approved" || active === "expiring" ? "expires_at" : "approved_at"} />
        </>
      ) : (
        <Empty>No listings.</Empty>
      )}
    </>
  );
}
