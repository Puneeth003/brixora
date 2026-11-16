"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { db, uuid } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { canSeePropertyFiles } from "@/lib/staff-access";
import { DocumentError, storeDocument } from "@/lib/documents";
import { removeFile } from "@/lib/storage";
import { DOCUMENT_LIMITS, DOCUMENT_TYPES } from "@/lib/constants";

// Ownership documents, reviewed by admins and the auditor assigned to the property.

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function refresh(propertyId: string) {
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/admin/verifications", "layout");
}

export async function reviewDocument(documentId: string, formData: FormData) {
  const staff = await requireStaff();
  if (!isUuid(documentId)) return;
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "accepted" && decision !== "rejected" && decision !== "pending") return;
  // The owner sees the note on a rejected document, so it always says something useful.
  const note =
    String(formData.get("note") ?? "").trim().slice(0, 500) ||
    (decision === "rejected" ? "Not clear, or doesn't match the property. Please upload a clearer copy." : null);

  const doc = await db.one<{ id: string; property_id: string; doc_type: string }>("SELECT id, property_id, doc_type FROM property_documents WHERE id = ?", [documentId]);
  if (!doc || !(await canSeePropertyFiles(staff, doc.property_id))) return;

  await db.update(
    "property_documents",
    decision === "pending"
      ? { status: "pending", review_note: null, reviewed_by: null, reviewed_at: null }
      : { status: decision, review_note: note, reviewed_by: staff.userId, reviewed_at: new Date() },
    "id = ?",
    [doc.id],
  );
  await logActivity({
    entityType: "property",
    entityId: doc.property_id,
    action: decision === "pending" ? "document_review_undone" : `document_${decision}`,
    actorType: "admin",
    actorId: staff.userId,
    diff: { doc_type: doc.doc_type, ...(note ? { note } : {}) },
  });
  refresh(doc.property_id);
}

/** Staff add a document themselves, e.g. the auditor photographs the khata on site. */
export async function uploadStaffDocument(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const propertyId = String(formData.get("propertyId") ?? "");
  const docType = String(formData.get("docType") ?? "");
  const file = formData.get("file");
  if (!isUuid(propertyId) || !(await canSeePropertyFiles(staff, propertyId))) return { ok: false, error: "Property not found." };
  if (!DOCUMENT_TYPES.some((t) => t.value === docType)) return { ok: false, error: "Choose what kind of document this is." };
  if (!(file instanceof File) || !file.size) return { ok: false, error: "No document received." };
  const count = await db.count("SELECT COUNT(*) FROM property_documents WHERE property_id = ?", [propertyId]);
  if (count >= DOCUMENT_LIMITS.max * 2) return { ok: false, error: "This listing has too many documents already." };

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
      uploaded_by: staff.userId,
    });
  } catch (e) {
    if (e instanceof DocumentError) return { ok: false, error: e.message };
    console.error("[admin] document upload failed", e);
    return { ok: false, error: "Upload failed. Please try again." };
  }
  await logActivity({ entityType: "property", entityId: propertyId, action: "document_uploaded", actorType: "admin", actorId: staff.userId, diff: { doc_type: docType } });
  refresh(propertyId);
  return { ok: true };
}

export async function deleteDocument(documentId: string) {
  const admin = await requireAdmin();
  if (!isUuid(documentId)) return;
  const doc = await db.one<{ id: string; property_id: string; storage_path: string; doc_type: string }>(
    "SELECT id, property_id, storage_path, doc_type FROM property_documents WHERE id = ?",
    [documentId],
  );
  if (!doc) return;
  await db.run("DELETE FROM property_documents WHERE id = ?", [doc.id]);
  await removeFile("documents", doc.storage_path);
  await logActivity({ entityType: "property", entityId: doc.property_id, action: "document_deleted", actorType: "admin", actorId: admin.userId, diff: { doc_type: doc.doc_type } });
  refresh(doc.property_id);
}
