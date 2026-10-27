import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocalities, getPublicListings } from "@/lib/queries";
import { slugify } from "@/lib/format";
import { site } from "@/lib/site";
import { PropertyCard, PropertyCardSkeleton } from "@/components/public/PropertyCard";

async function findLocality(slug: string) {
  const all = await getLocalities();
  return all.find((l) => slugify(l.locality) === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/localities/[slug]">): Promise<Metadata> {
  const loc = await findLocality((await params).slug);
  if (!loc) return { title: "Locality not found" };
  return {
    title: `Properties in ${loc.locality}, ${loc.city}`,
    description: `${loc.count} verified flats, villas, plots and commercial properties for sale and rent in ${loc.locality}, ${loc.city}. Listed by ${site.name}.`,
    alternates: { canonical: `/localities/${slugify(loc.locality)}` },
  };
}

export default function LocalityPage({ params }: PageProps<"/localities/[slug]">) {
  return (
    <div className="container-page py-10">
      <Suspense
        fallback={
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<PageProps<"/localities/[slug]">, "params">) {
  const loc = await findLocality((await params).slug);
  if (!loc) notFound();
  const [sale, rent] = await Promise.all([
    getPublicListings({ locality: loc.locality, listing: "sale" }),
    getPublicListings({ locality: loc.locality, listing: "rent" }),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Properties in {loc.locality}, {loc.city}
      </h1>
      <p className="mt-2 max-w-2xl text-zinc-600">
        {loc.count} verified {loc.count === 1 ? "listing" : "listings"} in {loc.locality}. Every property is checked by
        the {site.name} team before it goes live, and all enquiries are handled by us.
      </p>
      {[
        ["For sale", sale, "sale"],
        ["For rent", rent, "rent"],
      ].map(([label, result, listing]) => {
        const r = result as Awaited<ReturnType<typeof getPublicListings>>;
        if (!r.items.length) return null;
        return (
          <section key={listing as string} className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-xl font-semibold">{label as string}</h2>
              {r.total > r.items.length && (
                <Link
                  href={`/properties?listing=${listing}&locality=${encodeURIComponent(loc.locality)}`}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  View all {r.total} →
                </Link>
              )}
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {r.items.map((p) => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
