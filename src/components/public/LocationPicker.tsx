"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

export type Pin = { lat: number; lng: number };

// Mangalore city centre: where the map opens if the locality can't be found.
const DEFAULT_CENTER: Pin = { lat: 12.9141, lng: 74.856 };

/**
 * Map for the owner to mark their property. The pin stays fixed in the middle and the
 * owner drags the map under it (like a ride or delivery app); the spot under the pin is
 * saved. OpenStreetMap tiles, no API key; Leaflet loads only in the browser. The map
 * opens on the locality typed earlier. The pin is private: only our team and the auditor see it.
 */
export function LocationPicker({ value, onChange, searchText }: { value: Pin | null; onChange: (pin: Pin) => void; searchText: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const onChangeRef = useRef(onChange);
  /** True while the code (not the owner) is moving the map. */
  const auto = useRef(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The map is created once, centred on the saved pin, else on the typed locality.
  const initial = useRef({ value, searchText });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current || map.current) return;
      const { value: saved, searchText: q } = initial.current;
      const start = saved ?? DEFAULT_CENTER;
      const m = L.map(box.current, { scrollWheelZoom: false, zoomControl: true }).setView([start.lat, start.lng], saved ? 17 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      // Only the owner's own drags and zooms set the pin; the automatic jump to the
      // locality (made by code) doesn't.
      let touched = false;
      m.on("moveend", () => {
        if (auto.current) return;
        touched = true;
        const c = m.getCenter();
        onChangeRef.current({ lat: round(c.lat), lng: round(c.lng) });
      });
      map.current = m;

      if (!saved && q.trim().length >= 3) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`, {
            headers: { Accept: "application/json" },
          });
          const hits = (await res.json()) as { lat: string; lon: string }[];
          if (!cancelled && hits.length && !touched) {
            // Not animated, so its moveend fires inside this call while the flag is set.
            auto.current = true;
            m.setView([Number(hits[0].lat), Number(hits[0].lon)], 16, { animate: false });
            auto.current = false;
          }
        } catch {
          // Stay on the city centre; the owner drags from there.
        }
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setNote("This browser can't share your location. Drag the map instead.");
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const pin = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
        if (map.current) {
          auto.current = true;
          map.current.setView([pin.lat, pin.lng], 18, { animate: false });
          auto.current = false;
        }
        onChange(pin);
        setNote(pos.coords.accuracy > 100 ? `Accurate to about ${Math.round(pos.coords.accuracy)} m. Drag the map to fine-tune.` : null);
      },
      () => {
        setLocating(false);
        setNote("Couldn't get your location. Allow location access, or drag the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative z-0 h-72 w-full overflow-hidden rounded-lg border border-zinc-300 bg-zinc-100 sm:h-80">
        <div ref={box} className="absolute inset-0" />
        {/* Fixed pin: its tip marks the centre of the map. */}
        <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-[1000] -translate-x-1/2 -translate-y-full">
          <svg viewBox="0 0 24 32" className="h-10 w-8 drop-shadow-md">
            <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0z" fill="#0e5e44" />
            <circle cx="12" cy="12" r="4.5" fill="#fff" />
          </svg>
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          aria-label="Use my current location"
          title="Use my current location"
          className="absolute right-3 bottom-3 z-[1000] grid size-11 place-items-center rounded-full bg-white text-brand-700 shadow-md ring-1 ring-black/10 hover:bg-zinc-50 disabled:opacity-60"
        >
          {locating ? (
            <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="7.5" />
            </svg>
          )}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        {value ? "Location set. Drag the map to adjust." : "Drag the map until the pin sits on your property."} Only our team sees the exact spot.
      </p>
      {note && <p className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">{note}</p>}
    </div>
  );
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
