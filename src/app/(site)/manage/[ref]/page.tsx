import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { MY_PROPERTY_SELECT } from "@/lib/owner";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { CHANGE_TYPE_LABELS } from "@/lib/constants";
import { publicImageUrl } from "@/lib/site";
import { PropertyStatusBadge, RequestStatusBadge } from "@/components/StatusBadge";
import { OwnerRequests } from "@/components/public/OwnerRequests";
import type { ChangeRequest, MyProperty, PropertyImage } from "@/lib/types";

export const metadata: Metadata = { title: "Manage listing", robots: { index: false } };

export default function ManageListingPage({ params }: PageProps<"/manage/[ref]">) {
  return (
    <div className="container-page max-w-4xl py-10">
      <Suspense fallback={<div className="card h-96 animate-pulse bg-zinc-50" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<PageProps<"/manage/[ref]">, "params">) {
  const { ref } = await params;
  const owner = await requireOwner(`/manage/${ref}`);

  const p = await db.one<MyProperty>(
    `SELECT ${MY_PROPERTY_SELECT} FROM properties p WHERE p.reference_no = ? AND p.owner_id = ? AND p.status <> 'draft'`,
    [ref, owner.id],
  );
  if (!p) notFound();

  const [imgs, requests] = await Promise.all([
    db.all<Pick<PropertyImage, "id" | "watermarked_path" | "is_visible" | "approved" | "change_request_id">>(
      "SELECT id, watermarked_path, is_visible, approved, change_request_id FROM property_images WHERE property_id = ? ORDER BY sort_order",
      [p.id],
    ),
    db.all<ChangeRequest>(
      "SELECT id, property_id, type, proposed, status, requested_at, submitted, reviewed_at, admin_note, NULL AS reviewed_by FROM change_requests WHERE property_id = ? AND submitted = 1 ORDER BY requested_at DESC",
      [p.id],
    ),
  ]);
  const liveImages = imgs
    .filter((i) => !i.change_request_id || i.approved)
    .map((i) => ({ id: i.id, url: publicImageUrl(i.watermarked_path)!, is_visible: i.is_visible }));
  const blocked = {
    price: requests.some((r) => r.type === "price" && r.status === "pending"),
    details: requests.some((r) => r.type === "details" && r.status === "pending"),
    sold: requests.some((r) => r.type === "sold" && r.status === "pending"),
  };

  return (
    <div className="space-y-6">
      <Link href="/manage" className="text-sm text-zinc-500 hover:text-brand-700">
        ← All my listings
      </Link>

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PropertyStatusBadge status={p.status} />
          <span className="font-mono text-xs text-zinc-500">{p.reference_no}</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold">{p.title}</h1>
        <p className="text-zinc-600">
          {formatPrice(p.price, p.listing_type)} · {p.locality}, {p.city}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-zinc-500">Submitted</dt>
            <dd>{formatDate(p.submitted_at)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Approved</dt>
            <dd>{formatDate(p.approved_at)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Live until</dt>
            <dd>{formatDate(p.expires_at)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Address (private)</dt>
            <dd className="truncate">{p.private_address ?? "—"}</dd>
          </div>
        </dl>
        {p.status === "approved" && (
          <Link href={`/properties/${p.reference_no}`} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
            View public listing →
          </Link>
        )}
        {p.status === "rejected" && p.rejected_reason && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Not approved: {p.rejected_reason}</p>
        )}
        {(p.status === "pending" || p.status === "under_review") && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Our team is reviewing this listing. We&apos;ll message you on WhatsApp once it&apos;s live.
          </p>
        )}
      </div>

      {p.status === "approved" && (
        <OwnerRequests
          property={{
            id: p.id,
            price: p.price,
            price_negotiable: p.price_negotiable,
            description: p.description ?? "",
            available_from: p.available_from,
            listing_type: p.listing_type,
          }}
          images={liveImages}
          blocked={blocked}
        />
      )}

      <section>
        <h2 className="mb-3 font-semibold">Request history</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-zinc-500">No requests yet.</p>
        ) : (
          <ul className="card divide-y divide-zinc-100">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div>
                  <p className="font-medium">{CHANGE_TYPE_LABELS[r.type]}</p>
                  <p className="text-zinc-500">
                    {formatDateTime(r.requested_at)}
                    {r.type === "price" && r.proposed.price ? ` · ${formatPrice(r.proposed.price, p.listing_type)}` : ""}
                  </p>
                  {r.status === "rejected" && r.admin_note && <p className="mt-1 text-red-700">Reason: {r.admin_note}</p>}
                </div>
                <RequestStatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
