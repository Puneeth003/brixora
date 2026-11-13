"use client";

import { useEffect, useState } from "react";
import { recentListings } from "@/app/(site)/properties/recent-actions";
import { PropertyCard } from "@/components/public/PropertyCard";
import { RECENT_KEY, RECENT_SHOWN, addRecent, parseRecent } from "@/lib/recently-viewed";
import type { ListingCard } from "@/lib/queries";

function readStored(): string[] {
  try {
    return parseRecent(localStorage.getItem(RECENT_KEY));
  } catch {
    return []; // storage blocked (private window, site data off)
  }
}

function writeStored(refs: string[] | null) {
  try {
    if (refs) localStorage.setItem(RECENT_KEY, JSON.stringify(refs));
    else localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing to do: the section just won't remember.
  }
}

/**
 * Listings this visitor opened recently, remembered in their own browser only.
 * On a listing page pass `currentRef`: it is remembered, and left out of what is shown.
 * Renders nothing until there is something to show.
 */
export function RecentlyViewed({ currentRef, className = "" }: { currentRef?: string; className?: string }) {
  const [items, setItems] = useState<ListingCard[]>([]);

  useEffect(() => {
    let live = true;
    const stored = readStored();
    if (currentRef) writeStored(addRecent(stored, currentRef));
    const others = stored.filter((ref) => ref !== currentRef).slice(0, RECENT_SHOWN);
    if (!others.length) return;
    recentListings(others)
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [currentRef]);

  if (!items.length) return null;

  const clear = () => {
    // On a listing page the one being viewed stays remembered.
    writeStored(currentRef ? [currentRef] : null);
    setItems([]);
  };

  return (
    <section className={className} aria-labelledby="recent-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="recent-title" className="text-xl font-semibold tracking-tight">
            Recently viewed
          </h2>
          <p className="text-sm text-zinc-500">Remembered on this device only.</p>
        </div>
        <button type="button" onClick={clear} className="text-sm font-semibold text-zinc-500 hover:text-brand-700 hover:underline">
          Clear
        </button>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <PropertyCard key={item.id} p={item} />
        ))}
      </div>
    </section>
  );
}
