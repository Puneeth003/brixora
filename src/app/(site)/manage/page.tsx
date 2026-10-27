import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { MY_PROPERTY_SELECT } from "@/lib/owner";
import { formatDate, formatPrice, displayPhone } from "@/lib/format";
import { publicImageUrl } from "@/lib/site";
import { ManageLogin } from "@/components/public/ManageLogin";
import { PropertyStatusBadge } from "@/components/StatusBadge";
import type { MyProperty } from "@/lib/types";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Manage my listing", robots: { index: false } };

export default function ManagePage({ searchParams }: PageProps<"/manage">) {
  return (
    <div className="container-page max-w-4xl py-10">
      <Suspense fallback={<div className="card mx-auto h-64 max-w-md animate-pulse bg-zinc-50" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/manage">, "searchParams">) {
  const owner = await getOwner();
  if (!owner) {
    const { next } = await searchParams;
    return <ManageLogin next={typeof next === "string" ? next : undefined} />;
  }

  const [list, requests] = await Promise.all([
    db.all<MyProperty>(
      `SELECT ${MY_PROPERTY_SELECT} FROM properties p WHERE p.owner_id = ? AND p.status <> 'draft' ORDER BY p.created_at DESC`,
      [owner.id],
    ),
    db.all<{ property_id: string }>(
      `SELECT r.property_id FROM change_requests r JOIN properties p ON p.id = r.property_id
        WHERE p.owner_id = ? AND r.status = 'pending' AND r.submitted = 1`,
      [owner.id],
    ),
  ]);
  const pending = new Map<string, number>();
  for (const r of requests) pending.set(r.property_id, (pending.get(r.property_id) ?? 0) + 1);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My listings</h1>
          <p className="text-sm text-zinc-500">
            Signed in as {owner.profile.name ? `${owner.profile.name} · ` : ""}
            {displayPhone(owner.phone)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/account" className="btn-secondary">
            My account
          </Link>
          <Link href="/post" className="btn-primary">
            Post another property
          </Link>
          <form action={signOut}>
            <button className="btn-secondary">Sign out</button>
          </form>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-zinc-500">
          You haven&apos;t submitted any properties with this number yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => {
            const img = publicImageUrl(p.cover_path);
            return (
              <li key={p.id}>
                <Link href={`/manage/${p.reference_no}`} className="card flex gap-4 p-3 hover:shadow-sm">
                  <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                    {img && <Image src={img} alt="" fill sizes="128px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PropertyStatusBadge status={p.status} />
                      <span className="font-mono text-xs text-zinc-500">{p.reference_no}</span>
                      {pending.get(p.id) ? (
                        <span className="badge bg-amber-50 text-amber-700">{pending.get(p.id)} request pending</span>
                      ) : null}
                    </div>
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-sm text-zinc-600">
                      {formatPrice(p.price, p.listing_type)} · {p.locality}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Submitted {formatDate(p.submitted_at)}
                      {p.status === "approved" && p.expires_at ? ` · Live until ${formatDate(p.expires_at)}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
