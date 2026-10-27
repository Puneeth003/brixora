import type { Metadata } from "next";
import Link from "next/link";
import { getLocalities } from "@/lib/queries";
import { slugify } from "@/lib/format";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Localities in ${site.defaultCity}`,
  description: `Browse verified properties by locality in ${site.defaultCity}.`,
};

export default async function LocalitiesPage() {
  const localities = await getLocalities();
  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Browse by locality</h1>
      <p className="mt-1 mb-6 text-zinc-500">Areas where we currently have verified listings.</p>
      {localities.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {localities.map((l) => (
            <li key={l.locality}>
              <Link href={`/localities/${slugify(l.locality)}`} className="card block p-4 hover:border-brand-300">
                <p className="font-medium">{l.locality}</p>
                <p className="text-sm text-zinc-500">
                  {l.count} {l.count === 1 ? "listing" : "listings"} · {l.city}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-8 text-center text-zinc-500">No listings yet.</p>
      )}
    </div>
  );
}
