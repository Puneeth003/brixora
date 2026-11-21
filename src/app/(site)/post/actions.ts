"use server";

import { getOwner } from "@/lib/auth";
import { db, nextReferenceNo, uuid } from "@/lib/db";
import { firstError, firstErrorField, ownerPropertySchema, pinSchema } from "@/lib/validation";
import { ImageError, processAndStore } from "@/lib/images";
import { DocumentError, storeDocument } from "@/lib/documents";
import { notify } from "@/lib/whatsapp";
import { logActivity } from "@/lib/activity";
import { DOCUMENT_LIMITS, DOCUMENT_TYPES, OWNER_CONSENT_VERSION, PHOTO_LIMITS } from "@/lib/constants";
import type { Property } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string | null };

/** Unfinished submissions one number may start per day (each takes a reference number). */
const MAX_DRAFTS_PER_DAY = 5;

/**
 * Step 1 of submit: create the draft (status forced to "draft", owner forced to self).
 * The owner's name comes from their account (asked at WhatsApp sign-in), not the form.
 */
export async function createDraft(input: unknown): Promise<Result<{ id: string; ref: string }>> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "Please verify your phone number first." };

  if (!owner.profile.name?.trim()) return { ok: false, error: "Please sign in again and tell us your name." };
  const parsed = ownerPropertySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error), field: firstErrorField(parsed.error) };
  const pin = pinSchema.safeParse(input);
  if (!pin.success) return { ok: false, error: firstError(pin.error), field: "latitude" };

  const recentDrafts = await db.count(
    "SELECT COUNT(*) FROM properties WHERE owner_id = ? AND status = 'draft' AND created_at > ?",
    [owner.id, new Date(Date.now() - 86_400_000)],
  );
  if (recentDrafts >= MAX_DRAFTS_PER_DAY) {
    return { ok: false, error: "Too many unfinished submissions today. Please try again tomorrow, or contact us." };
  }

  try {
    const id = uuid();
    const ref = await nextReferenceNo();
    await db.insert("properties", { ...parsed.data, ...pin.data, id, reference_no: ref, status: "draft", owner_id: owner.id });
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

/** Step 2b (optional): one ownership document per call, stored privately. */
export async function uploadDraftDocument(formData: FormData): Promise<Result> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "Your session expired. Please verify again." };

  const propertyId = String(formData.get("propertyId") ?? "");
  const docType = String(formData.get("docType") ?? "");
  const file = formData.get("file");
  if (!DOCUMENT_TYPES.some((t) => t.value === docType)) return { ok: false, error: "Choose what kind of document this is." };
  if (!(file instanceof File) || !file.size) return { ok: false, error: "No document received." };

  const property = await db.one<{ status: string; owner_id: string }>("SELECT status, owner_id FROM properties WHERE id = ?", [propertyId]);
  if (!property || property.owner_id !== owner.id || property.status !== "draft") {
    return { ok: false, error: "This submission can no longer be changed." };
  }
  const count = await db.count("SELECT COUNT(*) FROM property_documents WHERE property_id = ?", [propertyId]);
  if (count >= DOCUMENT_LIMITS.max) return { ok: false, error: `Up to ${DOCUMENT_LIMITS.max} documents per listing.` };

  try {
    const stored = await storeDocument(file, propertyId);
    await db.insert("property_documents", {
      id: uuid(),
      property_id: propertyId,
      doc_type: docType,
      storage_path: stored.storagePath,
      original_name: stored.originalName,
      mime_type: stored.mimeType,
      size_bytes: stored.sizeBytes,
      uploaded_by: owner.id,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof DocumentError) return { ok: false, error: e.message };
    console.error("[post] document upload failed", e);
    return { ok: false, error: "A document failed to upload. Please try again." };
  }
}

/** Step 3: move draft → pending, snapshot the original, notify the owner. */
export async function finalizeSubmission(propertyId: string, consent: { owner: boolean; brokerage: boolean }): Promise<Result<{ ref: string }>> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "Your session expired. Please verify again." };
  if (consent?.owner !== true || consent?.brokerage !== true) return { ok: false, error: "Please tick both boxes to submit.", field: "consent" };

  const property = await db.one<Property>("SELECT * FROM properties WHERE id = ?", [propertyId]);
  if (!property || property.owner_id !== owner.id) return { ok: false, error: "Submission not found." };
  if (property.status !== "draft") return { ok: true, ref: property.reference_no };

  const count = await db.count("SELECT COUNT(*) FROM property_images WHERE property_id = ?", [propertyId]);
  if (count < PHOTO_LIMITS.min) {
    return { ok: false, error: `Please add at least ${PHOTO_LIMITS.min} photos.` };
  }

  const snapshot = Object.fromEntries(
    Object.entries(property).filter(
      ([k]) => !["id", "status", "owner_id", "created_at", "updated_at", "original_submission", "owner_consent_at", "owner_consent_version"].includes(k),
    ),
  );

  const changed = await db.update(
    "properties",
    { status: "pending", submitted_at: new Date(), original_submission: snapshot, owner_consent_at: new Date(), owner_consent_version: OWNER_CONSENT_VERSION },
    "id = ? AND status = 'draft'",
    [propertyId],
  );
  if (!changed) return { ok: true, ref: property.reference_no };

  await logActivity({ entityType: "property", entityId: propertyId, action: "submitted", actorType: "owner", actorId: owner.id });
  await notify(owner.phone, "submission_received", [owner.profile.name ?? "there", property.reference_no]);

  return { ok: true, ref: property.reference_no };
}
