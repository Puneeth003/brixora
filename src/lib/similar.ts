// Which live listings to show as "Similar properties" under a listing. Pure, so tests
// can load it directly; the query that gathers candidates is in queries.ts.

export type SimilarFields = {
  id: string;
  listing_type: string;
  property_type: string;
  locality: string;
  price: number;
  bedrooms: number | null;
  featured?: boolean;
  approved_at?: string | null;
};

/** Listings priced within this share of the target count as "close in price". */
export const PRICE_BAND = 0.25;
/** …and within this share as "roughly in range". Also the widest band the query fetches. */
export const PRICE_BAND_WIDE = 0.5;
/** A candidate needs at least this many points: e.g. same locality, or same type and close in price. */
const MIN_SCORE = 3;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * How alike two listings are. Sale and rent never mix (the prices aren't comparable).
 * Locality counts most, then type and price, then bedrooms.
 */
export function similarityScore(target: SimilarFields, other: SimilarFields) {
  if (other.id === target.id || other.listing_type !== target.listing_type) return 0;
  let score = 0;
  if (sameText(other.locality, target.locality)) score += 3;
  if (other.property_type === target.property_type) score += 2;
  if (target.price > 0) {
    const gap = Math.abs(other.price - target.price) / target.price;
    if (gap <= PRICE_BAND) score += 2;
    else if (gap <= PRICE_BAND_WIDE) score += 1;
  }
  if (target.bedrooms && other.bedrooms === target.bedrooms) score += 1;
  return score;
}

/** The `limit` most similar candidates, best first. Ties go to featured, then newest, listings. */
export function rankSimilar<T extends SimilarFields>(target: SimilarFields, candidates: T[], limit = 3): T[] {
  return candidates
    .map((item) => ({ item, score: similarityScore(target, item) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.item.featured ?? false) - Number(a.item.featured ?? false) ||
        (b.item.approved_at ?? "").localeCompare(a.item.approved_at ?? "") ||
        a.item.id.localeCompare(b.item.id),
    )
    .slice(0, limit)
    .map((x) => x.item);
}
