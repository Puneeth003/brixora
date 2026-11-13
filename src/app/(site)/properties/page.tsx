import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocalities, getPublicListings, type ListingFilters } from "@/lib/queries";
import { PropertyCard, PropertyCardSkeleton } from "@/components/public/PropertyCard";
import { Filters } from "@/components/public/Filters";
import { Pagination } from "@/components/Pagination";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Properties for sale and rent",
  description: `Verified apartments, villas, plots and commercial properties for sale and rent in ${site.defaultCity}.`,
};

const KEYS = ["q", "locality", "listing", "type", "budget", "bhk", "furnishing", "sort", "page"] as const;

function pick(sp: Record<string, string | string[] | undefined>): ListingFilters {
  const f: ListingFilters = {};
  for (const k of KEYS) {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) f[k] = s.slice(0, 100);
  }
  return f;
}

export default function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  return (
    <div className="container-page py-8">
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/properties">, "searchParams">) {
  const f = pick(await searchParams);
  const [{ items, total, page, pages }, localities] = await Promise.all([getPublicListings(f), getLocalities()]);

  const sortHref = (sort: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && k !== "page" && k !== "sort") sp.set(k, v);
    if (sort) sp.set("sort", sort);
    return `/properties?${sp.toString()}`;
  };

  const heading =
    f.listing === "rent" ? "Properties for rent" : f.listing === "sale" ? "Properties for sale" : "All properties";

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside>
        <Filters f={f} localities={localities.map((l) => l.locality)} />
      </aside>
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {heading}
              {f.locality ? ` in ${f.locality}` : ""}
            </h1>
            <p className="text-sm text-zinc-500">
              {total} {total === 1 ? "listing" : "listings"}
            </p>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="mr-1 text-zinc-500">Sort:</span>
            {[
              ["", "Newest"],
              ["price_asc", "Price ↑"],
              ["price_desc", "Price ↓"],
              ["sqft_asc", "₹/sq.ft ↑"],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={sortHref(value)}
                className={(f.sort ?? "") === value ? "btn bg-zinc-900 px-3 py-1.5 text-white" : "btn-ghost px-3 py-1.5"}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <PropertyCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="card p-10 text-center">
            <p className="font-medium">No listings match these filters.</p>
            <p className="mt-1 text-sm text-zinc-500">Try widening your budget or choosing another locality.</p>
            <Link href="/properties" className="btn-secondary mt-4">
              Clear filters
            </Link>
          </div>
        )}

        <Pagination page={page} pages={pages} basePath="/properties" params={f} />
      </section>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <div className="card h-[560px] animate-pulse bg-zinc-50" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <PropertyCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
