"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";

export type Pin = { lat: number; lng: number };

// Mangalore city centre: where the map opens before anything is chosen.
const DEFAULT_CENTER: Pin = { lat: 12.9141, lng: 74.856 };

/**
 * Map for the owner to drop a pin on their property. OpenStreetMap tiles, no API key.
 * Leaflet is loaded only in the browser, when this step is shown. The pin is private:
 * only our team and the auditor see it.
 */
export function LocationPicker({ value, onChange, searchText }: { value: Pin | null; onChange: (pin: Pin) => void; searchText: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const placeRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  const [busy, setBusy] = useState<"gps" | "search" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The map is created once; later pin changes move the marker (see below).
  const initial = useRef(value);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current || map.current) return;
      const start = initial.current ?? DEFAULT_CENTER;
      const m = L.map(box.current, { scrollWheelZoom: false }).setView([start.lat, start.lng], initial.current ? 17 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#0e5e44;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const place = (lat: number, lng: number) => {
        if (!marker.current) {
          marker.current = L.marker([lat, lng], { icon, draggable: true }).addTo(m);
          marker.current.on("dragend", () => {
            const p = marker.current!.getLatLng();
            onChangeRef.current({ lat: round(p.lat), lng: round(p.lng) });
          });
        } else {
          marker.current.setLatLng([lat, lng]);
        }
      };
      if (initial.current) place(initial.current.lat, initial.current.lng);
      m.on("click", (e) => {
        place(e.latlng.lat, e.latlng.lng);
        onChangeRef.current({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) });
      });
      map.current = m;
      placeRef.current = place;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      placeRef.current = null;
    };
  }, []);

  function moveTo(pin: Pin, zoom: number, setPin: boolean) {
    if (!map.current) return;
    map.current.setView([pin.lat, pin.lng], zoom);
    if (setPin) {
      placeRef.current?.(pin.lat, pin.lng);
      onChange({ lat: round(pin.lat), lng: round(pin.lng) });
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setNote("This browser can't share your location. Tap the map instead.");
    setBusy("gps");
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        moveTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 18, true);
        setNote(pos.coords.accuracy > 100 ? `Accurate to about ${Math.round(pos.coords.accuracy)} m. Drag the pin onto the exact spot.` : null);
      },
      () => {
        setBusy(null);
        setNote("Couldn't get your location. Allow location access, or tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function findArea() {
    const q = searchText.trim();
    if (q.length < 3) return setNote("Type the locality first, then search for it.");
    setBusy("search");
    setNote(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" },
      });
      const hits = (await res.json()) as { lat: string; lon: string }[];
      if (!hits.length) setNote(`Couldn't find "${q}". Move the map yourself and tap your property.`);
      else moveTo({ lat: Number(hits[0].lat), lng: Number(hits[0].lon) }, 16, false);
    } catch {
      setNote("Search isn't working right now. Move the map yourself and tap your property.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={useMyLocation} disabled={busy !== null} className="btn-secondary text-sm">
          {busy === "gps" ? "Finding you…" : "📍 I'm at the property: use my location"}
        </button>
        <button type="button" onClick={findArea} disabled={busy !== null} className="btn-secondary text-sm">
          {busy === "search" ? "Searching…" : "Find the locality on the map"}
        </button>
      </div>
      <div ref={box} className="relative z-0 h-72 w-full overflow-hidden rounded-lg border border-zinc-300 bg-zinc-100 sm:h-80" />
      <p className="text-xs text-zinc-500">
        {value ? `Pin set at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}. Drag it to adjust.` : "Tap the map on your property to drop the pin."} Only our team sees
        the exact spot.
      </p>
      {note && <p className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">{note}</p>}
    </div>
  );
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
