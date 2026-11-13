import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db, dbConfigured, likeEscape } from "./db";
import { PAGE_SIZE, PROPERTY_TYPES } from "./constants";
import { sampleImages, sampleProperties } from "./samples";
import { byPricePerSqft, isNewOnSite } from "./listing-facts";
import { PRICE_BAND_WIDE, rankSimilar } from "./similar";
import { inRecentOrder } from "./recently-viewed";
import { visitDateRange } from "./visit-request";
import type { PublicProperty } from "./types";

// Public reads go through the public_* views only (safe columns of live listings), and
// are cached under the "listings" tag. Admin actions that change what is public call
// updateTag("listings"). Without the DB_* variables set, demo listings are served instead.

export type ListingFilters = {
  q?: string;
  locality?: string;
  listing?: string;
  type?: string; // one type or a comma-separated group, e.g. "villa,independent_house"
  budget?: string;
  bhk?: string;
  furnishing?: string;
  sort?: string;
  page?: string;
};

const LIST_COLUMNS =
  "id, reference_no, listing_type, property_type, title, price, price_negotiable, locality, city, bedrooms, bathrooms, area_sqft, furnishing, featured, approved_at, cover_path, verified_at";

export type ListingCard = Pick<
  PublicProperty,
  | "id"
  | "reference_no"
  | "listing_type"
  | "property_type"
  | "title"
  | "price"
  | "price_negotiable"
  | "locality"
  | "city"
  | "bedrooms"
  | "bathrooms"
  | "area_sqft"
  | "furnishing"
  | "featured"
  | "approved_at"
  | "cover_path"
  | "verified_at"
> & {
  /** Went live within the last NEW_LISTING_DAYS. Set by the cached queries below. */
  is_new?: boolean;
};

/** Adds the "New" flag. Called inside the cached queries, so the clock is read there and not during a render. */
function markNew<T extends { approved_at: string | null }>(rows: T[]): (T & { is_new: boolean })[] {
  const now = Date.now();
  return rows.map((row) => ({ ...row, is_new: isNewOnSite(row.approved_at, now) }));
}

const VALID_TYPES = new Set(PROPERTY_TYPES.map((t) => t.value as string));

function parseTypes(type?: string) {
  return (type ?? "").split(",").filter((t) => VALID_TYPES.has(t));
}

function parseBudget(budget?: string) {
  if (!budget) return { min: null, max: null };
  const [min, max] = budget.split("-").map((v) => (v ? Number(v) : null));
  return { min: min || null, max: max || null };
}

function demoListings(f: ListingFilters, page: number) {
  const types = parseTypes(f.type);
  const { min, max } = parseBudget(f.budget);
  const term = f.q?.trim().toLowerCase();
  const bhk = Number(f.bhk) || 0;

  let rows = sampleProperties.filter(
    (p) =>
      (!f.listing || p.listing_type === f.listing) &&
      (!types.length || types.includes(p.property_type)) &&
      (!f.locality || p.locality.toLowerCase() === f.locality.toLowerCase()) &&
      (!f.furnishing || p.furnishing === f.furnishing) &&
      (!bhk || (bhk >= 5 ? (p.bedrooms ?? 0) >= 5 : p.bedrooms === bhk)) &&
      (!min || p.price >= min) &&
      (!max || p.price <= max) &&
      (!term || [p.title, p.locality, p.project_name ?? ""].some((s) => s.toLowerCase().includes(term))),
  );
  if (f.sort === "price_asc") rows = [...rows].sort((a, b) => a.price - b.price);
  else if (f.sort === "price_desc") rows = [...rows].sort((a, b) => b.price - a.price);
  else if (f.sort === "sqft_asc") rows = byPricePerSqft(rows);
  else rows = [...rows].sort((a, b) => Number(b.featured) - Number(a.featured) || b.approved_at!.localeCompare(a.approved_at!));

  const total = rows.length;
  const from = (page - 1) * PAGE_SIZE;
  return { items: markNew(rows.slice(from, from + PAGE_SIZE) as ListingCard[]), total, page, pages: Math.ceil(total / PAGE_SIZE) };
}

export async function getPublicListings(f: ListingFilters) {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");

  const page = Math.max(1, Number(f.page) || 1);
  if (!dbConfigured) return demoListings(f, page);

  const where: string[] = [];
  const values: unknown[] = [];
  const types = parseTypes(f.type);
  if (f.listing === "sale" || f.listing === "rent") {
    where.push("listing_type = ?");
    values.push(f.listing);
  }
  if (types.length) {
    where.push("property_type IN (?)");
    values.push(types);
  }
  if (f.locality) {
    where.push("locality = ?"); // case-insensitive collation
    values.push(f.locality);
  }
  if (f.furnishing) {
    where.push("furnishing = ?");
    values.push(f.furnishing);
  }
  if (f.bhk) {
    const n = Number(f.bhk);
    if (n >= 5) where.push("bedrooms >= 5");
    else if (n > 0) {
      where.push("bedrooms = ?");
      values.push(n);
    }
  }
  const { min, max } = parseBudget(f.budget);
  if (min) {
    where.push("price >= ?");
    values.push(min);
  }
  if (max) {
    where.push("price <= ?");
    values.push(max);
  }
  const term = f.q?.trim().slice(0, 80);
  if (term) {
    const like = `%${likeEscape(term)}%`;
    where.push("(title LIKE ? OR locality LIKE ? OR project_name LIKE ?)");
    values.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order =
    f.sort === "price_asc"
      ? "price ASC"
      : f.sort === "price_desc"
        ? "price DESC"
        : f.sort === "sqft_asc"
          ? // Lowest price per sq.ft first; listings without an area go last.
            "(area_sqft IS NULL OR area_sqft <= 0), price / area_sqft ASC, approved_at DESC"
          : "featured DESC, approved_at DESC";
  const from = (page - 1) * PAGE_SIZE;

  try {
    const [items, total] = await Promise.all([
      db.all<ListingCard>(`SELECT ${LIST_COLUMNS} FROM public_properties ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [
        ...values,
        PAGE_SIZE,
        from,
      ]),
      db.count(`SELECT COUNT(*) FROM public_properties ${whereSql}`, values),
    ]);
    return { items: markNew(items), total, page, pages: Math.ceil(total / PAGE_SIZE) };
  } catch (error) {
    console.error("[queries] listings", error);
    return { items: [] as ListingCard[], total: 0, page, pages: 0 };
  }
}

export async function getFeaturedListings(limit = 6) {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");

  if (!dbConfigured) return demoListings({}, 1).items.slice(0, limit);

  return markNew(await db.all<ListingCard>(`SELECT ${LIST_COLUMNS} FROM public_properties ORDER BY featured DESC, approved_at DESC LIMIT ?`, [limit]));
}

export async function getLocalities() {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");

  const rows = dbConfigured
    ? await db.all<{ locality: string; city: string }>("SELECT locality, city FROM public_properties")
    : sampleProperties.map((p) => ({ locality: p.locality, city: p.city }));

  const counts = new Map<string, { locality: string; city: string; count: number }>();
  for (const row of rows) {
    const key = row.locality.trim().toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { locality: row.locality.trim(), city: row.city, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.locality.localeCompare(b.locality));
}

export async function getListingStats() {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");

  const rows = dbConfigured
    ? await db.all<{ listing_type: string; locality: string }>("SELECT listing_type, locality FROM public_properties")
    : sampleProperties;
  return {
    live: rows.length,
    forSale: rows.filter((r) => r.listing_type === "sale").length,
    forRent: rows.filter((r) => r.listing_type === "rent").length,
    localities: new Set(rows.map((r) => r.locality.trim().toLowerCase())).size,
  };
}

export async function getPublicProperty(ref: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings", `property:${ref}`);

  if (!dbConfigured) {
    const property = sampleProperties.find((p) => p.reference_no === ref);
    return property ? { property, images: sampleImages[property.id] ?? [], ...clockFacts(property.approved_at) } : null;
  }

  const property = await db.one<PublicProperty>("SELECT * FROM public_properties WHERE reference_no = ?", [ref]);
  if (!property) return null;
  const images = await db.all<{ id: string; watermarked_path: string; sort_order: number; is_cover: boolean }>(
    "SELECT id, watermarked_path, sort_order, is_cover FROM public_images WHERE property_id = ? ORDER BY is_cover DESC, sort_order",
    [property.id],
  );
  return { property, images, ...clockFacts(property.approved_at) };
}

/**
 * Facts that depend on today's date. Worked out here, inside the cached query, because a
 * page render may not read the clock; they are at most a few minutes old, and the
 * enquiry action re-checks the visit date against the real time.
 */
function clockFacts(approvedAt: string | null) {
  const now = Date.now();
  return { isNew: isNewOnSite(approvedAt, now), visitDates: visitDateRange(now) };
}

/** Up to `limit` live listings most like this one (see similar.ts for the rule). */
export async function getSimilarListings(
  target: { id: string; listing_type: string; property_type: string; locality: string; price: number; bedrooms: number | null },
  limit = 3,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");

  if (!dbConfigured) return markNew(rankSimilar(target, sampleProperties as ListingCard[], limit));

  try {
    // Anything that could score: same locality, same type, or roughly the same price.
    const candidates = await db.all<ListingCard>(
      `SELECT ${LIST_COLUMNS} FROM public_properties
        WHERE listing_type = ? AND id <> ? AND (locality = ? OR property_type = ? OR price BETWEEN ? AND ?)
        ORDER BY featured DESC, approved_at DESC LIMIT 200`,
      [
        target.listing_type,
        target.id,
        target.locality,
        target.property_type,
        Math.floor(target.price * (1 - PRICE_BAND_WIDE)),
        Math.ceil(target.price * (1 + PRICE_BAND_WIDE)),
      ],
    );
    return markNew(rankSimilar(target, candidates, limit));
  } catch (error) {
    console.error("[queries] similar listings", error);
    return [] as ListingCard[];
  }
}

/** Cards for the given references, in that order. References that are not live are left out. */
export async function getListingsByRefs(refs: string[]) {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");

  if (!refs.length) return [] as ListingCard[];
  if (!dbConfigured) {
    return markNew(inRecentOrder(refs, sampleProperties.filter((p) => refs.includes(p.reference_no)) as ListingCard[]));
  }
  try {
    const rows = await db.all<ListingCard>(`SELECT ${LIST_COLUMNS} FROM public_properties WHERE reference_no IN (?)`, [refs]);
    return markNew(inRecentOrder(refs, rows));
  } catch (error) {
    console.error("[queries] listings by ref", error);
    return [] as ListingCard[];
  }
}

export async function getAllPublicRefs() {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");

  if (!dbConfigured) return sampleProperties.map((p) => ({ reference_no: p.reference_no, updated_at: p.updated_at }));
  return db.all<{ reference_no: string; updated_at: string }>("SELECT reference_no, updated_at FROM public_properties");
}
