"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, getOwner } from "@/lib/auth";
import { db, uuid } from "@/lib/db";
import { ImageError, processAndStore } from "@/lib/images";
import { notify } from "@/lib/whatsapp";
import { logActivity } from "@/lib/activity";
import { CHANGE_TYPE_LABELS, PHOTO_LIMITS } from "@/lib/constants";
import type { ActionState, ChangeType } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Loads an owner's approved property and checks there's no pending request of this type. */
async function loadOwnProperty(propertyId: string, type: ChangeType) {
  const owner = await getOwner();
  if (!owner) return { ok: false as const, error: "Your session expired. Please sign in again." };

  const property = await db.one<{ id: string; reference_no: string; status: string; owner_id: string }>(
    "SELECT id, reference_no, status, owner_id FROM properties WHERE id = ?",
    [propertyId],
  );
  if (!property || property.owner_id !== owner.id) return { ok: false as const, error: "Listing not found." };
  if (property.status !== "approved") return { ok: false as const, error: "Changes can only be requested for live listings." };

  const pending = await db.count(
    "SELECT COUNT(*) FROM change_requests WHERE property_id = ? AND type = ? AND status = 'pending' AND submitted = 1",
    [propertyId, type],
  );
  if (pending > 0) return { ok: false as const, error: "You already have a pending request of this type." };

  return { ok: true as const, owner, property };
}

export async function requestPriceChange(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      propertyId: z.string().uuid(),
      price: z.coerce.number().int().min(1000, "Enter a valid price").max(10_000_000_000),
      price_negotiable: z.coerce.boolean(),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({
      propertyId: formData.get("propertyId"),
      price: formData.get("price"),
      price_negotiable: formData.get("price_negotiable") === "on",
      note: formData.get("note") || undefined,
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const ctx = await loadOwnProperty(parsed.data.propertyId, "price");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const req = { id: uuid() };
  await db.insert("change_requests", {
    id: req.id,
    property_id: ctx.property.id,
    type: "price",
    proposed: { price: parsed.data.price, price_negotiable: parsed.data.price_negotiable, note: parsed.data.note },
    submitted: true,
  });

  await logActivity({
    entityType: "property",
    entityId: ctx.property.id,
    action: "change_requested:price",
    actorType: "owner",
    actorId: ctx.owner.id,
    diff: { request_id: req.id, price: parsed.data.price },
  });
  await notify(ctx.owner.phone, "change_received", [ctx.property.reference_no, CHANGE_TYPE_LABELS.price]);
  return { ok: true, message: "Price change requested. We'll review it and confirm on WhatsApp." };
}

/** Details request, step 1: saves proposed text changes; photos are uploaded next. */
export async function startDetailsRequest(input: {
  propertyId: string;
  description: string;
  available_from: string;
  hide_image_ids: string[];
  note: string;
}): Promise<Result<{ id: string }>> {
  const parsed = z
    .object({
      propertyId: z.string().uuid(),
      description: z.string().trim().max(4000),
      available_from: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
      hide_image_ids: z.array(z.string().uuid()).max(PHOTO_LIMITS.max),
      note: z.string().trim().max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const ctx = await loadOwnProperty(parsed.data.propertyId, "details");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // Only allow hiding images that belong to this property.
  const imgs = await db.all<{ id: string }>("SELECT id FROM property_images WHERE property_id = ?", [ctx.property.id]);
  const own = new Set(imgs.map((i) => i.id));

  const id = uuid();
  await db.insert("change_requests", {
    id,
    property_id: ctx.property.id,
    type: "details",
    proposed: {
      description: parsed.data.description || undefined,
      available_from: parsed.data.available_from || null,
      hide_image_ids: parsed.data.hide_image_ids.filter((i) => own.has(i)),
      note: parsed.data.note || undefined,
    },
    submitted: false,
  });
  return { ok: true, id };
}

async function loadOwnDraftRequest(requestId: string) {
  const owner = await getOwner();
  if (!owner) return { ok: false as const, error: "Your session expired. Please sign in again." };
  const req = await db.one<{ id: string; property_id: string; submitted: boolean; status: string; owner_id: string; reference_no: string }>(
    `SELECT r.id, r.property_id, r.submitted, r.status, p.owner_id, p.reference_no
       FROM change_requests r JOIN properties p ON p.id = r.property_id
      WHERE r.id = ?`,
    [requestId],
  );
  if (!req || req.owner_id !== owner.id) return { ok: false as const, error: "Request not found." };
  if (req.submitted || req.status !== "pending") return { ok: false as const, error: "This request was already submitted." };
  return { ok: true as const, owner, req, ref: req.reference_no };
}

export async function uploadChangePhoto(formData: FormData): Promise<Result> {
  const ctx = await loadOwnDraftRequest(String(formData.get("requestId") ?? ""));
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "No photo received." };

  const count = await db.count("SELECT COUNT(*) FROM property_images WHERE property_id = ?", [ctx.req.property_id]);
  if (count >= PHOTO_LIMITS.max + 10) return { ok: false, error: "Too many photos on this listing." };

  try {
    const stored = await processAndStore(file, ctx.req.property_id);
    await db.insert("property_images", {
      id: uuid(),
      property_id: ctx.req.property_id,
      storage_path: stored.storagePath,
      watermarked_path: stored.watermarkedPath,
      sort_order: 1000 + count,
      approved: false,
      change_request_id: ctx.req.id,
      uploaded_by: ctx.owner.id,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof ImageError) return { ok: false, error: e.message };
    console.error("[manage] photo upload failed", e);
    return { ok: false, error: "A photo failed to upload. Please try again." };
  }
}

export async function submitDetailsRequest(requestId: string): Promise<Result> {
  const ctx = await loadOwnDraftRequest(requestId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  await db.update("change_requests", { submitted: true, requested_at: new Date() }, "id = ?", [requestId]);
  await logActivity({
    entityType: "property",
    entityId: ctx.req.property_id,
    action: "change_requested:details",
    actorType: "owner",
    actorId: ctx.owner.id,
    diff: { request_id: requestId },
  });
  await notify(ctx.owner.phone, "change_received", [ctx.ref, CHANGE_TYPE_LABELS.details]);
  return { ok: true };
}

export async function requestSold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const propertyId = String(formData.get("propertyId") ?? "");
  if (formData.get("confirm") !== "on") return { ok: false, error: "Please confirm the property is sold." };

  const ctx = await loadOwnProperty(propertyId, "sold");
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const req = { id: uuid() };
  await db.insert("change_requests", { id: req.id, property_id: ctx.property.id, type: "sold", proposed: {}, submitted: true });

  // Sold hides the listing immediately (SPEC §7); admin confirms or reverts.
  await db.update("properties", { status: "sold_pending" }, "id = ? AND status = 'approved'", [ctx.property.id]);
  updateTag("listings");

  await logActivity({
    entityType: "property",
    entityId: ctx.property.id,
    action: "change_requested:sold",
    actorType: "owner",
    actorId: ctx.owner.id,
    diff: { request_id: req.id, status: { from: "approved", to: "sold_pending" } },
  });
  await notify(ctx.owner.phone, "change_received", [ctx.property.reference_no, CHANGE_TYPE_LABELS.sold]);
  return { ok: true, message: "Thanks! The listing is hidden now. We'll confirm the sale on WhatsApp." };
}

export async function signOut() {
  await endSession("owner");
  redirect("/manage");
}
