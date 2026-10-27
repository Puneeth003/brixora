import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPublicProperty } from "@/lib/queries";
import { formatDate, formatNumber, formatPrice, displayPhone } from "@/lib/format";
import { furnishingLabel, propertyTypeLabel } from "@/lib/constants";
import { propertyUrl, publicImageUrl, site, whatsappLink } from "@/lib/site";
import { Gallery } from "@/components/public/Gallery";
import { EnquiryForm } from "@/components/public/EnquiryForm";
import { SaveButton } from "@/components/account/AccountForms";
import { ShieldIcon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/properties/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  const data = await getPublicProperty(ref);
  if (!data) return { title: "Listing not found" };
  const p = data.property;
  const title = `${p.title} – ${formatPrice(p.price, p.listing_type)} in ${p.locality}`;
  const cover = publicImageUrl(p.cover_path);
  return {
    title,
    description: (p.description ?? "").slice(0, 155) || `${propertyTypeLabel(p.property_type)} in ${p.locality}, ${p.city}`,
    alternates: { canonical: `/properties/${p.reference_no}` },
    openGraph: { title, images: cover ? [cover] : undefined },
  };
}

export default function PropertyPage({ params }: PageProps<"/properties/[ref]">) {
  return (
    <div className="container-page py-8">
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: Pick<PageProps<"/properties/[ref]">, "params">) {
  const { ref } = await params;
  const data = await getPublicProperty(ref);
  if (!data) notFound();
  const { property: p, images } = data;

  const gallery = images.map((i) => ({ id: i.id, url: publicImageUrl(i.watermarked_path)! }));
  const wa = whatsappLink(`Hi ${site.name}, I'm interested in property ${p.reference_no}: ${propertyUrl(p.reference_no)}`);

  const facts: [string, string | null][] = [
    ["Type", propertyTypeLabel(p.property_type)],
    ["Bedrooms", p.bedrooms ? `${p.bedrooms} BHK` : null],
    ["Bathrooms", p.bathrooms ? String(p.bathrooms) : null],
    ["Area", p.area_sqft ? `${formatNumber(p.area_sqft)} sq.ft` : null],
    ["Furnishing", furnishingLabel(p.furnishing)],
    ["Floor", p.floor],
    ["Age", p.property_age],
    ["Available from", p.available_from ? formatDate(p.available_from) : null],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    url: propertyUrl(p.reference_no),
    datePosted: p.approved_at,
    image: gallery.slice(0, 5).map((g) => g.url),
    offers: { "@type": "Offer", price: p.price, priceCurrency: "INR" },
    address: { "@type": "PostalAddress", addressLocality: p.locality, addressRegion: p.city, addressCountry: "IN" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-4 text-sm text-zinc-500">
        <Link href="/properties" className="hover:text-brand-700">
          Properties
        </Link>{" "}
        /{" "}
        <Link href={`/properties?locality=${encodeURIComponent(p.locality)}`} className="hover:text-brand-700">
          {p.locality}
        </Link>{" "}
        / <span className="text-zinc-700">{p.reference_no}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <Gallery images={gallery} title={p.title} />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-brand-100 text-brand-800">{p.listing_type === "rent" ? "For rent" : "For sale"}</span>
              {p.featured && <span className="badge bg-amber-100 text-amber-800">Featured</span>}
              {p.verified_at && (
                <span className="badge gap-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  <ShieldIcon className="size-3.5! text-emerald-600" />Verified on site · {formatDate(p.verified_at)}
                </span>
              )}
              <span className="badge bg-zinc-100 text-zinc-600">Ref {p.reference_no}</span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{p.title}</h1>
            <p className="mt-1 text-zinc-600">
              {p.locality}, {p.city}
            </p>
            <p className="mt-4 text-3xl font-semibold">
              {formatPrice(p.price, p.listing_type)}
              {p.price_negotiable && <span className="ml-2 text-base font-normal text-zinc-500">Negotiable</span>}
            </p>
          </div>

          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Overview</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-zinc-500">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {p.description && (
            <section>
              <h2 className="mb-2 font-semibold">About this property</h2>
              <p className="whitespace-pre-line text-zinc-700">{p.description}</p>
            </section>
          )}

          {p.amenities.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Amenities</h2>
              <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {p.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2 text-zinc-700">
                    <span className="text-brand-600">✓</span> {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(p.project_name || p.builder_name || p.rera_no) && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Project details</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {p.project_name && (
                  <div>
                    <dt className="text-zinc-500">Project</dt>
                    <dd className="font-medium">{p.project_name}</dd>
                  </div>
                )}
                {p.builder_name && (
                  <div>
                    <dt className="text-zinc-500">Builder</dt>
                    <dd className="font-medium">{p.builder_name}</dd>
                  </div>
                )}
                {(p.rera_no || p.project_rera_no) && (
                  <div>
                    <dt className="text-zinc-500">RERA no.</dt>
                    <dd className="font-medium">{p.rera_no || p.project_rera_no}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <p className="text-xs text-zinc-500">
            Location shown at locality level to protect owner privacy. Exact address shared by our team on request.
          </p>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <h2 className="font-semibold">Interested? Talk to us</h2>
            <p className="mb-4 text-sm text-zinc-500">
              {site.name} handles this listing. Leave your number and we&apos;ll call you.
            </p>
            <EnquiryForm refNo={p.reference_no} />
          </div>
          <SaveButton propertyId={p.id} refNo={p.reference_no} />
          {p.verified_at && (
            <div className="card flex items-start gap-3 p-4 text-sm">
              <ShieldIcon className="mt-0.5 size-5! text-emerald-600" />
              <p className="text-zinc-600">
                <span className="font-semibold text-emerald-700">Verified on site.</span> Our team visited this property and checked it matches the
                listing.
              </p>
            </div>
          )}
          <div className="card space-y-2 p-5">
            {wa && (
              <a href={wa} target="_blank" rel="noopener" className="btn w-full bg-[#25D366] text-white hover:bg-[#1ebe5a]">
                Chat on WhatsApp
              </a>
            )}
            {site.brokerage.phone && (
              <a href={`tel:+${site.brokerage.phone.replace(/\D/g, "")}`} className="btn-secondary w-full">
                Call {displayPhone(site.brokerage.phone)}
              </a>
            )}
            <p className="pt-1 text-center text-xs text-zinc-500">Quote reference {p.reference_no}</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="aspect-[16/10] animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-5 w-1/3 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="card h-96 animate-pulse bg-zinc-50" />
    </div>
  );
}
