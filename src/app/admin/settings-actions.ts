"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailConfigured, sendMail, testEmail, mailErrorReason } from "@/lib/mail";
import type { ActionState } from "@/lib/types";

const HEX = /^#[0-9a-f]{6}$/i;
const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/** Name and work phone of the signed-in staff member. */
export async function updateStaffProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const name = str(formData, "name");
  const workPhone = str(formData, "work_phone");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Name must be 2–80 characters." };
  if (workPhone.length > 20) return { ok: false, error: "Work phone must be at most 20 characters." };
  if (workPhone && !/^[0-9+()\-\s]+$/.test(workPhone)) return { ok: false, error: "Work phone may contain only digits, spaces, +, - and brackets." };
  await db.update("users", { name, work_phone: workPhone || null }, "id = ?", [staff.userId]);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Profile saved." };
}

/** Theme colours, listing expiry and reference prefix (app_config). */
export async function saveOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const brand = str(formData, "brand_color").toLowerCase();
  const sidebar = str(formData, "sidebar_color").toLowerCase();
  const expiryRaw = str(formData, "listing_expiry_days");
  const prefix = str(formData, "ref_prefix").toUpperCase();
  const requireVerification = formData.get("require_site_verification") ? "1" : "0";

  if (!HEX.test(brand)) return { ok: false, error: "Brand colour must be a hex value like #0e5e44." };
  if (!HEX.test(sidebar)) return { ok: false, error: "Sidebar colour must be a hex value like #27292f." };
  const expiry = Number(expiryRaw);
  if (!/^\d+$/.test(expiryRaw) || expiry < 1 || expiry > 365) return { ok: false, error: "Listing expiry must be a whole number from 1 to 365." };
  if (!/^[A-Z]{2,6}$/.test(prefix)) return { ok: false, error: "Reference prefix must be 2–6 letters (A–Z)." };

  const values: [string, string][] = [
    ["brand_color", brand],
    ["sidebar_color", sidebar],
    ["listing_expiry_days", String(expiry)],
    ["ref_prefix", prefix],
    ["require_site_verification", requireVerification],
  ];
  for (const [name, value] of values) {
    await db.run("INSERT INTO app_config (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [name, value]);
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Organization settings saved." };
}

/** Ends every staff session (including the caller's) and sends the caller to the login page. */
export async function signOutAllStaff(formData: FormData) {
  await requireAdmin();
  if (formData.get("confirm") !== "yes") redirect("/admin/settings?section=security");
  await db.run("DELETE FROM sessions WHERE kind = 'admin'");
  redirect("/admin/login");
}

/** Emails the signed-in admin, so SMTP delivery can be checked without resetting a password. */
export async function sendTestEmail(): Promise<ActionState> {
  const staff = await requireAdmin();
  if (!mailConfigured && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Email is not configured: set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER and SMTP_PASS, then redeploy." };
  }
  try {
    await sendMail({ to: staff.email, ...testEmail({ name: staff.name }) });
  } catch (e) {
    console.error("[mail] test email failed", e);
    return { ok: false, error: `Not sent: ${mailErrorReason(e)}.` };
  }
  return {
    ok: true,
    message: mailConfigured ? `Sent to ${staff.email}. Check the inbox and spam folder.` : "Not configured: the email was printed to the server console (development).",
  };
}
