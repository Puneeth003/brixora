// The "More filters" on the listings page: what is offered and how the values in the
// address are read. No imports here: the tests load this file directly.

export const AREA_OPTIONS = [500, 1000, 1500, 2000, 3000];
export const BATH_OPTIONS = [1, 2, 3, 4];
export const LISTED_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];
/** More than this many amenities in one search is not a real search. */
export const MAX_AMENITY_FILTERS = 6;

function oneOf(value: string | undefined, allowed: number[]): number | null {
  const n = Number(value);
  return value && allowed.includes(n) ? n : null;
}

/** Smallest built-up area wanted, in sq.ft, or null for any. */
export function parseMinArea(value: string | undefined) {
  return oneOf(value, AREA_OPTIONS);
}

/** Fewest bathrooms wanted, or null for any. */
export function parseMinBaths(value: string | undefined) {
  return oneOf(value, BATH_OPTIONS);
}

/** Only listings that went live within this many days, or null for any time. */
export function parseListedDays(value: string | undefined) {
  return oneOf(
    value,
    LISTED_OPTIONS.map((o) => o.days),
  );
}

/**
 * The amenities asked for: a comma-separated value, kept only where it names a real
 * amenity (compared without regard to case), in the list's own spelling and order.
 */
export function parseAmenities(value: string | undefined, allowed: readonly string[]): string[] {
  if (!value) return [];
  const wanted = new Set(value.split(",").map((s) => s.trim().toLowerCase()));
  return allowed.filter((a) => wanted.has(a.toLowerCase())).slice(0, MAX_AMENITY_FILTERS);
}

/** How many of the extra filters are in use, for the "More filters (2)" label. */
export function countMoreFilters(
  f: { area?: string; bath?: string; listed?: string; verified?: string; amenity?: string },
  allowed: readonly string[],
) {
  return (
    Number(parseMinArea(f.area) !== null) +
    Number(parseMinBaths(f.bath) !== null) +
    Number(parseListedDays(f.listed) !== null) +
    Number(f.verified === "1") +
    parseAmenities(f.amenity, allowed).length
  );
}
