"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shortlistListings } from "@/app/(site)/properties/recent-actions";
import { PropertyCard, PropertyCardSkeleton } from "@/components/public/PropertyCard";
import { inRecentOrder } from "@/lib/recently-viewed";
import { SHORTLIST_EVENT, clearShortlist, readShortlist, toggleShortlist } from "@/lib/shortlist";
import type { ListingCard } from "@/lib/queries";

/** The buyer's shortlist, read from this browser. Listings that are no longer live drop out. */
export function ShortlistView() {
  const [refs, setRefs] = useState<string[] | null>(null);
  const [rows, setRows] = useState<ListingCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sync = () => setRefs(readShortlist());
    sync();
    window.addEventListener(SHORTLIST_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SHORTLIST_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Fetched once; removing an item just filters what's already loaded.
  const hasRefs = Boolean(refs?.length);
  useEffect(() => {
    if (!hasRefs) return;
    let live = true;
    shortlistListings(readShortlist())
      .then((r) => live && setRows(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [hasRefs]);

  if (refs === null || (refs.length && rows === null && !failed)) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <PropertyCardSkeleton />
        <PropertyCardSkeleton />
        <PropertyCardSkeleton />
      </div>
    );
  }

  if (failed) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Couldn’t load your shortlist. Check your connection and reload.</p>;

  const shown = inRecentOrder(refs, rows ?? []);
  const gone = refs.length - shown.length;

  if (!shown.length) {
    return (
      <div className="card p-8 text-center">
        <p className="font-medium">{refs.length ? "The properties you saved are no longer listed." : "Nothing saved yet."}</p>
        <p className="mt-1 text-sm text-zinc-500">Tap “Save to shortlist” on any property to keep it here.</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/properties" className="btn-primary">
            Browse properties
          </Link>
          {refs.length > 0 && (
            <button type="button" onClick={clearShortlist} className="btn-secondary">
              Clear shortlist
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <div key={p.reference_no} className="space-y-2">
            <PropertyCard p={p} />
            <button type="button" onClick={() => toggleShortlist(p.reference_no)} className="text-sm font-medium text-red-600 hover:underline">
              Remove from shortlist
            </button>
          </div>
        ))}
      </div>
      {gone > 0 && <p className="text-sm text-zinc-500">{gone === 1 ? "1 saved property is" : `${gone} saved properties are`} no longer listed.</p>}
      <button type="button" onClick={clearShortlist} className="text-sm text-zinc-500 underline hover:text-zinc-800">
        Clear shortlist
      </button>
    </div>
  );
}
