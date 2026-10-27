"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, requireAdmin } from "@/lib/auth";
import { configValue, db, uuid } from "@/lib/db";
import { adminPropertySchema, firstError } from "@/lib/validation";
import { ImageError, processAndStore, removeStoredImage } from "@/lib/images";
import { removeFile } from "@/lib/storage";
import { brokeragePhone, notify, retryMessage } from "@/lib/whatsapp";
import { displayPhone } from "@/lib/format";
import { diffFields, logActivity } from "@/lib/activity";
import { CHANGE_TYPE_LABELS } from "@/lib/constants";
import { propertyUrl } from "@/lib/site";
import type { ActionState, ChangeRequest, Property, PropertyImage } from "@/lib/types";

// Every action re-checks the admin session (TOTP-verified) — never rely on the page having done it.

function invalidate(ref?: string) {
  updateTag("listings");
  if (ref) updateTag(`property:${ref}`);
}

function getProperty(id: string) {
  return db.one<Property>("SELECT * FROM properties WHERE id = ?", [id]);
}

async function ownerPhone(ownerId: string) {
  return (await db.one<{ phone: string | null }>("SELECT phone FROM users WHERE id = ?", [ownerId]))?.phone ?? null;
}

async function expiryDays() {
  return Number(await configValue("listing_expiry_days")) || 90;
}

function daysFromNow(days: number, from = Date.now()) {
  return new Date(from + days * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function adminSignOut() {
  await endSession("admin");
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Review & editing
// ---------------------------------------------------------------------------

export async function claimForReview(id: string) {
  const admin = await requireAdmin();
  const changed = await db.update("properties", { status: "under_review", reviewed_by: admin.userId }, "id = ? AND status = 'pending'", [id]);
  if (changed) {
    await logActivity({ entityType: "property", entityId: id, action: "review_started", actorType: "admin", actorId: admin.userId });
  }
}

export async function savePropertyEdits(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const before = await getProperty(id);
  if (!before) return { ok: false, error: "Property not found." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = adminPropertySchema.safeParse({
    ...raw,
    price_negotiable: formData.get("price_negotiable") === "on",
    amenities: formData.getAll("amenities").map(String).filter(Boolean),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const changes = diffFields(before as unknown as Record<string, unknown>, parsed.data);
  if (!Object.keys(changes).length) return { ok: true, message: "No changes." };

  try {
    await db.update("properties", parsed.data, "id = ?", [id]);
  } catch (e) {
    console.error("[admin] save property failed", e);
    return { ok: false, error: "Could not save. Check the builder/project selection and try again." };
  }

  await logActivity({ entityType: "property", entityId: id, action: "edited", actorType: "admin", actorId: admin.userId, diff: changes });
  invalidate(before.reference_no);
  return { ok: true, message: "Saved." };
}

const CHECKLIST = ["check_address", "check_contact", "check_photos"] as const;

export async function approveProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!CHECKLIST.every((k) => formData.get(k) === "on")) {
    return { ok: false, error: "Tick every item on the checklist before approving." };
  }

  const p = await getProperty(id);
  if (!p) return { ok: false, error: "Property not found." };
  if (!["pending", "under_review", "rejected"].includes(p.status)) {
    return { ok: false, error: `Can't approve a listing that is ${p.status}.` };
  }
  if (!p.verified_at && (await configValue("require_site_verification")) === "1") {
    return { ok: false, error: "This listing needs an on-site verification first. Schedule a visit below, or turn the rule off in Settings." };
  }

  // Submission photos become public; photos from unapproved change requests stay hidden.
  await db.run("UPDATE property_images SET approved = 1 WHERE property_id = ? AND change_request_id IS NULL", [id]);

  const imgs = await db.all<{ id: string; is_cover: boolean }>(
    "SELECT id, is_cover FROM property_images WHERE property_id = ? AND approved = 1 AND is_visible = 1 ORDER BY sort_order",
    [id],
  );
  if (!imgs.length) return { ok: false, error: "At least one visible photo is required." };
  if (!imgs.some((i) => i.is_cover)) {
    await db.update("property_images", { is_cover: true }, "id = ?", [imgs[0].id]);
  }

  await db.update(
    "properties",
    {
      status: "approved",
      approved_at: new Date(),
      expires_at: daysFromNow(await expiryDays()),
      reviewed_by: admin.userId,
      rejected_reason: null,
    },
    "id = ?",
    [id],
  );

  await logActivity({ entityType: "property", entityId: id, action: "approved", actorType: "admin", actorId: admin.userId });
  invalidate(p.reference_no);
  await notify(await ownerPhone(p.owner_id), "listing_approved", [p.reference_no, propertyUrl(p.reference_no)]);
  return { ok: true, message: "Approved and live. Owner notified." };
}

export async function rejectProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, error: "Give the owner a reason (at least 5 characters)." };

  const p = await getProperty(id);
  if (!p) return { ok: false, error: "Property not found." };
  if (!["pending", "under_review"].includes(p.status)) return { ok: false, error: `Can't reject a listing that is ${p.status}.` };

  await db.update("properties", { status: "rejected", rejected_reason: reason, reviewed_by: admin.userId }, "id = ?", [id]);

  await logActivity({ entityType: "property", entityId: id, action: "rejected", actorType: "admin", actorId: admin.userId, diff: { reason } });
  await notify(await ownerPhone(p.owner_id), "listing_rejected", [p.reference_no, reason]);
  return { ok: true, message: "Rejected. Owner notified." };
}

// ---------------------------------------------------------------------------
// Live listing controls
// ---------------------------------------------------------------------------

async function setStatus(id: string, action: string, update: Partial<Property>, allowedFrom: Property["status"][]) {
  const admin = await requireAdmin();
  const p = await getProperty(id);
  if (!p || !allowedFrom.includes(p.status)) return null;
  await db.update("properties", update, "id = ?", [id]);
  await logActivity({
    entityType: "property",
    entityId: id,
    action,
    actorType: "admin",
    actorId: admin.userId,
    diff: { status: { from: p.status, to: update.status ?? p.status } },
  });
  invalidate(p.reference_no);
  return p;
}

export async function toggleFeatured(id: string) {
  const admin = await requireAdmin();
  const p = await getProperty(id);
  if (!p) return;
  await db.update("properties", { featured: !p.featured }, "id = ?", [id]);
  await logActivity({
    entityType: "property",
    entityId: id,
    action: p.featured ? "unfeatured" : "featured",
    actorType: "admin",
    actorId: admin.userId,
  });
  invalidate(p.reference_no);
}

export async function archiveProperty(id: string) {
  await setStatus(id, "archived", { status: "archived" }, ["approved", "expired", "rejected"]);
}

export async function markSoldByAdmin(id: string) {
  const p = await setStatus(id, "sold", { status: "sold", sold_at: new Date().toISOString() }, ["approved", "sold_pending", "expired"]);
  if (p) {
    await db.update(
      "change_requests",
      { status: "approved", reviewed_at: new Date() },
      "property_id = ? AND type = 'sold' AND status = 'pending'",
      [id],
    );
    await notify(await ownerPhone(p.owner_id), "sold_confirmed", [p.reference_no]);
  }
}

/** Takes a listing off the website without deleting it (archived; can be restored). */
export async function removeFromWebsite(id: string) {
  await setStatus(id, "removed_from_website", { status: "archived" }, ["approved", "expired", "sold_pending", "sold", "rejected"]);
  revalidatePath("/admin", "layout");
}

/**
 * Deletes a listing and everything attached to it (photos, change requests, site
 * visits, shortlists). Enquiries and CRM clients are kept, without the listing link.
 * The form must repeat the reference number as confirmation.
 */
export async function deletePropertyPermanently(id: string, formData: FormData) {
  const admin = await requireAdmin();
  const p = await getProperty(id);
  if (!p) redirect("/admin/listings");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== p.reference_no.toUpperCase()) {
    redirect(`/admin/properties/${id}?error=${encodeURIComponent("Type the reference number exactly to delete.")}`);
  }

  const [images, visitPhotos] = await Promise.all([
    db.all<{ storage_path: string; watermarked_path: string }>("SELECT storage_path, watermarked_path FROM property_images WHERE property_id = ?", [id]),
    db.all<{ storage_path: string }>(
      "SELECT ph.storage_path FROM site_verification_photos ph JOIN site_verifications v ON v.id = ph.verification_id WHERE v.property_id = ?",
      [id],
    ),
  ]);
  await db.run("DELETE FROM properties WHERE id = ?", [id]);
  // Files last: the rows are gone even if a file is already missing.
  await Promise.all([
    ...images.filter((i) => !i.storage_path.startsWith("demo/")).map((i) => removeStoredImage(i.storage_path, i.watermarked_path)),
    ...visitPhotos.map((ph) => removeFile("originals", ph.storage_path)),
  ]);
  await logActivity({
    entityType: "property",
    entityId: id,
    action: "deleted",
    actorType: "admin",
    actorId: admin.userId,
    diff: { reference_no: p.reference_no, title: p.title, status: p.status },
  });
  invalidate(p.reference_no);
  revalidatePath("/admin", "layout");
  redirect(`/admin/listings?removed=${encodeURIComponent(p.reference_no)}`);
}

export async function restoreProperty(id: string) {
  const p = await getProperty(id);
  if (!p) return;
  const expired = !p.expires_at || new Date(p.expires_at).getTime() < Date.now();
  await setStatus(
    id,
    "restored",
    { status: "approved", ...(expired ? { expires_at: daysFromNow(await expiryDays()) } : {}) },
    ["archived", "expired"],
  );
  revalidatePath("/admin", "layout");
}

export async function extendExpiry(id: string, formData: FormData) {
  const admin = await requireAdmin();
  const days = Math.min(365, Math.max(1, Number(formData.get("days")) || 30));
  const p = await getProperty(id);
  if (!p) return;
  const base = p.expires_at && new Date(p.expires_at).getTime() > Date.now() ? new Date(p.expires_at).getTime() : Date.now();
  const expires_at = daysFromNow(days, base);
  await db.update("properties", { expires_at, ...(p.status === "expired" ? { status: "approved" } : {}) }, "id = ?", [id]);
  await logActivity({
    entityType: "property",
    entityId: id,
    action: "expiry_extended",
    actorType: "admin",
    actorId: admin.userId,
    diff: { expires_at: { from: p.expires_at, to: expires_at } },
  });
  invalidate(p.reference_no);
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

async function imageWithProperty(imageId: string) {
  const img = await db.one<PropertyImage & { reference_no: string }>(
    "SELECT i.*, p.reference_no FROM property_images i JOIN properties p ON p.id = i.property_id WHERE i.id = ?",
    [imageId],
  );
  return img ? { img, ref: img.reference_no } : null;
}

export async function setCoverImage(imageId: string) {
  const admin = await requireAdmin();
  const ctx = await imageWithProperty(imageId);
  if (!ctx) return;
  await db.update("property_images", { is_cover: false }, "property_id = ?", [ctx.img.property_id]);
  await db.update("property_images", { is_cover: true, is_visible: true }, "id = ?", [imageId]);
  await logActivity({ entityType: "property", entityId: ctx.img.property_id, action: "photo_cover_set", actorType: "admin", actorId: admin.userId });
  invalidate(ctx.ref);
}

export async function toggleImageVisible(imageId: string) {
  const admin = await requireAdmin();
  const ctx = await imageWithProperty(imageId);
  if (!ctx) return;
  await db.update("property_images", { is_visible: !ctx.img.is_visible }, "id = ?", [imageId]);
  await logActivity({
    entityType: "property",
    entityId: ctx.img.property_id,
    action: ctx.img.is_visible ? "photo_hidden" : "photo_shown",
    actorType: "admin",
    actorId: admin.userId,
  });
  invalidate(ctx.ref);
}

export async function deleteImage(imageId: string) {
  const admin = await requireAdmin();
  const ctx = await imageWithProperty(imageId);
  if (!ctx) return;
  await db.run("DELETE FROM property_images WHERE id = ?", [imageId]);
  await removeStoredImage(ctx.img.storage_path, ctx.img.watermarked_path);
  await logActivity({ entityType: "property", entityId: ctx.img.property_id, action: "photo_deleted", actorType: "admin", actorId: admin.userId });
  invalidate(ctx.ref);
}

export async function moveImage(imageId: string, direction: number) {
  await requireAdmin();
  const ctx = await imageWithProperty(imageId);
  if (!ctx) return;
  const all = await db.all<{ id: string }>("SELECT id FROM property_images WHERE property_id = ? ORDER BY sort_order, created_at", [
    ctx.img.property_id,
  ]);
  const i = all.findIndex((x) => x.id === imageId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await Promise.all(all.map((x, idx) => db.update("property_images", { sort_order: idx }, "id = ?", [x.id])));
  invalidate(ctx.ref);
}

export async function uploadAdminPhoto(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("propertyId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "No photo received." };
  const p = await getProperty(propertyId);
  if (!p) return { ok: false, error: "Property not found." };

  const count = await db.count("SELECT COUNT(*) FROM property_images WHERE property_id = ?", [propertyId]);
  try {
    const stored = await processAndStore(file, propertyId);
    await db.insert("property_images", {
      id: uuid(),
      property_id: propertyId,
      storage_path: stored.storagePath,
      watermarked_path: stored.watermarkedPath,
      sort_order: count ?? 0,
      is_cover: (count ?? 0) === 0,
      approved: true,
      uploaded_by: admin.userId,
    });
    await logActivity({ entityType: "property", entityId: propertyId, action: "photo_uploaded", actorType: "admin", actorId: admin.userId });
    invalidate(p.reference_no);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ImageError ? e.message : "Upload failed." };
  }
}

// ---------------------------------------------------------------------------
// Change requests
// ---------------------------------------------------------------------------

function getRequest(id: string) {
  return db.one<ChangeRequest>("SELECT * FROM change_requests WHERE id = ?", [id]);
}

export async function approveChangeRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const req = await getRequest(String(formData.get("id") ?? ""));
  if (!req || req.status !== "pending") return { ok: false, error: "Request not found or already reviewed." };
  const p = await getProperty(req.property_id);
  if (!p) return { ok: false, error: "Property not found." };

  const now = new Date().toISOString();
  let update: Partial<Property> = {};
  let applied: Record<string, unknown> = {};

  if (req.type === "price") {
    const parsed = z
      .object({ price: z.coerce.number().int().min(1000), price_negotiable: z.boolean() })
      .safeParse({ price: formData.get("price"), price_negotiable: formData.get("price_negotiable") === "on" });
    if (!parsed.success) return { ok: false, error: "Enter a valid price." };
    update = parsed.data;
  } else if (req.type === "details") {
    const description = String(formData.get("description") ?? "").trim();
    const available = String(formData.get("available_from") ?? "");
    if (description) update.description = description;
    update.available_from = /^\d{4}-\d{2}-\d{2}$/.test(available) ? available : null;
    const hide = formData.getAll("hide_image_ids").map(String);
    const approvePhotos = formData.getAll("approve_image_ids").map(String);
    if (hide.length) {
      await db.update("property_images", { is_visible: false, is_cover: false }, "property_id = ? AND id IN (?)", [p.id, hide]);
    }
    if (approvePhotos.length) {
      await db.update("property_images", { approved: true }, "change_request_id = ? AND id IN (?)", [req.id, approvePhotos]);
    }
    // Photos from this request that weren't approved stay hidden for good.
    await db.update("property_images", { is_visible: false }, "change_request_id = ? AND approved = 0", [req.id]);
    applied = { hidden_images: hide, approved_images: approvePhotos };
  } else if (req.type === "sold") {
    update = { status: "sold", sold_at: now };
  }

  if (Object.keys(update).length) await db.update("properties", update, "id = ?", [p.id]);
  await db.update("change_requests", { status: "approved", reviewed_by: admin.userId, reviewed_at: now, admin_note: null }, "id = ?", [req.id]);

  await logActivity({
    entityType: "property",
    entityId: p.id,
    action: `change_approved:${req.type}`,
    actorType: "admin",
    actorId: admin.userId,
    diff: { request_id: req.id, ...diffFields(p as unknown as Record<string, unknown>, update as Record<string, unknown>), ...applied },
  });
  invalidate(p.reference_no);

  const phone = await ownerPhone(p.owner_id);
  if (req.type === "sold") await notify(phone, "sold_confirmed", [p.reference_no]);
  else await notify(phone, "change_approved", [p.reference_no, CHANGE_TYPE_LABELS[req.type]]);
  return { ok: true, message: "Approved and applied. Owner notified." };
}

export async function rejectChangeRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const req = await getRequest(String(formData.get("id") ?? ""));
  if (!req || req.status !== "pending") return { ok: false, error: "Request not found or already reviewed." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, error: "Give the owner a reason (at least 5 characters)." };
  const p = await getProperty(req.property_id);
  if (!p) return { ok: false, error: "Property not found." };

  await db.update(
    "change_requests",
    { status: "rejected", reviewed_by: admin.userId, reviewed_at: new Date(), admin_note: reason },
    "id = ?",
    [req.id],
  );
  await db.update("property_images", { is_visible: false }, "change_request_id = ? AND approved = 0", [req.id]);

  if (req.type === "sold" && p.status === "sold_pending") {
    await db.update("properties", { status: "approved" }, "id = ?", [p.id]);
    invalidate(p.reference_no);
  }

  await logActivity({
    entityType: "property",
    entityId: p.id,
    action: `change_rejected:${req.type}`,
    actorType: "admin",
    actorId: admin.userId,
    diff: { request_id: req.id, reason },
  });
  await notify(await ownerPhone(p.owner_id), "change_rejected", [p.reference_no, CHANGE_TYPE_LABELS[req.type], reason]);
  return { ok: true, message: "Rejected. Owner notified." };
}

// ---------------------------------------------------------------------------
// Builders & projects
// ---------------------------------------------------------------------------

const opt = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function saveBuilder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = opt(formData.get("id"));
  const name = opt(formData.get("name"));
  if (!name) return { ok: false, error: "Name is required." };
  const row = {
    name,
    rera_no: opt(formData.get("rera_no")),
    contact_name: opt(formData.get("contact_name")),
    phone: opt(formData.get("phone")),
    notes: opt(formData.get("notes")),
  };
  const savedId = id ?? uuid();
  if (id) {
    if (!(await db.update("builders", row, "id = ?", [id]))) return { ok: false, error: "Builder not found." };
  } else {
    await db.insert("builders", { id: savedId, ...row });
  }
  await logActivity({ entityType: "builder", entityId: savedId, action: id ? "edited" : "created", actorType: "admin", actorId: admin.userId, diff: row });
  invalidate();
  return { ok: true, message: "Saved." };
}

export async function deleteBuilder(id: string) {
  const admin = await requireAdmin();
  await db.run("DELETE FROM builders WHERE id = ?", [id]);
  await logActivity({ entityType: "builder", entityId: id, action: "deleted", actorType: "admin", actorId: admin.userId });
  invalidate();
}

export async function saveProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = opt(formData.get("id"));
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Project name is required"),
      builder_id: z.string().uuid("Choose a builder"),
      status: z.enum(["upcoming", "under_construction", "ready"]),
    })
    .safeParse({ name: formData.get("name"), builder_id: formData.get("builder_id"), status: formData.get("status") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const row = { ...parsed.data, locality: opt(formData.get("locality")), rera_no: opt(formData.get("rera_no")) };
  const savedId = id ?? uuid();
  try {
    if (id) {
      if (!(await db.update("projects", row, "id = ?", [id]))) return { ok: false, error: "Project not found." };
    } else {
      await db.insert("projects", { id: savedId, ...row });
    }
  } catch (e) {
    console.error("[admin] save project failed", e);
    return { ok: false, error: "Save failed. Check the builder still exists." };
  }
  await logActivity({ entityType: "project", entityId: savedId, action: id ? "edited" : "created", actorType: "admin", actorId: admin.userId, diff: row });
  invalidate();
  return { ok: true, message: "Saved." };
}

export async function deleteProject(id: string) {
  const admin = await requireAdmin();
  await db.run("DELETE FROM projects WHERE id = ?", [id]);
  await logActivity({ entityType: "project", entityId: id, action: "deleted", actorType: "admin", actorId: admin.userId });
  invalidate();
}

// ---------------------------------------------------------------------------
// Messages & enquiries
// ---------------------------------------------------------------------------

export async function retryWhatsApp(messageId: string) {
  const admin = await requireAdmin();
  await retryMessage(messageId);
  await logActivity({ entityType: "message", entityId: messageId, action: "retried", actorType: "admin", actorId: admin.userId });
}

export async function retryEnquiryForward(enquiryId: string) {
  await requireAdmin();
  const msg = await db.one<{ id: string }>("SELECT id FROM messages WHERE enquiry_id = ? ORDER BY created_at DESC LIMIT 1", [enquiryId]);
  if (msg) return retryWhatsApp(msg.id);

  // The first attempt never got as far as the message log: send it fresh.
  const e = await db.one<{ id: string; name: string; phone: string; message: string | null; reference_no: string | null }>(
    "SELECT e.id, e.name, e.phone, e.message, p.reference_no FROM enquiries e LEFT JOIN properties p ON p.id = e.property_id WHERE e.id = ?",
    [enquiryId],
  );
  if (!e) return;
  const ref = e.reference_no ?? "-";
  const res = await notify(
    brokeragePhone(),
    "enquiry_forward",
    [ref, e.name, displayPhone(e.phone), (e.message || "-").replace(/\s+/g, " ").slice(0, 900), propertyUrl(ref)],
    e.id,
  );
  if (!res.ok && !res.status) {
    await db.update("enquiries", { forward_error: res.error ?? "Not sent" }, "id = ?", [e.id]);
  }
}
