import { deletePropertyPermanently, removeFromWebsite, restoreProperty } from "@/app/admin/actions";
import type { PropertyStatus } from "@/lib/types";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** Delete form: the admin types the reference number to confirm. */
export function DeleteListingForm({ id, refNo, compact = false }: { id: string; refNo: string; compact?: boolean }) {
  return (
    <form action={deletePropertyPermanently.bind(null, id)} className="space-y-2">
      <p className={`text-[var(--s-text-2)] ${compact ? "text-xs" : "text-sm"}`}>
        Deletes the listing, its photos, change requests and site visits for good. Enquiries and clients stay in the CRM.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[var(--s-muted)]">
          Type <span className="font-mono text-[var(--s-text)]">{refNo}</span> to confirm
        </span>
        <input
          name="confirm"
          required
          autoComplete="off"
          pattern={escapeRegex(refNo)}
          title={`Type ${refNo}`}
          placeholder={refNo}
          className="input font-mono text-sm"
        />
      </label>
      <button className="btn-danger w-full text-sm">Delete permanently</button>
    </form>
  );
}

/**
 * "⋯" button on a listing row. Opens a small centred panel (native popover, so the
 * scrolling table can't clip it): take it off the website, restore it, or delete it.
 */
export function ListingRemoveMenu({ id, refNo, title, status }: { id: string; refNo: string; title: string; status: PropertyStatus }) {
  const canRemove = ["approved", "expired", "sold_pending", "sold", "rejected"].includes(status);
  const canRestore = status === "archived" || status === "expired";
  const pop = `listing-menu-${id}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={pop}
        className="flex size-9 items-center justify-center rounded-xl text-[var(--s-muted)] hover:bg-[var(--s-seg)] hover:text-[var(--s-text)]"
        aria-label={`Remove or delete ${refNo}`}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      <div
        id={pop}
        popover="auto"
        className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-3xl bg-white p-3 text-left text-[var(--s-text)] shadow-[var(--s-shadow-lg)] backdrop:bg-black/40"
      >
        <div className="flex items-start justify-between gap-3 px-2 pt-1 pb-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-[var(--s-muted)]">{refNo}</p>
            <p className="truncate font-extrabold">{title}</p>
          </div>
          <button
            type="button"
            popoverTarget={pop}
            popoverTargetAction="hide"
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--s-seg)] text-[var(--s-text-2)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="space-y-1">
          {canRemove && (
            <form action={removeFromWebsite.bind(null, id)}>
              <button className="w-full rounded-2xl px-3 py-3 text-left text-sm font-bold hover:bg-[var(--s-hover)]">
                Remove from website
                <span className="block text-xs font-normal text-[var(--s-muted)]">Hidden from the site. You can put it back any time.</span>
              </button>
            </form>
          )}
          {canRestore && (
            <form action={restoreProperty.bind(null, id)}>
              <button className="w-full rounded-2xl px-3 py-3 text-left text-sm font-bold hover:bg-[var(--s-hover)]">
                Put back on website
                <span className="block text-xs font-normal text-[var(--s-muted)]">Live again (expiry renewed if it had passed).</span>
              </button>
            </form>
          )}
          <details className="rounded-2xl">
            <summary className="cursor-pointer list-none rounded-2xl px-3 py-3 text-sm font-bold text-[var(--s-late)] hover:bg-red-50 [&::-webkit-details-marker]:hidden">
              Delete permanently…
            </summary>
            <div className="px-3 pt-1 pb-2">
              <DeleteListingForm id={id} refNo={refNo} compact />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
