import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db, likeEscape } from "@/lib/db";
import { Empty, PageHeader, Pagination, Tabs, pageFrom } from "@/components/admin/ui";
import { PROPERTY_ROW_SELECT, PropertyTable, type PropertyRow } from "@/components/admin/PropertyTable";

export const metadata: Metadata = { title: "Submissions" };

// The two-step approval as queues: the auditor verifies on site, then an admin approves.
const IN_REVIEW = "p.status IN ('pending', 'under_review')";
const HAD_ISSUES = "EXISTS (SELECT 1 FROM site_verifications v WHERE v.property_id = p.id AND v.status = 'completed' AND v.result = 'issues')";

const TABS = [
  { key: "audit", label: "Needs site audit", where: `${IN_REVIEW} AND p.verified_at IS NULL AND NOT ${HAD_ISSUES}`, order: "ASC" },
  { key: "approval", label: "Ready for final approval", where: `${IN_REVIEW} AND p.verified_at IS NOT NULL`, order: "ASC" },
  { key: "issues", label: "Audit found issues", where: `${IN_REVIEW} AND p.verified_at IS NULL AND ${HAD_ISSUES}`, order: "ASC" },
  { key: "rejected", label: "Rejected", where: "p.status = 'rejected'", order: "DESC" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const PER_PAGE = 50;

export default async function SubmissionsPage({ searchParams }: PageProps<"/admin/submissions">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const page = pageFrom(sp.page);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";

  const search: string[] = [];
  const values: unknown[] = [];
  if (q) {
    const like = `%${likeEscape(q)}%`;
    const digits = q.replace(/\D/g, "");
    search.push(`(p.title LIKE ? OR p.reference_no LIKE ? OR p.locality LIKE ? OR u.name LIKE ?${digits.length >= 4 ? " OR u.phone LIKE ?" : ""})`);
    values.push(like, like, like, like, ...(digits.length >= 4 ? [`%${digits}%`] : []));
  }
  const and = search.length ? ` AND ${search.join(" AND ")}` : "";

  const [counts, rows] = await Promise.all([
    db.one<Record<TabKey, number>>(
      `SELECT ${TABS.map((t) => `SUM(${t.where}) AS ${t.key}`).join(", ")} FROM properties p LEFT JOIN users u ON u.id = p.owner_id WHERE 1 = 1${and}`,
      values,
    ),
    db.all<PropertyRow>(`${PROPERTY_ROW_SELECT} WHERE ${tab.where}${and} ORDER BY p.submitted_at ${tab.order} LIMIT ? OFFSET ?`, [
      ...values,
      PER_PAGE,
      (page - 1) * PER_PAGE,
    ]),
  ]);
  const href = (key: TabKey, pg = 1) =>
    `/admin/submissions?${new URLSearchParams({ tab: key, ...(q ? { q } : {}), ...(pg > 1 ? { page: String(pg) } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Submissions"
        description="New properties from owners, oldest first. The auditor verifies on site, then a different admin gives the final approval."
        actions={
          <form className="flex w-full gap-2 sm:w-auto">
            <input type="hidden" name="tab" value={tab.key} />
            <input name="q" defaultValue={q} placeholder="Search ref, title, locality, owner" className="input w-full sm:w-72" />
            <button className="btn-secondary">Search</button>
          </form>
        }
      />
      <Tabs active={tab.key} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: href(t.key), count: Number(counts?.[t.key] ?? 0) }))} />
      {rows.length ? (
        <PropertyTable rows={rows} />
      ) : (
        <Empty>{q ? `Nothing matches “${q}”.` : "Nothing here."}</Empty>
      )}
      <Pagination page={page} perPage={PER_PAGE} total={Number(counts?.[tab.key] ?? 0)} href={(pg) => href(tab.key, pg)} />
    </>
  );
}
