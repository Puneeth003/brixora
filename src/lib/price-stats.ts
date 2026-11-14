// Typical asking prices by locality, worked out from the listings live on the site today.
// These are asking prices of a handful of listings, not sale records, and are worded so.
// No imports here: the tests load this file directly.

/** Listings are only compared with their own kind: a plot's rate says nothing about a flat's. */
export type PriceGroup = "homes" | "plots" | "commercial";

const HOME_TYPES = ["apartment", "villa", "independent_house"];

export function priceGroup(propertyType: string): PriceGroup {
  if (propertyType === "plot") return "plots";
  return HOME_TYPES.includes(propertyType) ? "homes" : "commercial";
}

export const GROUP_LABELS: Record<PriceGroup, string> = { homes: "homes", plots: "plots", commercial: "commercial spaces" };

/** Fewer listings than this is an anecdote, not a typical price. */
export const MIN_SAMPLE = 3;
/** Within this share of the typical rate, a listing is "in line" with it. */
export const IN_LINE_BAND = 0.05;

export type StatRow = { listing_type: string; property_type: string; locality: string; price: number; area_sqft: number | null };

export type RateStat = { count: number; typical: number; low: number; high: number };

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function summarise(values: number[]): RateStat | null {
  const typical = median(values);
  if (typical === null) return null;
  return { count: values.length, typical: Math.round(typical), low: Math.round(Math.min(...values)), high: Math.round(Math.max(...values)) };
}

export const localityKey = (locality: string) => locality.trim().toLowerCase();

export type PriceStats = {
  /** Sale price per sq.ft, by locality and group, and city-wide by group (key "*"). */
  saleRate: Record<string, Partial<Record<PriceGroup, RateStat>>>;
  /** Monthly rent of homes, by locality and city-wide (key "*"). */
  homeRent: Record<string, RateStat>;
};

/** Every figure the site shows, from one pass over the live listings. */
export function buildPriceStats(rows: StatRow[]): PriceStats {
  const rates = new Map<string, number[]>(); // "locality|group" -> ₹/sq.ft
  const rents = new Map<string, number[]>(); // locality -> ₹/month
  const push = (map: Map<string, number[]>, key: string, value: number) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const r of rows) {
    // Numbers can arrive from the database as text.
    const price = Number(r.price);
    const area = Number(r.area_sqft);
    if (!(price > 0)) continue;
    const group = priceGroup(r.property_type);
    const where = localityKey(r.locality);
    if (r.listing_type === "sale" && area > 0) {
      const rate = price / area;
      push(rates, `${where}|${group}`, rate);
      push(rates, `*|${group}`, rate);
    } else if (r.listing_type === "rent" && group === "homes") {
      push(rents, where, price);
      push(rents, "*", price);
    }
  }

  const stats: PriceStats = { saleRate: {}, homeRent: {} };
  for (const [key, values] of rates) {
    const [where, group] = key.split("|") as [string, PriceGroup];
    const stat = summarise(values);
    if (stat) (stats.saleRate[where] ??= {})[group] = stat;
  }
  for (const [where, values] of rents) {
    const stat = summarise(values);
    if (stat) stats.homeRent[where] = stat;
  }
  return stats;
}

export type PriceCheck = {
  /** Where the comparison comes from: the locality when it has enough listings, else the whole city. */
  scope: "locality" | "city";
  group: PriceGroup;
  stat: RateStat;
  /** Whole percent above (+) or below (−) the typical rate. */
  percent: number;
  verdict: "below" | "in_line" | "above";
};

/**
 * How one sale listing's rate sits against others of its kind. Null when there is nothing
 * fair to compare it with (fewer than MIN_SAMPLE listings even city-wide).
 */
export function checkPrice(stats: PriceStats, listing: StatRow): PriceCheck | null {
  if (listing.listing_type !== "sale" || !listing.area_sqft || listing.area_sqft <= 0 || !(listing.price > 0)) return null;
  const group = priceGroup(listing.property_type);
  const local = stats.saleRate[localityKey(listing.locality)]?.[group];
  const city = stats.saleRate["*"]?.[group];
  const scope = local && local.count >= MIN_SAMPLE ? "locality" : "city";
  const stat = scope === "locality" ? local! : city;
  if (!stat || stat.count < MIN_SAMPLE || !(stat.typical > 0)) return null;
  const ratio = listing.price / listing.area_sqft / stat.typical - 1;
  const percent = Math.round(ratio * 100);
  const verdict = Math.abs(ratio) <= IN_LINE_BAND ? "in_line" : ratio < 0 ? "below" : "above";
  return { scope, group, stat, percent, verdict };
}
