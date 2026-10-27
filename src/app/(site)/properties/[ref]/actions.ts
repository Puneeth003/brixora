"use server";

import { z } from "zod";
import { db, uuid } from "@/lib/db";
import { clientIp, getOwner } from "@/lib/auth";
import { recordEnquiryInCrm } from "@/lib/crm";
import { verifyTurnstile } from "@/lib/turnstile";
import { brokeragePhone, notify } from "@/lib/whatsapp";
import { displayPhone, normalizeIndianPhone } from "@/lib/format";
import { propertyUrl } from "@/lib/site";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/lib/types";

const schema = z.object({
  ref: z.string().min(3).max(40),
  name: z.string().trim().min(2, "Please enter your name").max(80),
  phone: z.string().trim().min(10, "Please enter a valid mobile number").max(20),
  message: z.string().trim().max(1000).optional(),
});

export async function submitEnquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Honeypot: real users never fill this hidden field.
  if (formData.get("website")) return { ok: true, message: "Thanks! We'll be in touch shortly." };

  const parsed = schema.safeParse({
    ref: formData.get("ref"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    message: formData.get("message") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const phone = normalizeIndianPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Please enter a valid 10-digit Indian mobile number." };

  const human = await verifyTurnstile(formData.get("cf-turnstile-response")?.toString(), await clientIp());
  if (!human) return { ok: false, error: "Please complete the verification and try again." };

  const property = await db.one<{ id: string; reference_no: string; listing_type: "sale" | "rent" }>(
    "SELECT id, reference_no, listing_type FROM public_properties WHERE reference_no = ?",
    [parsed.data.ref],
  );
  if (!property) return { ok: false, error: "This listing is no longer available." };

  // A signed-in member sees this enquiry (and our replies) in their account; a guest
  // who later signs up with the same number claims it then.
  const member = await getOwner();
  const enquiry = { id: uuid() };
  try {
    await db.insert("enquiries", {
      id: enquiry.id,
      user_id: member && member.phone === phone ? member.id : null,
      property_id: property.id,
      name: parsed.data.name,
      phone,
      message: parsed.data.message ?? null,
    });
  } catch (error) {
    console.error("[enquiry] insert failed", error);
    return { ok: false, error: "Something went wrong. Please try again or call us." };
  }

  await recordEnquiryInCrm({
    enquiryId: enquiry.id,
    name: parsed.data.name,
    phone,
    message: parsed.data.message ?? null,
    propertyId: property.id,
    listingType: property.listing_type,
  });

  const to = brokeragePhone();
  const result = await notify(
    to,
    "enquiry_forward",
    [
      property.reference_no,
      parsed.data.name,
      displayPhone(phone),
      (parsed.data.message || "-").replace(/\s+/g, " ").slice(0, 900),
      propertyUrl(property.reference_no),
    ],
    enquiry.id,
  );
  if (!to || (!result.ok && !result.status)) {
    // The message was never logged (no recipient / database error): record it for the admin.
    await db.update("enquiries", { forwarded: false, forward_error: result.error ?? "Not sent" }, "id = ?", [enquiry.id]);
  }

  await logActivity({
    entityType: "property",
    entityId: property.id,
    action: "enquiry_received",
    actorType: "system",
    diff: { enquiry_id: enquiry.id },
  });

  return {
    ok: true,
    message: member
      ? "Thanks! Our team will call you shortly. You can follow this enquiry under My account."
      : "Thanks! Our team will call you shortly.",
  };
}
