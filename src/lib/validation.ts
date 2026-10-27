import { z } from "zod";
import { AMENITIES } from "./constants";

const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(max).nullable(),
  );

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(max).nullable());

const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v ? v : null),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
);

/** Fields an owner submits. Admin-only fields are never accepted from owners. */
export const ownerPropertySchema = z.object({
  listing_type: z.enum(["sale", "rent"]),
  property_type: z.enum(["apartment", "villa", "independent_house", "plot", "commercial", "office", "shop", "warehouse"]),
  title: z.string().trim().min(10, "Title should be at least 10 characters").max(120),
  description: z.string().trim().min(30, "Please describe the property in at least 30 characters").max(4000),
  price: z.coerce.number().int().min(1000, "Please enter a valid price").max(10_000_000_000),
  price_negotiable: z.coerce.boolean().default(false),
  locality: z.string().trim().min(2, "Locality is required").max(80),
  city: z.string().trim().min(2, "City is required").max(60),
  private_address: z.string().trim().min(5, "Address is required (kept private)").max(300),
  private_landmark: optionalText(200),
  bedrooms: optionalInt(20),
  bathrooms: optionalInt(20),
  area_sqft: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(50, "Area looks too small").max(10_000_000).nullable(),
  ),
  furnishing: z.preprocess((v) => (v ? v : null), z.enum(["unfurnished", "semi_furnished", "fully_furnished"]).nullable()),
  floor: optionalText(40),
  property_age: optionalText(40),
  available_from: optionalDate,
  amenities: z.array(z.enum(AMENITIES as [string, ...string[]])).max(AMENITIES.length).default([]),
});

export type OwnerPropertyInput = z.infer<typeof ownerPropertySchema>;

/** Admin editor: owner fields plus admin-managed ones. */
export const adminPropertySchema = ownerPropertySchema.extend({
  description: z.string().trim().max(4000).default(""),
  private_address: optionalText(300),
  amenities: z.array(z.string().max(60)).max(40).default([]),
  rera_no: optionalText(60),
  builder_id: z.preprocess((v) => (v ? v : null), z.string().uuid().nullable()),
  project_id: z.preprocess((v) => (v ? v : null), z.string().uuid().nullable()),
  internal_notes: optionalText(4000),
});

export const ownerNameSchema = z.string().trim().min(2, "Please enter your name").max(80);

export function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return issue?.message ?? "Please check the form.";
}
