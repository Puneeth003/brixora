import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { configValue, db } from "@/lib/db";
import { matchingClientsFor, staffOptions } from "@/lib/crm";
import { requirementSummary } from "@/components/crm/ClientBadges";
import { ShareListingActions } from "@/components/crm/MatchActions";
import { fromNow, istInputValue } from "@/lib/time";
import { scanText } from "@/lib/scan";
import { originalUrl } from "@/lib/images";
import { displayPhone, formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { publicImageUrl } from "@/lib/site";
import { PropertyStatusBadge, RequestStatusBadge } from "@/components/StatusBadge";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { DecisionPanel } from "@/components/admin/DecisionPanel";
import { PhotoUpload } from "@/components/admin/PhotoUpload";
import { DeleteListingForm } from "@/components/admin/ListingRemoveMenu";
import { ActivityList } from "@/components/admin/ActivityList";
import { VerificationPanel } from "@/components/admin/VerificationPanel";
import type { ActivityLog, Builder, ChangeRequest, Profile, Project, Property, PropertyImage, SiteVerification } from "@/lib/types";
import {
  archiveProperty,
  claimForReview,
  deleteImage,
  extendExpiry,
  markSoldByAdmin,
  moveImage,
  restoreProperty,
  setCoverImage,
  toggleFeatured,
  toggleImageVisible,
} from "../../../actions";

export const metadata: Metadata = { title: "Property" };

const COMPARE_FIELDS: (keyof Property)[] = [
  "title",
  "description",
  "price",
  "price_negotiable",
  "listing_type",
  "property_type",
  "locality",
  "city",
  "private_address",
  "private_landmark",
  "bedrooms",
  "bathrooms",
  "area_sqft",
  "furnishing",
  "floor",
  "property_age",
  "available_from",
  "amenities",
];

/** Matching clients listed on the page; the count shows the rest. */
const MATCH_LIMIT = 10;

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") || "—" : String(v));

export default async function PropertyAdminPage({ params, searchParams }: PageProps<"/admin/properties/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { error: actionError } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await db.one<Property>("SELECT * FROM properties WHERE id = ?", [id]);
  if (!p) notFound();

  type VisitRow = Pick<SiteVerification, "id" | "status" | "result" | "scheduled_at" | "assigned_to" | "visited_at" | "notes"> & {
    assignee_name: string | null;
  };
  const [owner, images, builders, projects, activity, requests, visits, verifier, staff, requireVerification, matchingClients] = await Promise.all([
    db.one<Profile>("SELECT id, role, name, phone, wa_opt_out, created_at FROM users WHERE id = ?", [p.owner_id]),
    db.all<PropertyImage>("SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order, created_at", [id]),
    db.all<Builder>("SELECT * FROM builders ORDER BY name"),
    db.all<Project>("SELECT * FROM projects ORDER BY name"),
    db.all<ActivityLog>(
      "SELECT * FROM activity_log WHERE entity_type = 'property' AND entity_id = ? ORDER BY created_at DESC LIMIT 100",
      [id],
    ),
    db.all<Pick<ChangeRequest, "id" | "type" | "status" | "requested_at">>(
      "SELECT id, type, status, requested_at FROM change_requests WHERE property_id = ? AND submitted = 1 ORDER BY requested_at DESC",
      [id],
    ),
    db.all<VisitRow>(
      `SELECT v.id, v.status, v.result, v.scheduled_at, v.assigned_to, v.visited_at, v.notes, u.name AS assignee_name
         FROM site_verifications v LEFT JOIN users u ON u.id = v.assigned_to
        WHERE v.property_id = ? ORDER BY v.created_at DESC LIMIT 20`,
      [id],
    ),
    p.verified_by ? db.one<{ name: string | null }>("SELECT name FROM users WHERE id = ?", [p.verified_by]) : Promise.resolve(null),
    staffOptions(),
    configValue("require_site_verification"),
    // Who to tell about it: for listings in review or live.
    ["pending", "under_review", "approved"].includes(p.status) ? matchingClientsFor(p) : Promise.resolve([]),
  ]);
  const openVisit = visits.find((v) => v.status === "scheduled") ?? null;
  const pastVisits = visits.filter((v) => v.status !== "scheduled");
  const visitStaff = staff.filter((s) => s.agent_type !== "broker").map((s) => ({ id: s.id, name: s.name, email: s.email }));
  // Default visit time: tomorrow, 11:00 India time.
  const defaultWhen = `${istInputValue(fromNow(86_400_000).toISOString()).slice(0, 10)}T11:00`;
  const verificationRequired = requireVerification === "1";

  const actorIds = [...new Set(activity.map((a) => a.actor_id).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await db.all<{ id: string; name: string | null; role: string }>("SELECT id, name, role FROM users WHERE id IN (?)", [actorIds])
    : [];
  const names = Object.fromEntries(actors.map((a) => [a.id, a.name ?? a.role]));

  const flags = scanText(p.title, p.description);
  const original = p.original_submission ?? null;
  const submissionImages = images.filter((i) => !i.change_request_id || i.approved);
  // Demo images have no private original.
  const originals = submissionImages.map((i) => (i.storage_path.startsWith("demo/") ? null : originalUrl(i.storage_path)));

  const inReview = ["pending", "under_review", "rejected"].includes(p.status);
  const isLive = ["approved", "sold_pending", "expired", "archived"].includes(p.status);

  const chip =
    "inline-flex items-center rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-[var(--s-text-2)] shadow-sm ring-1 ring-black/5 hover:text-[var(--brand)]";

  return (
    <div className="space-y-6">
      <Link
        href={inReview ? "/admin/submissions" : "/admin/listings"}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--s-muted)] hover:text-[var(--brand)]"
      >
        ← Back
      </Link>

      <header className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[28px] leading-tight font-extrabold tracking-tight">{p.reference_no}</h1>
            <PropertyStatusBadge status={p.status} />
            {p.featured && <span className="badge bg-amber-100 text-amber-800">★ Featured</span>}
          </div>
          <p className="mt-1 truncate font-semibold text-[var(--s-text-2)]">{p.title}</p>
          <p className="mt-1 text-sm text-[var(--s-muted)]">
            Submitted {formatDateTime(p.submitted_at)}
            {p.approved_at && ` · approved ${formatDate(p.approved_at)}`}
            {p.expires_at && ` · expires ${formatDate(p.expires_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right">
            <p className="text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">{p.listing_type === "rent" ? "Rent" : "Price"}</p>
            <p className="text-2xl font-extrabold tracking-tight text-[var(--brand)] tabular-nums">{formatPrice(p.price, p.listing_type)}</p>
          </div>
          {p.status === "pending" && (
            <form action={claimForReview.bind(null, p.id)}>
              <button className="btn-secondary">Start review</button>
            </form>
          )}
          {p.status === "approved" && (
            <Link href={`/properties/${p.reference_no}`} target="_blank" className="btn-secondary">
              View public page ↗
            </Link>
          )}
        </div>
      </header>

      {typeof actionError === "string" && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          {actionError}
        </p>
      )}

      {flags.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <p className="font-bold text-amber-900">Auto-scan found possible private details in the title/description:</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {flags.map((f) => (
              <li key={f.kind + f.match} className="badge bg-white text-amber-900 ring-1 ring-amber-300">
                {f.kind.replace("_", " ")}: “{f.match}”
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
                Photos
                <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{images.length}</span>
              </h2>
              <p className="text-xs text-[var(--s-muted)]">Watermarked versions are what the public sees. “Original” opens the private upload.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img) => {
                const pending = img.change_request_id && !img.approved;
                const origIdx = submissionImages.findIndex((s) => s.id === img.id);
                return (
                  <div key={img.id} className={img.is_visible ? "" : "opacity-60"}>
                    <div
                      className={`relative aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--s-seg)] ${img.is_visible ? "" : "outline-2 outline-offset-2 outline-dashed outline-[var(--s-border-strong)]"}`}
                    >
                      <Image src={publicImageUrl(img.watermarked_path)!} alt="" fill sizes="240px" className="object-cover" />
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        {img.is_cover && <span className="badge bg-[var(--brand)] text-white">Cover</span>}
                        {!img.is_visible && <span className="badge bg-zinc-800 text-white">Hidden</span>}
                        {pending && <span className="badge bg-amber-400 text-amber-950">Change request</span>}
                      </div>
                      <div className="absolute right-2 bottom-2 flex gap-1">
                        <form action={moveImage.bind(null, img.id, -1)}>
                          <button className={chip} aria-label="Move earlier">
                            ←
                          </button>
                        </form>
                        <form action={moveImage.bind(null, img.id, 1)}>
                          <button className={chip} aria-label="Move later">
                            →
                          </button>
                        </form>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {!img.is_cover && (
                        <form action={setCoverImage.bind(null, img.id)}>
                          <button className={chip}>Cover</button>
                        </form>
                      )}
                      <form action={toggleImageVisible.bind(null, img.id)}>
                        <button className={chip}>{img.is_visible ? "Hide" : "Show"}</button>
                      </form>
                      {origIdx >= 0 && originals[origIdx] && (
                        <a href={originals[origIdx]!} target="_blank" rel="noopener" className={chip}>
                          Original
                        </a>
                      )}
                      <form action={deleteImage.bind(null, img.id)} className="ml-auto">
                        <button className="inline-flex items-center rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-[var(--s-late)] hover:bg-red-100">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
              <PhotoUpload propertyId={p.id} />
            </div>
          </section>

          <PropertyForm p={p} builders={builders} projects={projects} />

          {original && (
            <section className="card overflow-x-auto p-6">
              <h2 className="mb-4 text-xl font-extrabold tracking-tight">Original submission vs current</h2>
              <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_th]:px-3 [&_th]:pb-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-bold [&_th]:tracking-wider [&_th]:text-[var(--s-muted)] [&_th]:uppercase">
                <thead>
                  <tr>
                    <th className="w-36">Field</th>
                    <th>Original (read-only)</th>
                    <th>Current</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--s-border)]">
                  {COMPARE_FIELDS.map((k) => {
                    const a = show(original[k]);
                    const b = show(p[k]);
                    const changed = a !== b;
                    return (
                      <tr key={k}>
                        <td className="font-semibold text-[var(--s-muted)] capitalize">{k.replace(/_/g, " ")}</td>
                        <td className="whitespace-pre-line text-[var(--s-text-2)]">{a}</td>
                        <td className={`whitespace-pre-line ${changed ? "rounded-lg bg-amber-50 font-semibold text-amber-950" : "text-[var(--s-text-2)]"}`}>{b}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card p-6 text-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-extrabold tracking-tight">Owner</h2>
              <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">Admin only</span>
            </div>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--s-brand-soft)] text-base font-extrabold text-[var(--brand)]">
                {(owner?.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold">{owner?.name ?? "—"}</p>
                <p>
                  {owner?.phone ? (
                    <a href={`tel:+${owner.phone}`} className="font-semibold text-brand-700 hover:underline">
                      {displayPhone(owner.phone)}
                    </a>
                  ) : (
                    <span className="text-[var(--s-muted)]">No phone</span>
                  )}
                  {owner?.wa_opt_out && <span className="badge ml-2 bg-[var(--s-seg)] text-[var(--s-text-2)]">WhatsApp opt-out</span>}
                </p>
              </div>
            </div>
            <dl className="space-y-3 rounded-2xl bg-[var(--s-bg)] p-4">
              <div>
                <dt className="text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">Address</dt>
                <dd className="mt-0.5">{p.private_address ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">Landmark</dt>
                <dd className="mt-0.5">{p.private_landmark ?? "—"}</dd>
              </div>
            </dl>
          </section>

          {p.status !== "draft" && (
            <VerificationPanel
              propertyId={p.id}
              verifiedAt={p.verified_at ?? null}
              verifiedByName={verifier?.name ?? null}
              openVisit={
                openVisit
                  ? { id: openVisit.id, scheduled_at: openVisit.scheduled_at, assigned_to: openVisit.assigned_to, assignee_name: openVisit.assignee_name }
                  : null
              }
              history={pastVisits.map(({ id, status, result, visited_at, assignee_name, notes }) => ({ id, status, result, visited_at, assignee_name, notes }))}
              staff={visitStaff}
              required={verificationRequired}
              defaultWhen={defaultWhen}
            />
          )}

          {inReview && (
            <DecisionPanel id={p.id} canReject={p.status !== "rejected"} needsVerification={verificationRequired && !p.verified_at} />
          )}

          {matchingClients.length > 0 && (
            <section className="card p-6 text-sm">
              <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
                Matching clients
                <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{matchingClients.length}</span>
              </h2>
              <p className="mt-1 mb-4 text-xs text-[var(--s-muted)]">
                {p.status === "approved" ? "Clients whose requirements this listing fits." : "Clients this listing would suit once it is live."}
              </p>
              <ul className="divide-y divide-[var(--s-border)]">
                {matchingClients.slice(0, MATCH_LIMIT).map((c) => (
                  <li key={c.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/admin/clients/${c.id}`} className="font-bold hover:text-[var(--brand)]">
                          {c.name}
                        </Link>
                        {c.preferred && <span className="badge bg-[var(--s-brand-soft)] text-[var(--brand)]">Preferred area</span>}
                        {c.contacted && <span className="badge bg-[var(--s-seg)] text-[var(--s-text-2)]">Already told</span>}
                      </p>
                      <p className="text-xs text-[var(--s-muted)]">
                        {requirementSummary(c)} · {c.agent_name ?? "Unassigned"}
                      </p>
                    </div>
                    {p.status === "approved" && !c.contacted && <ShareListingActions client={c} listing={p} />}
                  </li>
                ))}
              </ul>
              {matchingClients.length > MATCH_LIMIT && (
                <p className="mt-3 text-xs text-[var(--s-muted)]">
                  Showing {MATCH_LIMIT} of {matchingClients.length}.
                </p>
              )}
            </section>
          )}

          {isLive && (
            <section className="card space-y-4 p-6 text-sm">
              <h2 className="text-xl font-extrabold tracking-tight">Listing controls</h2>
              <div className="flex flex-wrap gap-2">
                {p.status === "approved" && (
                  <form action={toggleFeatured.bind(null, p.id)}>
                    <button className="btn-secondary">{p.featured ? "Remove featured" : "★ Feature"}</button>
                  </form>
                )}
                {["approved", "sold_pending", "expired"].includes(p.status) && (
                  <form action={markSoldByAdmin.bind(null, p.id)}>
                    <button className="btn-secondary">Mark sold</button>
                  </form>
                )}
                {["approved", "expired"].includes(p.status) && (
                  <form action={archiveProperty.bind(null, p.id)}>
                    <button title="Hide from the website; you can restore it later" className="btn-secondary">Archive</button>
                  </form>
                )}
                {["archived", "expired"].includes(p.status) && (
                  <form action={restoreProperty.bind(null, p.id)}>
                    <button className="btn-primary">Restore to live</button>
                  </form>
                )}
              </div>
              {["approved", "expired"].includes(p.status) && (
                <form action={extendExpiry.bind(null, p.id)} className="flex items-end gap-2 border-t border-[var(--s-border)] pt-4">
                  <div className="flex-1">
                    <label className="label" htmlFor="days">
                      Extend expiry by (days)
                    </label>
                    <input id="days" name="days" type="number" min={1} max={365} defaultValue={30} className="input" />
                  </div>
                  <button className="btn-secondary">Extend</button>
                </form>
              )}
              {p.status === "sold_pending" && (
                <p className="rounded-2xl bg-violet-50 p-4 text-violet-800">
                  Owner marked this as sold. Confirm or reject it from{" "}
                  <Link href="/admin/requests" className="font-semibold underline">
                    change requests
                  </Link>
                  .
                </p>
              )}
            </section>
          )}

          {requests.length > 0 && (
            <section className="card p-6 text-sm">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold tracking-tight">
                Change requests
                <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{requests.length}</span>
              </h2>
              <ul className="space-y-1">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/requests/${r.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--s-hover)]"
                    >
                      <span className="font-semibold capitalize">{r.type}</span>
                      <span className="flex items-center gap-2 text-xs text-[var(--s-muted)]">
                        <RequestStatusBadge status={r.status} />
                        {formatDate(r.requested_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold tracking-tight">
              Activity
              {activity.length > 0 && <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{activity.length}</span>}
            </h2>
            <ActivityList entries={activity} names={names} />
          </section>

          <details className="card p-6">
            <summary className="cursor-pointer list-none text-sm font-bold text-[var(--s-late)] [&::-webkit-details-marker]:hidden">
              Delete this listing…
            </summary>
            <div className="mt-4">
              <DeleteListingForm id={p.id} refNo={p.reference_no} />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
