"use client";

import Image from "next/image";
import { useActionState } from "react";
import { approveChangeRequest, rejectChangeRequest } from "@/app/admin/actions";
import { formatPrice } from "@/lib/format";
import type { ChangeType, ListingType, ProposedChange } from "@/lib/types";

type Img = { id: string; url: string };

export function RequestDecision({
  id,
  type,
  listingType,
  current,
  proposed,
  liveImages,
  newImages,
}: {
  id: string;
  type: ChangeType;
  listingType: ListingType;
  current: { price: number; price_negotiable: boolean; description: string; available_from: string | null };
  proposed: ProposedChange;
  liveImages: Img[];
  newImages: Img[];
}) {
  const [approveState, approve, approving] = useActionState(approveChangeRequest, null);
  const [rejectState, reject, rejecting] = useActionState(rejectChangeRequest, null);
  const done = approveState?.ok || rejectState?.ok;

  if (done) {
    return <div className="card bg-[var(--s-brand-soft)] p-6 text-sm font-semibold text-brand-800">{approveState?.message ?? rejectState?.message}</div>;
  }

  const hide = new Set(proposed.hide_image_ids ?? []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <form action={approve} className="card space-y-6 p-6">
        <input type="hidden" name="id" value={id} />
        <h2 className="text-xl font-extrabold tracking-tight">Review &amp; approve</h2>
        {proposed.note && <p className="rounded-2xl bg-[var(--s-bg)] p-4 text-sm text-[var(--s-text-2)]">
            <span className="mb-1 block text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">Owner note</span>
            {proposed.note}
          </p>}

        {type === "price" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[var(--s-bg)] p-4">
              <p className="label">Current</p>
              <p className="text-2xl font-extrabold tracking-tight">{formatPrice(current.price, listingType)}</p>
              <p className="text-xs text-[var(--s-muted)]">{current.price_negotiable ? "Negotiable" : "Fixed"}</p>
            </div>
            <div className="space-y-2 rounded-2xl bg-[var(--s-brand-soft)] p-4">
              <label className="label" htmlFor="price">
                Proposed (editable)
              </label>
              <input id="price" name="price" defaultValue={proposed.price ?? current.price} className="input" inputMode="numeric" />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--s-border-strong)] bg-white px-3 py-1.5 text-sm font-medium has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--s-brand-soft)]">
                <input type="checkbox" name="price_negotiable" defaultChecked={proposed.price_negotiable ?? current.price_negotiable} className="accent-brand-600" />
                Negotiable
              </label>
            </div>
          </div>
        )}

        {type === "details" && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="label">Current description</p>
                <p className="max-h-72 overflow-y-auto rounded-2xl bg-[var(--s-bg)] p-4 text-sm whitespace-pre-line text-[var(--s-text-2)]">
                  {current.description || "—"}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="description">
                  Proposed description (editable)
                </label>
                <textarea id="description" name="description" rows={10} className="input" defaultValue={proposed.description ?? current.description} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="label">Current available from</p>
                <p className="text-sm font-semibold">{current.available_from ?? "—"}</p>
              </div>
              <div>
                <label className="label" htmlFor="available_from">
                  Proposed
                </label>
                <input
                  id="available_from"
                  name="available_from"
                  type="date"
                  className="input"
                  defaultValue={proposed.available_from !== undefined ? (proposed.available_from ?? "") : (current.available_from ?? "")}
                />
              </div>
            </div>
            {liveImages.length > 0 && (
              <div>
                <p className="label">Hide live photos (owner&apos;s selection pre-ticked)</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {liveImages.map((img) => (
                    <label key={img.id} className="relative block aspect-square cursor-pointer overflow-hidden rounded-2xl ring-2 ring-transparent ring-offset-2 transition has-checked:ring-red-500">
                      <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
                      <input type="checkbox" name="hide_image_ids" value={img.id} defaultChecked={hide.has(img.id)} className="absolute top-2 left-2 size-4 accent-red-600" />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {newImages.length > 0 && (
              <div>
                <p className="label">New photos to publish (untick to discard)</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {newImages.map((img) => (
                    <label key={img.id} className="relative block aspect-square cursor-pointer overflow-hidden rounded-2xl ring-2 ring-transparent ring-offset-2 transition has-checked:ring-[var(--brand)]">
                      <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
                      <input type="checkbox" name="approve_image_ids" value={img.id} defaultChecked className="absolute top-2 left-2 size-4 accent-brand-600" />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--s-muted)]">Check new photos for name boards, number plates and phone numbers.</p>
              </div>
            )}
          </>
        )}

        {type === "sold" && (
          <p className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-900">
            The listing is hidden while this is pending. Approving marks it <strong>sold</strong>; rejecting puts it back live.
          </p>
        )}

        {approveState?.error && <p className="text-sm font-medium text-[var(--s-late)]">{approveState.error}</p>}
        <button className="btn-primary w-full py-3 text-base sm:w-auto sm:px-8" disabled={approving}>
          {approving ? "Applying…" : type === "sold" ? "Confirm sold" : "Approve & apply"}
        </button>
      </form>

      <form action={reject} className="card h-fit space-y-3 p-6">
        <input type="hidden" name="id" value={id} />
        <h2 className="text-xl font-extrabold tracking-tight">Reject</h2>
        <textarea name="reason" required minLength={5} rows={4} className="input" placeholder="Reason sent to the owner" />
        {rejectState?.error && <p className="text-sm font-medium text-[var(--s-late)]">{rejectState.error}</p>}
        <button className="btn-danger w-full" disabled={rejecting}>
          {rejecting ? "Rejecting…" : "Reject request"}
        </button>
      </form>
    </div>
  );
}
