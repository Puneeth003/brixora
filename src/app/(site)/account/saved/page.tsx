import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { unreadReplies } from "@/lib/member";
import { AccountShell } from "@/components/account/AccountShell";
import { PropertyCard } from "@/components/public/PropertyCard";
import type { ListingCard } from "@/lib/queries";

export const metadata: Metadata = { title: "Saved properties", robots: { index: false } };

export default function SavedPage() {
  return (
    <div className="container-page max-w-5xl py-10">
      <Suspense fallback={<div className="card mx-auto h-64 max-w-md animate-pulse bg-zinc-50" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const member = await getOwner();
  if (!member) redirect("/login?next=/account/saved");
  const [items, unread] = await Promise.all([
    // Only live listings; saved ones that sold or expired drop out.
    db.all<ListingCard>(
      `SELECT p.id, p.reference_no, p.listing_type, p.property_type, p.title, p.price, p.price_negotiable, p.locality, p.city,
              p.bedrooms, p.bathrooms, p.area_sqft, p.furnishing, p.featured, p.approved_at, p.cover_path
         FROM saved_properties s JOIN public_properties p ON p.id = s.property_id
        WHERE s.user_id = ? ORDER BY s.created_at DESC`,
      [member.id],
    ),
    unreadReplies(member.id),
  ]);

  return (
    <AccountShell active="/account/saved" name={member.profile.name} phone={member.phone} unread={unread}>
      {items.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <PropertyCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center text-sm text-zinc-500">
          Nothing saved yet. Tap “Save to shortlist” on any{" "}
          <Link href="/properties" className="text-brand-700 hover:underline">
            property
          </Link>
          .
        </div>
      )}
    </AccountShell>
  );
}
