import type { Metadata } from "next";
import { Suspense } from "react";
import { PostWizard, type PostPrefill } from "@/components/public/PostWizard";
import { PROPERTY_TYPES } from "@/lib/constants";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Post your property",
  description: `List your flat, villa, plot or commercial property with ${site.name}. Every listing is reviewed by our team.`,
};

export default function PostPage({ searchParams }: PageProps<"/post">) {
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Post your property</h1>
      <p className="mt-2 mb-8 text-zinc-600">
        Takes about 5 minutes. Our team reviews every listing before it goes live, and all buyer enquiries come to us,
        so your number stays private.
      </p>
      <Suspense fallback={<div className="card h-96 animate-pulse bg-zinc-50" />}>
        <Wizard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Prefill from the home page "Sell" quick form (?listing_type=&property_type=&locality=&price=). */
async function Wizard({ searchParams }: Pick<PageProps<"/post">, "searchParams">) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 80) : undefined);
  const type = str(sp.property_type);
  const listing = str(sp.listing_type);
  const prefill: PostPrefill = {
    listing_type: listing === "rent" || listing === "sale" ? listing : undefined,
    property_type: PROPERTY_TYPES.some((t) => t.value === type) ? type : undefined,
    locality: str(sp.locality) || undefined,
    price: str(sp.price)?.replace(/\D/g, "") || undefined,
  };
  return <PostWizard defaultCity={site.defaultCity} prefill={prefill} />;
}
