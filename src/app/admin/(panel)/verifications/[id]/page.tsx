import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone, formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import { publicImageUrl } from "@/lib/site";
import { LISTING_TYPES, PROPERTY_TYPES } from "@/lib/constants";
import { VERIFICATION_CHECKLIST } from "@/lib/verification-constants";
import { SectionHeading } from "@/components/admin/ui";
import type { ListingType, PropertyType, SiteVerification } from "@/lib/types";
import { VisitForm } from "./VisitForm";

export const metadata: Metadata = { title: "Site visit" };

type Visit = SiteVerification & {
  reference_no: string;
  title: string;
  listing_type: ListingType;
  property_type: PropertyType;
  price: number;
  locality: string | null;
  city: string | null;
  private_address: string | null;
  private_landmark: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  owner_name: string | null;
  owner_phone: string | null;
  assignee_name: string | null;
};

function parseChecklist(v: unknown): Record<string, boolean> {
  if (!v) return {};
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Record<string, boolean>;
    } catch {
      return {};
    }
  }
  return v as Record<string, boolean>;
}

function StatusPill({ visit }: { visit: Visit }) {
  if (visit.status === "scheduled") return <span className="badge bg-sky-100 text-sky-800">Scheduled</span>;
  if (visit.status === "cancelled") return <span className="badge bg-zinc-200 text-zinc-700">Cancelled</span>;
  return visit.result === "verified" ? (
    <span className="badge bg-emerald-100 text-emerald-800">Verified ✓</span>
  ) : (
    <span className="badge bg-red-100 text-red-700">Issues found</span>
  );
}

export default async function SiteVisitPage({ params }: PageProps<"/admin/verifications/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const visit = await db.one<Visit>(
    `SELECT v.*, p.reference_no, p.title, p.listing_type, p.property_type, p.price, p.locality, p.city,
            p.private_address, p.private_landmark, p.bedrooms, p.bathrooms, p.area_sqft,
            o.name AS owner_name, o.phone AS owner_phone, a.name AS assignee_name
       FROM site_verifications v
       JOIN properties p ON p.id = v.property_id
       LEFT JOIN users o ON o.id = p.owner_id
       LEFT JOIN users a ON a.id = v.assigned_to
      WHERE v.id = ?`,
    [id],
  );
  if (!visit) notFound();
  if (staff.role !== "admin" && visit.assigned_to !== staff.userId) notFound();

  const [photos, listingPhotos] = await Promise.all([
    db.all<{ id: string; storage_path: string }>(
      "SELECT id, storage_path FROM site_verification_photos WHERE verification_id = ? ORDER BY created_at",
      [visit.id],
    ),
    db.all<{ id: string; watermarked_path: string }>(
      `SELECT id, watermarked_path FROM property_images
        WHERE property_id = ? AND (change_request_id IS NULL OR approved = 1)
        ORDER BY is_cover DESC, sort_order, created_at`,
      [visit.property_id],
    ),
  ]);

  const checklist = parseChecklist(visit.checklist);
  const mapsQuery = [visit.private_address, visit.private_landmark, visit.locality, visit.city].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
  const phone = visit.owner_phone?.replace(/\D/g, "") || null;
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === visit.property_type)?.label ?? visit.property_type;
  const listingLabel = LISTING_TYPES.find((t) => t.value === visit.listing_type)?.label ?? visit.listing_type;
  const specs: [string, string][] = [
    ["Type", `${typeLabel} · ${listingLabel}`],
    [visit.listing_type === "rent" ? "Rent" : "Price", formatPrice(Number(visit.price), visit.listing_type)],
    ...(visit.bedrooms ? [["Bedrooms", `${visit.bedrooms} BHK`] as [string, string]] : []),
    ...(visit.bathrooms ? [["Bathrooms", String(visit.bathrooms)] as [string, string]] : []),
    ...(visit.area_sqft ? [["Area", `${formatNumber(Number(visit.area_sqft))} sq ft`] as [string, string]] : []),
  ];
  const canAct = visit.status === "scheduled";
  const refPill = "rounded-lg bg-[var(--s-brand-soft)] px-2.5 py-1 font-mono text-sm font-extrabold text-[var(--brand)]";
  const lat = visit.latitude !== null ? Number(visit.latitude) : null;
  const lng = visit.longitude !== null ? Number(visit.longitude) : null;

  const photoGrid = photos.length > 0 && (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((ph) => (
        <a
          key={ph.id}
          href={`/admin/originals/${ph.storage_path}`}
          target="_blank"
          rel="noopener"
          className="relative block aspect-square overflow-hidden rounded-2xl bg-[var(--s-seg)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private, staff-only route */}
          <img src={`/admin/originals/${ph.storage_path}`} alt="Visit photo" loading="lazy" className="size-full object-cover" />
        </a>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link
        href="/admin/verifications"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--s-muted)] hover:text-[var(--brand)]"
      >
        ← Site visits
      </Link>

      <header className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {staff.role === "admin" ? (
            <Link href={`/admin/properties/${visit.property_id}`} className={refPill}>
              {visit.reference_no}
            </Link>
          ) : (
            <span className={refPill}>{visit.reference_no}</span>
          )}
          <StatusPill visit={visit} />
        </div>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight sm:text-[28px]">{visit.title}</h1>
        <p className="mt-1 text-sm text-[var(--s-muted)]">
          {visit.status === "scheduled" ? "Visit scheduled for " : "Was scheduled for "}
          <span className="font-bold text-[var(--s-text-2)]">{formatDateTime(visit.scheduled_at)}</span>
          {visit.assignee_name && <> · {visit.assignee_name}</>}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="min-w-0 space-y-5">
          <section className="card p-5 sm:p-6">
            <SectionHeading>Property</SectionHeading>
            <p className="text-[15px] font-bold text-[var(--s-text)]">{visit.private_address || "No address on file"}</p>
            {visit.private_landmark && <p className="mt-1 text-sm text-[var(--s-text-2)]">Landmark: {visit.private_landmark}</p>}
            <p className="mt-1 text-sm text-[var(--s-muted)]">{[visit.locality, visit.city].filter(Boolean).join(", ")}</p>
            <a href={mapsUrl} target="_blank" rel="noopener" className="btn-secondary mt-4 flex min-h-12 w-full items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Open in Maps
            </a>

            <div className="mt-5 border-t border-[var(--s-border)] pt-4">
              <p className="text-[13px] font-bold text-[var(--s-muted)]">Owner</p>
              <p className="mt-0.5 font-bold">{visit.owner_name || "—"}</p>
              <p className="text-sm text-[var(--s-text-2)] tabular-nums">{displayPhone(visit.owner_phone)}</p>
              {phone && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a href={`tel:+${phone}`} className="btn-primary flex min-h-12 items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
                    </svg>
                    Call
                  </a>
                  <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener" className="btn-secondary flex min-h-12 items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12z" />
                    </svg>
                    WhatsApp
                  </a>
                </div>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--s-border)] pt-4">
              {specs.map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-[var(--s-hover)] px-3 py-2.5">
                  <dt className="text-[12px] font-bold text-[var(--s-muted)]">{k}</dt>
                  <dd className="text-sm font-bold text-[var(--s-text)]">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-5 sm:p-6">
            <SectionHeading count={listingPhotos.length}>Listing photos</SectionHeading>
            {listingPhotos.length === 0 ? (
              <p className="text-sm text-[var(--s-muted)]">No photos on the listing.</p>
            ) : (
              <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                {listingPhotos.map((img) => {
                  const src = publicImageUrl(img.watermarked_path);
                  if (!src) return null;
                  return (
                    <a
                      key={img.id}
                      href={src}
                      target="_blank"
                      rel="noopener"
                      className="relative aspect-[4/3] w-36 shrink-0 snap-start overflow-hidden rounded-2xl bg-[var(--s-seg)]"
                    >
                      <Image src={src} alt="" fill sizes="144px" className="object-cover" />
                    </a>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-[var(--s-muted)]">Compare these with what you see on site.</p>
          </section>
        </div>

        <div className="min-w-0 space-y-5">
          {canAct ? (
            <VisitForm visitId={visit.id} checklist={VERIFICATION_CHECKLIST} photoCount={photos.length}>
              {photoGrid}
            </VisitForm>
          ) : (
            <>
              <section
                className={`rounded-3xl p-5 sm:p-6 ${
                  visit.status === "cancelled"
                    ? "bg-zinc-100 text-zinc-700"
                    : visit.result === "verified"
                      ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                      : "bg-red-50 text-red-900 ring-1 ring-red-200"
                }`}
              >
                <p className="text-xl font-extrabold tracking-tight">
                  {visit.status === "cancelled" ? "Visit cancelled" : visit.result === "verified" ? "Verified on site ✓" : "Issues found"}
                </p>
                {visit.status === "completed" && (
                  <p className="mt-1 text-sm">
                    Visited {formatDateTime(visit.visited_at)}
                    {visit.assignee_name && <> by {visit.assignee_name}</>}
                  </p>
                )}
              </section>

              {visit.status === "completed" && (
                <section className="card p-5 sm:p-6">
                  <SectionHeading>Checklist</SectionHeading>
                  <ul className="space-y-2">
                    {VERIFICATION_CHECKLIST.map((c) => {
                      const ok = checklist[c.key] === true;
                      return (
                        <li key={c.key} className="flex items-start gap-3 rounded-2xl bg-[var(--s-hover)] px-3 py-3 text-sm">
                          <span
                            className={`mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                              ok ? "bg-[var(--brand)] text-white" : "bg-red-100 text-red-700"
                            }`}
                            aria-label={ok ? "Yes" : "No"}
                          >
                            {ok ? "✓" : "✕"}
                          </span>
                          <span className="font-semibold text-[var(--s-text-2)]">{c.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {(visit.notes || lat !== null) && (
                <section className="card space-y-4 p-5 sm:p-6">
                  {visit.notes && (
                    <div>
                      <p className="label">Notes</p>
                      <p className="text-sm whitespace-pre-wrap text-[var(--s-text)]">{visit.notes}</p>
                    </div>
                  )}
                  {lat !== null && lng !== null && (
                    <div>
                      <p className="label">Location</p>
                      <a
                        href={`https://www.google.com/maps?q=${lat},${lng}`}
                        target="_blank"
                        rel="noopener"
                        className="text-sm font-bold text-[var(--brand)] tabular-nums hover:underline"
                      >
                        {lat.toFixed(6)}, {lng.toFixed(6)} ↗
                      </a>
                      {visit.location_accuracy_m !== null && (
                        <span className="ml-2 text-sm text-[var(--s-muted)]">± {visit.location_accuracy_m} m</span>
                      )}
                    </div>
                  )}
                </section>
              )}

              {photos.length > 0 && (
                <section className="card p-5 sm:p-6">
                  <SectionHeading count={photos.length}>Visit photos</SectionHeading>
                  {photoGrid}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
