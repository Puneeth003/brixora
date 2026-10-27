import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Empty, PageHeader, Tabs } from "@/components/admin/ui";
import { PROPERTY_ROW_SELECT, PropertyTable, type PropertyRow } from "@/components/admin/PropertyTable";
import type { PropertyStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Submissions" };

const TABS: { key: PropertyStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "under_review", label: "Under review" },
  { key: "rejected", label: "Rejected" },
];

export default async function SubmissionsPage({ searchParams }: PageProps<"/admin/submissions">) {
  await requireAdmin();
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? "pending";

  const counts = await Promise.all(TABS.map((t) => db.count("SELECT COUNT(*) FROM properties WHERE status = ?", [t.key])));
  const rows = await db.all<PropertyRow>(
    `${PROPERTY_ROW_SELECT} WHERE p.status = ? ORDER BY p.submitted_at ${active === "rejected" ? "DESC" : "ASC"} LIMIT 200`,
    [active],
  );

  return (
    <>
      <PageHeader title="Submissions" description="New properties from owners, oldest first." />
      <Tabs
        active={active}
        tabs={TABS.map((t, i) => ({ key: t.key, label: t.label, href: `/admin/submissions?tab=${t.key}`, count: counts[i] }))}
      />
      {rows.length ? (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold tracking-tight">
            {TABS.find((t) => t.key === active)!.label}
            <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{rows.length}</span>
          </h2>
          <PropertyTable rows={rows} />
        </>
      ) : (
        <Empty>Nothing here.</Empty>
      )}
    </>
  );
}
