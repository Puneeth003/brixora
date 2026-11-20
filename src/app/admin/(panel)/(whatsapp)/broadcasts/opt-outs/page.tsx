import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone, formatDateTime } from "@/lib/format";
import { Empty, PageHeader, Pagination, Table, pageFrom } from "@/components/admin/ui";
import { AddOptOutsForm, RemoveOptOutButton } from "./OptOutsForm";

export const metadata: Metadata = { title: "Broadcast opt-outs" };

const PER_PAGE = 50;

const SOURCE: Record<string, { label: string; style: string }> = {
  reply: { label: "Replied STOP", style: "bg-amber-100 text-amber-800" },
  admin: { label: "Added by admin", style: "bg-zinc-100 text-zinc-700" },
  account: { label: "Website account", style: "bg-sky-100 text-sky-800" },
};

type Row = { phone: string; source: "reply" | "admin" | "account"; created_at: string | null; name: string | null };

export default async function OptOutsPage({ searchParams }: PageProps<"/admin/broadcasts/opt-outs">) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageFrom(sp.page);

  // A number can be in both lists; the wa_optouts row wins.
  const union = `
    SELECT o.phone, o.source, o.created_at, u.name FROM wa_optouts o LEFT JOIN users u ON u.phone = o.phone
    UNION ALL
    SELECT u.phone, 'account' AS source, NULL AS created_at, u.name FROM users u
     WHERE u.wa_opt_out = 1 AND u.phone IS NOT NULL AND u.phone NOT IN (SELECT phone FROM wa_optouts)`;
  const [total, rows] = await Promise.all([
    db.count(`SELECT COUNT(*) FROM (${union}) t`),
    db.all<Row>(`SELECT * FROM (${union}) t ORDER BY created_at IS NULL, created_at DESC, phone LIMIT ? OFFSET ?`, [PER_PAGE, (page - 1) * PER_PAGE]),
  ]);

  return (
    <>
      <Link href="/admin/broadcasts" className="mb-3 inline-flex text-sm font-bold text-[var(--s-muted)] hover:text-[var(--s-text)]">
        ← Broadcasts
      </Link>
      <PageHeader title="Opt-outs" count={total} description="Numbers here never get broadcasts, whatever audience you choose." />

      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-3xl bg-white p-5 shadow-[var(--s-shadow)]">
          <AddOptOutsForm />
        </div>
        <div className="rounded-3xl bg-[var(--s-brand-soft)] p-5 text-sm text-[var(--s-text)]">
          <p className="font-extrabold">How opt-outs work</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            <li>
              Anyone who replies <b>STOP</b> to a WhatsApp message is added automatically.
            </li>
            <li>
              If they later reply <b>START</b>, they are removed and can get broadcasts again.
            </li>
            <li>Website members who turned off WhatsApp messages in their account are listed too.</li>
          </ul>
        </div>
      </div>

      {rows.length ? (
        <>
          <Table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Name</th>
                <th>Source</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = SOURCE[r.source] ?? SOURCE.admin;
                return (
                  <tr key={r.phone}>
                    <td className="font-semibold whitespace-nowrap tabular-nums">{displayPhone(r.phone)}</td>
                    <td>{r.name ?? <span className="text-[var(--s-muted)]">—</span>}</td>
                    <td>
                      <span className={`badge whitespace-nowrap ${s.style}`}>{s.label}</span>
                    </td>
                    <td className="whitespace-nowrap text-[var(--s-muted)]">{formatDateTime(r.created_at)}</td>
                    <td className="text-right">
                      <RemoveOptOutButton phone={r.phone} account={r.source === "account"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} perPage={PER_PAGE} total={total} href={(pg) => (pg > 1 ? `/admin/broadcasts/opt-outs?page=${pg}` : "/admin/broadcasts/opt-outs")} />
        </>
      ) : (
        <Empty>No one has opted out.</Empty>
      )}
    </>
  );
}
