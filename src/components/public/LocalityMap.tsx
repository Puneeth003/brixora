"use client";

import { useState } from "react";
import { NEARBY, mapEmbedUrl, mapLink, type NearbyKey } from "@/lib/locality-map";

/**
 * A map of the locality, with buttons to show schools, hospitals and so on around it.
 * It never shows where the property itself is: only the locality name is sent to the map.
 */
export function LocalityMap({ locality, city, note }: { locality: string; city: string; note?: string }) {
  const [nearby, setNearby] = useState<NearbyKey | null>(null);
  const chosen = NEARBY.find((n) => n.key === nearby);

  const pill = (on: boolean) =>
    `inline-flex items-center justify-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
      on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-300 bg-white text-zinc-700 hover:border-brand-600 hover:text-brand-700"
    }`;

  return (
    <section aria-labelledby="map-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 id="map-title" className="font-semibold">
          {locality} on the map
        </h2>
        <a href={mapLink(locality, city, nearby)} target="_blank" rel="noopener" className="text-sm font-semibold text-brand-700 hover:underline">
          Open in Google Maps ↗
        </a>
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show nearby places">
        <button type="button" onClick={() => setNearby(null)} aria-pressed={nearby === null} className={pill(nearby === null)}>
          Area
        </button>
        {NEARBY.map((n) => (
          <button key={n.key} type="button" onClick={() => setNearby(n.key)} aria-pressed={nearby === n.key} className={pill(nearby === n.key)}>
            {n.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
        <iframe
          // A new frame per choice, so the old map never lingers under the new label.
          key={nearby ?? "area"}
          src={mapEmbedUrl(locality, city, nearby)}
          title={chosen ? `${chosen.label} near ${locality}, ${city}` : `Map of ${locality}, ${city}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="block h-80 w-full border-0 sm:h-96"
        />
      </div>
      {note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}
    </section>
  );
}
