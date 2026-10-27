import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db, dbConfigured, likeEscape } from "./db";
import { PAGE_SIZE, PROPERTY_TYPES } from "./constants";
import { sampleImages, sampleProperties } from "./samples";
import type { PublicProperty } from "./types";

// Public reads go through the public_* views only (safe columns of live listings), and
// are cached under the "listings" tag. Admin actions that change what is public call
// updateTag("listings"). Without DATABASE_URL set, demo listings are served instead.

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
>;

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
  else rows = [...rows].sort((a, b) => Number(b.featured) - Number(a.featured) || b.approved_at!.localeCompare(a.approved_at!));

  const total = rows.length;
  const from = (page - 1) * PAGE_SIZE;
  return { items: rows.slice(from, from + PAGE_SIZE) as ListingCard[], total, page, pages: Math.ceil(total / PAGE_SIZE) };
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
    f.sort === "price_asc" ? "price ASC" : f.sort === "price_desc" ? "price DESC" : "featured DESC, approved_at DESC";
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
    return { items, total, page, pages: Math.ceil(total / PAGE_SIZE) };
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

  return db.all<ListingCard>(`SELECT ${LIST_COLUMNS} FROM public_properties ORDER BY featured DESC, approved_at DESC LIMIT ?`, [limit]);
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
    return property ? { property, images: sampleImages[property.id] ?? [] } : null;
  }

  const property = await db.one<PublicProperty>("SELECT * FROM public_properties WHERE reference_no = ?", [ref]);
  if (!property) return null;
  const images = await db.all<{ id: string; watermarked_path: string; sort_order: number; is_cover: boolean }>(
    "SELECT id, watermarked_path, sort_order, is_cover FROM public_images WHERE property_id = ? ORDER BY is_cover DESC, sort_order",
    [property.id],
  );
  return { property, images };
}

export async function getAllPublicRefs() {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");

  if (!dbConfigured) return sampleProperties.map((p) => ({ reference_no: p.reference_no, updated_at: p.updated_at }));
  return db.all<{ reference_no: string; updated_at: string }>("SELECT reference_no, updated_at FROM public_properties");
}
