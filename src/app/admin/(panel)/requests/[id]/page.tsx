import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatPrice, displayPhone } from "@/lib/format";
import { CHANGE_TYPE_LABELS } from "@/lib/constants";
import { publicImageUrl } from "@/lib/site";
import { PropertyStatusBadge, RequestStatusBadge } from "@/components/StatusBadge";
import { RequestDecision } from "@/components/admin/RequestDecision";
import type { ChangeRequest, Profile, Property, PropertyImage } from "@/lib/types";

export const metadata: Metadata = { title: "Change request" };

export default async function RequestPage({ params }: PageProps<"/admin/requests/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const req = await db.one<ChangeRequest>("SELECT * FROM change_requests WHERE id = ?", [id]);
  if (!req) notFound();

  const [p, imgs] = await Promise.all([
    db.one<Property>("SELECT * FROM properties WHERE id = ?", [req.property_id]),
    db.all<PropertyImage>("SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order", [req.property_id]),
  ]);
  if (!p) notFound();
  const owner = await db.one<Profile>("SELECT id, role, name, phone, wa_opt_out, created_at FROM users WHERE id = ?", [p.owner_id]);

  const liveImages = imgs
    .filter((i) => i.approved && i.is_visible)
    .map((i) => ({ id: i.id, url: publicImageUrl(i.watermarked_path)! }));
  const newImages = imgs
    .filter((i) => i.change_request_id === req.id && !i.approved)
    .map((i) => ({ id: i.id, url: publicImageUrl(i.watermarked_path)! }));

  return (
    <div className="space-y-6">
      <Link href="/admin/requests" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--s-muted)] hover:text-[var(--brand)]">
        ← Change requests
      </Link>
      <header className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{CHANGE_TYPE_LABELS[req.type]}</h1>
            <RequestStatusBadge status={req.status} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--s-muted)]">
            <Link
              href={`/admin/properties/${p.id}`}
              className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--s-text-2)] hover:bg-[var(--s-brand-soft)] hover:text-[var(--brand)]"
            >
              {p.reference_no}
            </Link>
            <span className="truncate font-semibold text-[var(--s-text-2)]">{p.title}</span>
            <PropertyStatusBadge status={p.status} />
          </p>
          <p className="mt-1 text-sm text-[var(--s-muted)]">
            Requested {formatDateTime(req.requested_at)} by {owner?.name ?? "owner"} ({displayPhone(owner?.phone)})
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">Current price</p>
          <p className="text-2xl font-extrabold tracking-tight text-[var(--brand)] tabular-nums">{formatPrice(p.price, p.listing_type)}</p>
        </div>
      </header>

      {req.status === "pending" ? (
        <RequestDecision
          id={req.id}
          type={req.type}
          listingType={p.listing_type}
          current={{
            price: p.price,
            price_negotiable: p.price_negotiable,
            description: p.description ?? "",
            available_from: p.available_from,
          }}
          proposed={req.proposed}
          liveImages={liveImages}
          newImages={newImages}
        />
      ) : (
        <div className="card space-y-3 p-6 text-sm">
          <h2 className="text-xl font-extrabold tracking-tight">Outcome</h2>
          <p className="font-semibold">
            {req.status === "approved" ? "Approved" : "Rejected"} {formatDateTime(req.reviewed_at)}.
          </p>
          {req.admin_note && <p className="rounded-2xl bg-[var(--s-bg)] p-4 text-[var(--s-text-2)]">Reason: {req.admin_note}</p>}
          <pre className="overflow-x-auto rounded-2xl bg-[var(--s-bg)] p-4 text-xs">{JSON.stringify(req.proposed, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
