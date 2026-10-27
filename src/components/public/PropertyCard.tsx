import Image from "next/image";
import Link from "next/link";
import { formatNumber, formatPrice } from "@/lib/format";
import { propertyTypeLabel } from "@/lib/constants";
import { publicImageUrl } from "@/lib/site";
import { AreaIcon, BathIcon, BedIcon, MapPinIcon, ShieldIcon } from "@/components/icons";
import type { ListingCard } from "@/lib/queries";

export function PropertyCard({ p }: { p: ListingCard }) {
  const img = publicImageUrl(p.cover_path);
  const rent = p.listing_type === "rent";

  return (
    <Link
      href={`/properties/${p.reference_no}`}
      className="group block overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
        {img ? (
          <Image
            src={img}
            alt={p.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-zinc-400">No photo</div>
        )}
        <span
          className={`absolute top-3 left-3 rounded-md px-2.5 py-1 text-xs font-semibold text-white shadow ${
            rent ? "bg-emerald-500" : "bg-brand-600"
          }`}
        >
          {rent ? "For Rent" : "For Sale"}
        </span>
        {p.featured && (
          <span className="absolute top-3 right-3 rounded-md bg-white/95 px-2 py-1 text-xs font-semibold text-amber-600 shadow">
            ★ Featured
          </span>
        )}
        {p.verified_at && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow">
            <ShieldIcon className="size-3.5! text-emerald-600" />
            Verified
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-lg font-bold text-brand-700">
          {formatPrice(p.price, p.listing_type)}
          {p.price_negotiable && <span className="ml-2 text-xs font-normal text-zinc-400">Negotiable</span>}
        </p>
        <h3 className="mt-1 line-clamp-1 font-semibold text-ink">{p.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-zinc-500">
          <MapPinIcon className="size-3.5!" />
          {p.locality}, {p.city}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
          {p.bedrooms ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <BedIcon /> {p.bedrooms} {p.bedrooms === 1 ? "Bed" : "Beds"}
            </span>
          ) : (
            <span className="whitespace-nowrap text-zinc-500">{propertyTypeLabel(p.property_type)}</span>
          )}
          {p.bathrooms ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <BathIcon /> {p.bathrooms} {p.bathrooms === 1 ? "Bath" : "Baths"}
            </span>
          ) : null}
          {p.area_sqft ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <AreaIcon /> {formatNumber(p.area_sqft)} sq.ft
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white">
      <div className="aspect-[4/3] animate-pulse bg-zinc-100" />
      <div className="space-y-2 p-4">
        <div className="h-5 w-1/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" />
      </div>
    </div>
  );
}
