"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, getOwner } from "@/lib/auth";
import { db, transaction, uuid } from "@/lib/db";
import { logClientActivity } from "@/lib/crm";
import type { ActionState } from "@/lib/types";

// Member (visitor / owner) account actions. Every action re-reads the session, and
// enquiries are only reachable through user_id = the signed-in member.

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function updateMemberProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const member = await getOwner();
  if (!member) return { ok: false, error: "Please sign in again." };
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Please enter your name").max(80),
      email: z.string().trim().toLowerCase().email("Enter a valid email").max(254).nullable(),
    })
    .safeParse({ name: formData.get("name"), email: String(formData.get("email") ?? "").trim() || null });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.email) {
    const taken = await db.one<{ id: string }>("SELECT id FROM users WHERE email = ? AND id <> ?", [parsed.data.email, member.id]);
    if (taken) return { ok: false, error: "That email is already used by another account." };
  }
  await db.update("users", parsed.data, "id = ?", [member.id]);
  return { ok: true, message: "Saved." };
}

export async function sendMemberMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const member = await getOwner();
  if (!member) return { ok: false, error: "Please sign in again." };
  const enquiryId = String(formData.get("enquiry_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 2000) return { ok: false, error: "Write a message (up to 2000 characters)." };

  const enquiry = isUuid(enquiryId)
    ? await db.one<{ id: string; client_id: string | null }>("SELECT id, client_id FROM enquiries WHERE id = ? AND user_id = ?", [enquiryId, member.id])
    : null;
  if (!enquiry) return { ok: false, error: "Enquiry not found." };

  const recent = await db.count(
    `SELECT COUNT(*) FROM enquiry_messages m JOIN enquiries e ON e.id = m.enquiry_id
      WHERE e.user_id = ? AND m.sender = 'member' AND m.created_at > ?`,
    [member.id, new Date(Date.now() - 3_600_000)],
  );
  if (recent >= 20) return { ok: false, error: "You've sent a lot of messages. Please wait a while, or call us." };

  await transaction(async (tx) => {
    await tx.insert("enquiry_messages", { id: uuid(), enquiry_id: enquiry.id, sender: "member", author_id: member.id, body });
    await tx.run("UPDATE enquiry_messages SET read_at = UTC_TIMESTAMP(3) WHERE enquiry_id = ? AND sender = 'staff' AND read_at IS NULL", [enquiry.id]);
    if (enquiry.client_id) {
      await logClientActivity({ clientId: enquiry.client_id, type: "note", body: `Message from client: ${body}`, actorId: member.id }, tx);
      await tx.update("clients", { last_contact_at: new Date() }, "id = ?", [enquiry.client_id]);
    }
  });
  return { ok: true, message: "Sent. Our team will reply here." };
}

/** Marks our team's replies as seen (called when the member opens their enquiries). */
export async function markRepliesRead() {
  const member = await getOwner();
  if (!member) return;
  await db.run(
    `UPDATE enquiry_messages m JOIN enquiries e ON e.id = m.enquiry_id
        SET m.read_at = UTC_TIMESTAMP(3)
      WHERE e.user_id = ? AND m.sender = 'staff' AND m.read_at IS NULL`,
    [member.id],
  );
}

/** Saved state for the heart button on a listing. */
export async function savedState(propertyId: string) {
  const member = await getOwner();
  if (!member || !isUuid(propertyId)) return { signedIn: Boolean(member), saved: false };
  const saved = await db.count("SELECT COUNT(*) FROM saved_properties WHERE user_id = ? AND property_id = ?", [member.id, propertyId]);
  return { signedIn: true, saved: saved > 0 };
}

export async function toggleSaved(propertyId: string): Promise<{ ok: boolean; saved?: boolean; needsLogin?: boolean }> {
  const member = await getOwner();
  if (!member) return { ok: false, needsLogin: true };
  if (!isUuid(propertyId)) return { ok: false };
  const removed = await db.run("DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?", [member.id, propertyId]);
  if (removed.affectedRows) return { ok: true, saved: false };
  // Only live listings can be saved.
  const live = await db.one<{ id: string }>("SELECT id FROM public_properties WHERE id = ?", [propertyId]);
  if (!live) return { ok: false };
  await db.run("INSERT IGNORE INTO saved_properties (user_id, property_id) VALUES (?, ?)", [member.id, propertyId]);
  return { ok: true, saved: true };
}

export async function memberSignOut() {
  await endSession("owner");
  redirect("/");
}
