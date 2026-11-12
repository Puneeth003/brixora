import type { Client, ListingType, PropertyType } from "./types";

// Does a listing suit a client? Plain rules, shared by the dashboard's "New matches",
// the "Matching clients" card on a listing and the share buttons. They mirror
// matchingListings() in crm.ts (client → listings), read the other way round.

/** A listing counts as "new" for this many days after approval. */
export const NEW_MATCH_DAYS = 14;

export type MatchClient = Pick<Client, "type" | "status" | "listing_type" | "property_types" | "localities" | "bedrooms" | "budget_min" | "budget_max">;

export type MatchListing = {
  listing_type: ListingType;
  property_type: PropertyType;
  price: number;
  bedrooms: number | null;
  locality: string;
};

const norm = (s: string) => s.trim().toLowerCase();

/** The client's preferred localities, lower-cased (the field is a comma-separated list). */
export function preferredLocalities(c: Pick<Client, "localities">) {
  return (c.localities ?? "").split(",").map(norm).filter(Boolean).slice(0, 10);
}

export function inPreferredLocality(c: Pick<Client, "localities">, l: Pick<MatchListing, "locality">) {
  return preferredLocalities(c).includes(norm(l.locality));
}

/** Buyers, tenants and investors still in the pipeline. Sellers and landlords aren't looking. */
export function isLooking(c: Pick<Client, "type" | "status">) {
  return c.type !== "seller" && c.type !== "landlord" && c.status !== "won" && c.status !== "lost";
}

/**
 * True when the listing suits the client.
 * - Sale / rent, property type, budget (10% over the maximum, 20% under the minimum, as
 *   on the client page) and bedrooms must all agree where the client stated them.
 * - Preferred localities only rank a match higher. The exception is a client whose only
 *   requirement is a locality: for them the listing must be in one of those localities.
 * - A client with nothing beyond sale / rent matches nothing; otherwise every website
 *   enquiry would match every listing.
 */
export function fitsClient(c: MatchClient, l: MatchListing) {
  if (!isLooking(c)) return false;
  if (c.listing_type && c.listing_type !== l.listing_type) return false;

  const types = c.property_types ?? [];
  const hasFilters = types.length > 0 || Boolean(c.budget_min) || Boolean(c.budget_max) || Boolean(c.bedrooms);
  if (!hasFilters) return inPreferredLocality(c, l);

  if (types.length && !types.includes(l.property_type)) return false;
  if (c.budget_max && l.price > Math.round(c.budget_max * 1.1)) return false;
  if (c.budget_min && l.price < Math.round(c.budget_min * 0.8)) return false;
  if (c.bedrooms && l.bedrooms !== null && l.bedrooms < c.bedrooms) return false;
  return true;
}

/** Days since approval is within the "new" window. */
export function isNewListing(approvedAt: string | null | undefined, now: number) {
  if (!approvedAt) return false;
  return now - new Date(approvedAt).getTime() < NEW_MATCH_DAYS * 86_400_000;
}

/** Pre-filled WhatsApp text for sharing a listing with a client. */
export function shareMessage(clientName: string, listing: { title: string; priceLabel: string; locality: string; url: string }) {
  const first = clientName.trim().split(/\s+/)[0] || "there";
  return `Hi ${first}, a new listing that may suit you: ${listing.title}, ${listing.priceLabel}, ${listing.locality}. ${listing.url}`;
}
