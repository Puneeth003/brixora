// Small derived facts shown on public listings. Pure, so tests can load it directly.

/** A listing carries the "New" badge for this many days after it goes live. */
export const NEW_LISTING_DAYS = 7;

export function isNewOnSite(approvedAt: string | null | undefined, nowMs: number) {
  if (!approvedAt) return false;
  const age = nowMs - new Date(approvedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < NEW_LISTING_DAYS * 86_400_000;
}

/**
 * Asking price per square foot, to the rupee. Only for sale listings with an area:
 * rent per sq.ft isn't how homes are compared here.
 */
export function pricePerSqft(p: { listing_type: string; price: number; area_sqft: number | null }) {
  if (p.listing_type !== "sale" || !p.area_sqft || p.area_sqft <= 0 || !(p.price > 0)) return null;
  return Math.round(p.price / p.area_sqft);
}

/** Lowest price per sq.ft first; listings without an area go last, in their existing order. */
export function byPricePerSqft<T extends { price: number; area_sqft: number | null }>(rows: T[]) {
  const rate = (r: T) => (r.area_sqft && r.area_sqft > 0 ? r.price / r.area_sqft : Number.POSITIVE_INFINITY);
  return rows
    .map((row, index) => ({ row, index, rate: rate(row) }))
    .sort((a, b) => (a.rate === b.rate ? a.index - b.index : a.rate - b.rate))
    .map((x) => x.row);
}

/** Text and links for sharing a listing. */
export function shareLinks(input: { title: string; priceText: string; locality: string; url: string }) {
  const text = `${input.title} · ${input.priceText} · ${input.locality}`;
  return {
    text,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${input.url}`)}`,
  };
}
