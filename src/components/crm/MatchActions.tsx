import { markListingShared } from "@/app/admin/crm-actions";
import { formatPrice } from "@/lib/format";
import { shareMessage } from "@/lib/match";
import { propertyUrl } from "@/lib/site";
import type { ListingType } from "@/lib/types";

/**
 * Share a live listing with a client: a WhatsApp chat pre-filled with the public link
 * (the staff member sends it themselves), and a button that logs it on the timeline.
 */
export function ShareListingActions({
  client,
  listing,
}: {
  client: { id: string; name: string; phone: string };
  listing: { id: string; reference_no: string; title: string; price: number; listing_type: ListingType; locality: string };
}) {
  const text = shareMessage(client.name, {
    title: listing.title,
    priceLabel: formatPrice(listing.price, listing.listing_type),
    locality: listing.locality,
    url: propertyUrl(listing.reference_no),
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`https://wa.me/${client.phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className="btn-primary px-3 py-1.5 text-xs whitespace-nowrap">
        Share on WhatsApp ↗
      </a>
      <form action={markListingShared.bind(null, client.id, listing.id)}>
        <button className="btn-secondary px-3 py-1.5 text-xs whitespace-nowrap" title="Adds it to the client's timeline">
          Mark as shared
        </button>
      </form>
    </div>
  );
}
