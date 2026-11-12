"use server";

import { revalidatePath, updateTag } from "next/cache";
import sharp from "sharp";
import { requireAdmin, requireStaff, type Staff } from "@/lib/auth";
import { db, transaction, uuid } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { putFile } from "@/lib/storage";
import { parseIstInput } from "@/lib/time";
import { notify } from "@/lib/whatsapp";
import { VERIFICATION_CHECKLIST } from "@/lib/verification-constants";
import type { ActionState, SiteVerification } from "@/lib/types";

// On-site verification. Admins schedule a visit and assign it; the assigned staff
// member (or any admin) completes it with the checklist, GPS and proof photos.

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function refresh(propertyId?: string) {
  revalidatePath("/admin", "layout");
  if (propertyId) revalidatePath(`/admin/properties/${propertyId}`);
}

/** The visit, if this staff member may work on it (admin: any; agent: assigned to them). */
async function visitFor(staff: Staff, id: string) {
  if (!isUuid(id)) return null;
  const v = await db.one<SiteVerification & { reference_no: string; owner_id: string; property_status: string }>(
    `SELECT v.*, p.reference_no, p.owner_id, p.status AS property_status
       FROM site_verifications v JOIN properties p ON p.id = v.property_id WHERE v.id = ?`,
    [id],
  );
  if (!v) return null;
  return staff.role === "admin" || v.assigned_to === staff.userId ? v : null;
}

export async function scheduleVerification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const propertyId = String(formData.get("property_id") ?? "");
  const assignee = String(formData.get("assigned_to") ?? "");
  const when = parseIstInput(formData.get("scheduled_at"));
  if (!isUuid(propertyId)) return { ok: false, error: "Property not found." };
  if (!when) return { ok: false, error: "Choose a date and time for the visit." };

  const [property, staffRow] = await Promise.all([
    db.one<{ id: string; reference_no: string; owner_id: string; status: string }>(
      "SELECT id, reference_no, owner_id, status FROM properties WHERE id = ?",
      [propertyId],
    ),
    isUuid(assignee)
      ? db.one<{ id: string; name: string | null }>(
          "SELECT id, name FROM users WHERE id = ? AND is_active = 1 AND role IN ('admin', 'agent') AND (agent_type IS NULL OR agent_type = 'agent')",
          [assignee],
        )
      : Promise.resolve(null),
  ]);
  if (!property || property.status === "draft") return { ok: false, error: "Property not found." };
  if (!staffRow) return { ok: false, error: "Choose who will visit." };

  // One open visit per property: rescheduling updates it.
  const open = await db.one<{ id: string }>("SELECT id FROM site_verifications WHERE property_id = ? AND status = 'scheduled'", [propertyId]);
  if (open) {
    await db.update("site_verifications", { scheduled_at: when, assigned_to: staffRow.id }, "id = ?", [open.id]);
  } else {
    await db.insert("site_verifications", { id: uuid(), property_id: propertyId, scheduled_at: when, assigned_to: staffRow.id, created_by: admin.userId });
  }
  await logActivity({
    entityType: "property",
    entityId: propertyId,
    action: open ? "verification_rescheduled" : "verification_scheduled",
    actorType: "admin",
    actorId: admin.userId,
    diff: { visit_at: when.toISOString(), assigned_to: staffRow.name },
  });

  const owner = await db.one<{ phone: string | null }>("SELECT phone FROM users WHERE id = ?", [property.owner_id]);
  const whenText = when.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  await notify(owner?.phone, "site_visit_scheduled", [property.reference_no, whenText]);

  refresh(propertyId);
  return { ok: true, message: open ? "Visit rescheduled. Owner notified." : "Visit scheduled. Owner notified." };
}

export async function cancelVerification(id: string) {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  const v = await db.one<{ property_id: string }>("SELECT property_id FROM site_verifications WHERE id = ? AND status = 'scheduled'", [id]);
  if (!v) return;
  await db.update("site_verifications", { status: "cancelled" }, "id = ?", [id]);
  await logActivity({ entityType: "property", entityId: v.property_id, action: "verification_cancelled", actorType: "admin", actorId: admin.userId });
  refresh(v.property_id);
}

export async function completeVerification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const v = await visitFor(staff, String(formData.get("id") ?? ""));
  if (!v) return { ok: false, error: "Visit not found." };
  if (v.status !== "scheduled") return { ok: false, error: "This visit is already closed." };

  const result = String(formData.get("result") ?? "");
  if (result !== "verified" && result !== "issues") return { ok: false, error: "Choose Verified or Issues found." };
  const checklist = Object.fromEntries(VERIFICATION_CHECKLIST.map((c) => [c.key, formData.get(c.key) === "on"]));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 4000) || null;
  if (result === "verified") {
    const missing = VERIFICATION_CHECKLIST.filter((c) => c.required && !checklist[c.key]);
    if (missing.length) return { ok: false, error: `To mark verified, confirm: ${missing.map((m) => m.label.toLowerCase()).join("; ")}.` };
  } else if (!notes) {
    return { ok: false, error: "Describe the issues you found." };
  }

  // Location from the phone's GPS, if the browser shared it.
  const num = (k: string) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) && String(formData.get(k) ?? "") !== "" ? n : null;
  };
  let lat = num("latitude");
  let lng = num("longitude");
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) lat = lng = null;
  const accuracy = lat === null ? null : Math.round(num("accuracy") ?? 0) || null;

  const photos = await db.count("SELECT COUNT(*) FROM site_verification_photos WHERE verification_id = ?", [v.id]);
  if (result === "verified" && photos === 0) return { ok: false, error: "Add at least one photo taken at the property." };

  const now = new Date();
  await transaction(async (tx) => {
    await tx.update(
      "site_verifications",
      { status: "completed", result, visited_at: now, checklist, notes, latitude: lat, longitude: lng, location_accuracy_m: accuracy },
      "id = ?",
      [v.id],
    );
    await tx.update(
      "properties",
      result === "verified" ? { verified_at: now, verified_by: staff.userId } : { verified_at: null, verified_by: null },
      "id = ?",
      [v.property_id],
    );
  });
  await logActivity({
    entityType: "property",
    entityId: v.property_id,
    action: result === "verified" ? "verified_on_site" : "verification_issues",
    actorType: "admin", // "admin" covers all staff; the actor's own role comes from actorId
    actorId: staff.userId,
    diff: { visit_id: v.id, notes, location: lat !== null ? `${lat},${lng}` : null },
  });
  if (v.property_status === "approved") {
    updateTag("listings");
    updateTag(`property:${v.reference_no}`);
  }
  refresh(v.property_id);
  return { ok: true, message: result === "verified" ? "Marked verified on site." : "Saved with issues. The admin will follow up." };
}

/** One proof photo per call (keeps request bodies small). Stored privately. */
export async function uploadVerificationPhoto(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const v = await visitFor(staff, String(formData.get("id") ?? ""));
  if (!v || v.status !== "scheduled") return { ok: false, error: "This visit can no longer be changed." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "No photo received." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, error: "Each photo must be under 15 MB." };
  const count = await db.count("SELECT COUNT(*) FROM site_verification_photos WHERE verification_id = ?", [v.id]);
  if (count >= 12) return { ok: false, error: "Up to 12 photos per visit." };

  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: "That file doesn't look like a valid photo." };
  }
  const key = `${v.property_id}/${uuid()}.jpg`;
  await putFile("originals", key, jpeg);
  await db.insert("site_verification_photos", { id: uuid(), verification_id: v.id, storage_path: key, uploaded_by: staff.userId });
  revalidatePath(`/admin/verifications/${v.id}`);
  return { ok: true };
}
