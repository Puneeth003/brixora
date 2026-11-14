"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { compareListings } from "@/app/(site)/properties/recent-actions";
import { COMPARE_KEY, COMPARE_MAX, bestColumns, parseCompare, toggleCompare } from "@/lib/compare";
import { furnishingLabel, propertyTypeLabel } from "@/lib/constants";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { pricePerSqft } from "@/lib/listing-facts";
import { publicImageUrl } from "@/lib/site";
import type { ListingCard } from "@/lib/queries";

// The chosen listings live in localStorage. Every compare control on the page reads the
// same stored text, and hears about changes through this event (and `storage` for other tabs).
const CHANGED = "brixora:compare-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function storedText() {
  try {
    return localStorage.getItem(COMPARE_KEY) ?? "[]";
  } catch {
    return "[]"; // storage blocked
  }
}

/** False when the browser refused to store the list. */
function store(list: string[]) {
  try {
    if (list.length) localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
    else localStorage.removeItem(COMPARE_KEY);
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGED));
  return true;
}

/** The chosen references. Empty on the server and during hydration, then the stored list. */
function useCompareList() {
  const text = useSyncExternalStore(subscribe, storedText, () => "[]");
  return useMemo(() => parseCompare(text), [text]);
}

/** On a listing page: add this listing to the comparison, or take it out. */
export function CompareButton({ refNo }: { refNo: string }) {
  const list = useCompareList();
  const [note, setNote] = useState<string | null>(null);
  const chosen = list.includes(refNo);

  const click = () => {
    const next = toggleCompare(list, refNo);
    if (next.full) {
      setNote(`You can compare up to ${COMPARE_MAX} properties. Remove one first.`);
      return;
    }
    setNote(store(next.list) ? null : "Your browser is blocking site storage, so the comparison can't be kept.");
  };

  return (
    <div>
      <button
        type="button"
        onClick={click}
        aria-pressed={chosen}
        className={`inline-flex items-center justify-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
          chosen
            ? "border-brand-600 bg-brand-50 text-brand-800"
            : "border-zinc-300 bg-white text-zinc-700 hover:border-brand-600 hover:text-brand-700"
        }`}
      >
        {chosen ? "✓ Added to compare" : "+ Add to compare"}
      </button>
      {note && (
        <p className="mt-2 text-xs text-zinc-600" role="status">
          {note}{" "}
          <Link href="/compare" className="font-semibold text-brand-700 hover:underline">
            Open comparison
          </Link>
        </p>
      )}
    </div>
  );
}

/** A small bar at the foot of the screen while listings are chosen. Shown on every public page but the comparison itself. */
export function CompareBar() {
  const list = useCompareList();
  const pathname = usePathname();
  if (!list.length || pathname === "/compare") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-zinc-200 bg-white py-1.5 pr-1.5 pl-4 text-sm shadow-lg">
        <span className="text-zinc-600">
          {list.length} {list.length === 1 ? "property" : "properties"} to compare
        </span>
        <button type="button" onClick={() => store([])} className="rounded-full px-2.5 py-1.5 text-zinc-500 hover:text-brand-700 hover:underline">
          Clear
        </button>
        <Link href="/compare" className="btn-primary rounded-full px-4 py-1.5">
          {list.length > 1 ? "Compare" : "View"}
        </Link>
      </div>
    </div>
  );
}

type Row = { label: string; cells: (string | null)[]; best?: number[]; bestTag?: string };

function rowsFor(items: ListingCard[]): Row[] {
  const perSqft = items.map((p) => pricePerSqft(p));
  // A monthly rent and a sale price are not the same kind of number.
  const sameDeal = items.every((p) => p.listing_type === items[0].listing_type);
  const rows: Row[] = [
    { label: "Price", cells: items.map((p) => formatPrice(p.price, p.listing_type)), best: sameDeal ? bestColumns(items.map((p) => p.price), "low") : [], bestTag: "Lowest" },
    { label: "Price per sq.ft", cells: perSqft.map((v) => (v ? `₹${formatNumber(v)}` : null)), best: bestColumns(perSqft, "low"), bestTag: "Lowest" },
    { label: "For", cells: items.map((p) => (p.listing_type === "rent" ? "Rent" : "Sale")) },
    { label: "Type", cells: items.map((p) => propertyTypeLabel(p.property_type)) },
    { label: "Locality", cells: items.map((p) => `${p.locality}, ${p.city}`) },
    { label: "Bedrooms", cells: items.map((p) => (p.bedrooms ? `${p.bedrooms} BHK` : null)) },
    { label: "Bathrooms", cells: items.map((p) => (p.bathrooms ? String(p.bathrooms) : null)) },
    { label: "Area", cells: items.map((p) => (p.area_sqft ? `${formatNumber(p.area_sqft)} sq.ft` : null)), best: bestColumns(items.map((p) => p.area_sqft), "high"), bestTag: "Largest" },
    { label: "Furnishing", cells: items.map((p) => furnishingLabel(p.furnishing)) },
    { label: "Verified on site", cells: items.map((p) => (p.verified_at ? formatDate(p.verified_at) : "Not yet")) },
  ];
  // A row nobody has a value for says nothing.
  return rows.filter((row) => row.cells.some(Boolean));
}

/** The comparison page: the chosen listings side by side. */
export function CompareTable() {
  const list = useCompareList();
  const key = list.join(",");
  const [loaded, setLoaded] = useState<{ key: string; items: ListingCard[] }>({ key: "", items: [] });

  useEffect(() => {
    if (!key) return;
    let live = true;
    const refs = key.split(",");
    compareListings(refs)
      .then((items) => {
        if (!live) return;
        setLoaded({ key, items });
        // Forget listings that are no longer on the site.
        if (items.length < refs.length) store(items.map((p) => p.reference_no));
      })
      .catch(() => {
        if (live) setLoaded({ key, items: [] });
      });
    return () => {
      live = false;
    };
  }, [key]);

  if (!key) {
    return (
      <div className="card p-10 text-center">
        <p className="font-medium">Nothing to compare yet.</p>
        <p className="mt-1 text-sm text-zinc-500">
          Open a property and choose &ldquo;Add to compare&rdquo;. You can put up to {COMPARE_MAX} side by side.
        </p>
        <Link href="/properties" className="btn-primary mt-4">
          Browse properties
        </Link>
      </div>
    );
  }

  if (loaded.key !== key) return <div className="card h-96 animate-pulse bg-zinc-50" aria-busy="true" />;

  const items = loaded.items;
  if (!items.length) {
    return (
      <div className="card p-10 text-center">
        <p className="font-medium">These properties couldn&apos;t be loaded.</p>
        <p className="mt-1 text-sm text-zinc-500">They may no longer be listed. Please try again or pick others.</p>
        <Link href="/properties" className="btn-secondary mt-4">
          Browse properties
        </Link>
      </div>
    );
  }

  const rows = rowsFor(items);
  const remove = (ref: string) => store(list.filter((r) => r !== ref));

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 p-4 text-left align-bottom text-xs font-medium text-zinc-500">
                <button type="button" onClick={() => store([])} className="hover:text-brand-700 hover:underline">
                  Clear all
                </button>
              </th>
              {items.map((p) => {
                const img = publicImageUrl(p.cover_path);
                return (
                  <th key={p.id} scope="col" className="p-4 text-left align-top font-normal">
                    <Link href={`/properties/${p.reference_no}`} className="group block">
                      <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-zinc-100">
                        {img ? (
                          <Image src={img} alt="" fill sizes="(min-width: 1024px) 300px, 45vw" className="object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-xs text-zinc-400">No photo</div>
                        )}
                      </div>
                      <p className="mt-3 line-clamp-2 font-semibold text-ink group-hover:text-brand-700">{p.title}</p>
                    </Link>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>Ref {p.reference_no}</span>
                      <button type="button" onClick={() => remove(p.reference_no)} className="hover:text-red-600 hover:underline">
                        Remove
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-zinc-100">
                <th scope="row" className="p-4 text-left text-xs font-medium text-zinc-500">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => {
                  const best = row.best?.includes(i);
                  return (
                    <td key={items[i].id} className={`p-4 ${best ? "font-semibold text-emerald-700" : "text-zinc-800"}`}>
                      {cell ?? <span className="text-zinc-400">–</span>}
                      {best && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium ring-1 ring-emerald-200">{row.bestTag}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-zinc-100">
              <td />
              {items.map((p) => (
                <td key={p.id} className="p-4">
                  <Link href={`/properties/${p.reference_no}`} className="btn-primary w-full">
                    View property
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {items.length < COMPARE_MAX && (
        <p className="mt-4 text-sm text-zinc-500">
          {items.length === 1 ? "Add at least one more property to compare. " : `You can add ${COMPARE_MAX - items.length} more. `}
          <Link href="/properties" className="font-semibold text-brand-700 hover:underline">
            Browse properties
          </Link>
        </p>
      )}
    </>
  );
}
