"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { diffFields, logActivity, SETTINGS_ENTITY_ID } from "@/lib/activity";
import { db } from "@/lib/db";
import { isSettableEnv, writeEnv, type SettableEnvName } from "@/lib/env";
import { SITE_FIELDS, savedSiteDetails } from "@/lib/site-settings";
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
  const admin = await requireAdmin();
  const brand = str(formData, "brand_color").toLowerCase();
  const sidebar = str(formData, "sidebar_color").toLowerCase();
  const expiryRaw = str(formData, "listing_expiry_days");
  const prefix = str(formData, "ref_prefix").toUpperCase();

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
  ];
  const before = await db.all<{ name: string; value: string }>("SELECT name, value FROM app_config WHERE name IN (?)", [values.map(([name]) => name)]);
  for (const [name, value] of values) {
    await db.run("INSERT INTO app_config (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [name, value]);
  }
  const changes = diffFields(Object.fromEntries(before.map((r) => [r.name, r.value])), Object.fromEntries(values));
  if (Object.keys(changes).length) {
    await logActivity({ entityType: "settings", entityId: SETTINGS_ENTITY_ID, action: "settings_changed", actorType: "admin", actorId: admin.userId, diff: changes });
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Organization settings saved." };
}

/** Ends every staff session (including the caller's) and sends the caller to the login page. */
export async function signOutAllStaff(formData: FormData) {
  const admin = await requireAdmin();
  if (formData.get("confirm") !== "yes") redirect("/admin/settings?section=security");
  await db.run("DELETE FROM sessions WHERE kind = 'admin'");
  await logActivity({ entityType: "settings", entityId: SETTINGS_ENTITY_ID, action: "signed_out_all", actorType: "admin", actorId: admin.userId });
  redirect("/admin/login");
}

/** Emails the signed-in admin, so SMTP delivery can be checked without resetting a password. */
export async function sendTestEmail(): Promise<ActionState> {
  const staff = await requireAdmin();
  const configured = await mailConfigured();
  if (!configured && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Email is not configured: set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER and SMTP_PASS in Settings → Environment variables." };
  }
  try {
    await sendMail({ to: staff.email, ...(await testEmail({ name: staff.name })) });
  } catch (e) {
    console.error("[mail] test email failed", e);
    return { ok: false, error: `Not sent: ${mailErrorReason(e)}.` };
  }
  return {
    ok: true,
    message: configured ? `Sent to ${staff.email}. Check the inbox and spam folder.` : "Not configured: the email was printed to the server console (development).",
  };
}

/**
 * Settings → Environment variables. `set` saves values (an empty value keeps a saved
 * secret as it is), `remove` deletes saved ones so the server's value applies again.
 */
export async function saveEnvVariables(input: { set: Record<string, string>; remove: string[] }): Promise<ActionState> {
  const admin = await requireAdmin();
  const changes: [SettableEnvName, string | null][] = [];
  for (const [name, raw] of Object.entries(input?.set ?? {})) {
    if (!isSettableEnv(name)) return { ok: false, error: `${name} can't be set here.` };
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (value.length > 4000 || /[\r\n]/.test(value)) return { ok: false, error: `${name}: value must be one line, at most 4000 characters.` };
    changes.push([name, value]);
  }
  for (const name of input?.remove ?? []) {
    if (!isSettableEnv(name)) return { ok: false, error: `${name} can't be set here.` };
    if (!changes.some(([n]) => n === name)) changes.push([name, null]);
  }
  if (!changes.length) return { ok: true, message: "Nothing to save." };
  await writeEnv(changes);
  // Names only: values may be secrets.
  await logActivity({
    entityType: "settings",
    entityId: SETTINGS_ENTITY_ID,
    action: "env_changed",
    actorType: "admin",
    actorId: admin.userId,
    diff: Object.fromEntries(changes.map(([n, v]) => [n, v === null ? "removed" : "set"])),
  });
  revalidatePath("/admin", "layout");
  const set = changes.filter(([, v]) => v !== null).length;
  const removed = changes.length - set;
  return { ok: true, message: `Saved. ${set ? `${set} set` : ""}${set && removed ? ", " : ""}${removed ? `${removed} removed` : ""}. Takes effect within 15 seconds, no redeploy needed.` };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings → Organization → Website details. An empty field falls back to the server's NEXT_PUBLIC_* value. */
export async function saveSiteDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const values = SITE_FIELDS.map((f) => [f.key, str(formData, f.key)] as const);
  for (const [key, value] of values) {
    if (value.length > (key === "address" ? 300 : 120)) return { ok: false, error: `${key === "address" ? "Office address" : "Each field"} is too long.` };
  }
  const get = (k: string) => values.find(([key]) => key === k)?.[1] ?? "";
  if (get("name") && get("name").length < 2) return { ok: false, error: "Brand name must be at least 2 characters." };
  if (get("email") && !EMAIL.test(get("email"))) return { ok: false, error: "Email doesn't look right." };
  const wa = get("whatsapp").replace(/\D/g, "");
  if (get("whatsapp") && !/^\d{10,15}$/.test(wa)) return { ok: false, error: "WhatsApp must be 10–15 digits with country code, e.g. 919845012345." };
  if (get("phone") && !/^[0-9+()\-\s]{6,20}$/.test(get("phone"))) return { ok: false, error: "Phone may contain only digits, spaces, +, - and brackets." };

  const before = await savedSiteDetails();
  for (const [key, raw] of values) {
    const value = key === "whatsapp" ? wa : raw;
    if (value) await db.run("INSERT INTO app_config (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [`site:${key}`, value]);
    else await db.run("DELETE FROM app_config WHERE name = ?", [`site:${key}`]);
  }
  const changes = diffFields(before, Object.fromEntries(values.filter(([, v]) => v).map(([k, v]) => [k, k === "whatsapp" ? wa : v])));
  if (Object.keys(changes).length) {
    await logActivity({ entityType: "settings", entityId: SETTINGS_ENTITY_ID, action: "site_details_changed", actorType: "admin", actorId: admin.userId, diff: changes });
  }
  updateTag("site");
  revalidatePath("/", "layout");
  return { ok: true, message: "Website details saved. Every page shows them now." };
}
