"use server";

import { getOwner } from "@/lib/auth";
import { db, nextReferenceNo, uuid } from "@/lib/db";
import { firstError, ownerNameSchema, ownerPropertySchema } from "@/lib/validation";
import { ImageError, processAndStore } from "@/lib/images";
import { notify } from "@/lib/whatsapp";
import { logActivity } from "@/lib/activity";
import { PHOTO_LIMITS } from "@/lib/constants";
import type { Property } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Step 1 of submit: create the draft (status forced to "draft", owner forced to self). */
export async function createDraft(input: unknown, name: unknown): Promise<Result<{ id: string; ref: string }>> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "Please verify your phone number first." };

  const parsedName = ownerNameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false, error: firstError(parsedName.error) };
  const parsed = ownerPropertySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  try {
    await db.update("users", { name: parsedName.data }, "id = ?", [owner.id]);
    const id = uuid();
    const ref = await nextReferenceNo();
    await db.insert("properties", { ...parsed.data, id, reference_no: ref, status: "draft", owner_id: owner.id });
    return { ok: true, id, ref };
  } catch (error) {
    console.error("[post] draft insert failed", error);
    return { ok: false, error: "Could not save your property. Please try again." };
  }
}

/** Step 2: one photo per call (keeps request bodies small). */
export async function uploadDraftPhoto(formData: FormData): Promise<Result> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "Your session expired. Please verify again." };

  const propertyId = String(formData.get("propertyId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "No photo received." };

  const property = await db.one<{ id: string; status: string; owner_id: string }>(
    "SELECT id, status, owner_id FROM properties WHERE id = ?",
    [propertyId],
  );
  if (!property || property.owner_id !== owner.id || property.status !== "draft") {
    return { ok: false, error: "This submission can no longer be changed." };
  }

  const count = await db.count("SELECT COUNT(*) FROM property_images WHERE property_id = ?", [propertyId]);
  if (count >= PHOTO_LIMITS.max) return { ok: false, error: `Maximum ${PHOTO_LIMITS.max} photos.` };

  try {
    const stored = await processAndStore(file, propertyId);
    await db.insert("property_images", {
      id: uuid(),
      property_id: propertyId,
      storage_path: stored.storagePath,
      watermarked_path: stored.watermarkedPath,
      sort_order: count,
      is_cover: count === 0,
      approved: false,
      uploaded_by: owner.id,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof ImageError) return { ok: false, error: e.message };
    console.error("[post] photo upload failed", e);
    return { ok: false, error: "A photo failed to upload. Please try again." };
  }
}

/** Step 3: move draft → pending, snapshot the original, notify the owner. */
export async function finalizeSubmission(propertyId: string): Promise<Result<{ ref: string }>> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "Your session expired. Please verify again." };

  const property = await db.one<Property>("SELECT * FROM properties WHERE id = ?", [propertyId]);
  if (!property || property.owner_id !== owner.id) return { ok: false, error: "Submission not found." };
  if (property.status !== "draft") return { ok: true, ref: property.reference_no };

  const count = await db.count("SELECT COUNT(*) FROM property_images WHERE property_id = ?", [propertyId]);
  if (count < PHOTO_LIMITS.min) {
    return { ok: false, error: `Please add at least ${PHOTO_LIMITS.min} photos.` };
  }

  const snapshot = Object.fromEntries(
    Object.entries(property).filter(
      ([k]) => !["id", "status", "owner_id", "created_at", "updated_at", "original_submission"].includes(k),
    ),
  );

  const changed = await db.update(
    "properties",
    { status: "pending", submitted_at: new Date(), original_submission: snapshot },
    "id = ? AND status = 'draft'",
    [propertyId],
  );
  if (!changed) return { ok: true, ref: property.reference_no };

  await logActivity({ entityType: "property", entityId: propertyId, action: "submitted", actorType: "owner", actorId: owner.id });
  await notify(owner.phone, "submission_received", [owner.profile.name ?? "there", property.reference_no]);

  return { ok: true, ref: property.reference_no };
}
