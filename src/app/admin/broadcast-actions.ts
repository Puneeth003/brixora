"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import {
  cleanPhone,
  createBroadcast,
  drainBroadcasts,
  getBroadcast,
  MAX_RECIPIENTS,
  optIn,
  optOut,
  resolveAudience,
  resolveVariables,
  retryFailedRecipients,
  setBroadcastStatus,
  type AudienceSpec,
  type BroadcastInput,
  type Contact,
  type VariableSource,
} from "@/lib/broadcast";
import { db } from "@/lib/db";
import { sendTemplateMessage, type HeaderMedia } from "@/lib/whatsapp";
import type { ActionState } from "@/lib/types";

// Admin → Broadcasts. Every action is admin-only. Sending happens after the response
// (after()) and, for scheduled broadcasts, from /api/cron/broadcasts.

const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;
const LANG = /^[a-z]{2,3}(_[A-Z]{2,4})?$/;
const MEDIA = new Set(["image", "video", "document"]);

function cleanSources(list: unknown): VariableSource[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30).map((s) => {
    const v = (s ?? {}) as Record<string, unknown>;
    return v.kind === "field"
      ? { kind: "field" as const, field: String(v.field ?? "name").slice(0, 80), fallback: String(v.fallback ?? "").slice(0, 1000) }
      : { kind: "text" as const, value: String(v.value ?? "").slice(0, 1000) };
  });
}

function cleanMedia(m: unknown): HeaderMedia | null {
  const v = (m ?? null) as Record<string, unknown> | null;
  if (!v || !MEDIA.has(String(v.type))) return null;
  const link = String(v.link ?? "").trim();
  if (!/^https:\/\/\S+$/.test(link)) return null;
  return { type: v.type as HeaderMedia["type"], link, filename: v.filename ? String(v.filename).slice(0, 200) : undefined };
}

/** Limits the audience spec to known shapes and sizes. */
function cleanAudience(a: unknown): AudienceSpec {
  const v = (a ?? {}) as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.map(String).filter((s) => /^[a-z_]{1,32}$/.test(s)).slice(0, 20) : []);
  const clients = v.clients as Record<string, unknown> | null | undefined;
  const enquiries = v.enquiries as Record<string, unknown> | null | undefined;
  const contacts = Array.isArray(v.contacts) ? v.contacts.slice(0, MAX_RECIPIENTS + 1000) : [];
  return {
    clients: clients ? { types: list(clients.types), statuses: list(clients.statuses), sources: list(clients.sources) } : null,
    members: Boolean(v.members),
    enquiries: enquiries ? { days: Number(enquiries.days) > 0 ? Math.min(3650, Math.floor(Number(enquiries.days))) : null } : null,
    contacts: contacts.map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      const fields: Record<string, string> = {};
      if (r.fields && typeof r.fields === "object") {
        for (const [k, val] of Object.entries(r.fields as Record<string, unknown>).slice(0, 30)) fields[String(k).slice(0, 80)] = String(val ?? "").slice(0, 1000);
      }
      return { phone: String(r.phone ?? "").slice(0, 40), name: r.name ? String(r.name).slice(0, 120) : undefined, fields };
    }),
  };
}

function cleanInput(raw: unknown): BroadcastInput | string {
  const v = (raw ?? {}) as Record<string, unknown>;
  const name = String(v.name ?? "").trim().slice(0, 120);
  if (name.length < 2) return "Give the broadcast a name.";
  const t = (v.template ?? {}) as Record<string, unknown>;
  const tName = String(t.name ?? "");
  const tLang = String(t.lang ?? "");
  if (!TEMPLATE_NAME.test(tName) || !LANG.test(tLang)) return "Choose an approved template.";
  const c = (v.config ?? {}) as Record<string, unknown>;
  const config = {
    body: String(c.body ?? "").slice(0, 4000),
    header: c.header ? String(c.header).slice(0, 200) : null,
    headerFormat: c.headerFormat ? String(c.headerFormat).slice(0, 20) : null,
    footer: c.footer ? String(c.footer).slice(0, 200) : null,
    buttons: Array.isArray(c.buttons) ? c.buttons.map(String).slice(0, 10) : [],
    headerMedia: cleanMedia(c.headerMedia),
    variables: cleanSources(c.variables),
    headerVariables: cleanSources(c.headerVariables),
  };
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(config.headerFormat ?? "") && !config.headerMedia) {
    return `This template has a ${config.headerFormat!.toLowerCase()} header. Add a public https link to the file.`;
  }
  let scheduledAt: string | null = null;
  if (v.scheduledAt) {
    const d = new Date(String(v.scheduledAt));
    if (Number.isNaN(d.getTime())) return "Choose a valid date and time.";
    if (d.getTime() > Date.now() + 60_000) scheduledAt = d.toISOString();
    if (d.getTime() > Date.now() + 90 * 86_400_000) return "Schedule within the next 90 days.";
  }
  return {
    name,
    template: { name: tName, lang: tLang, category: t.category ? String(t.category).slice(0, 32) : null },
    config,
    audience: cleanAudience(v.audience),
    scheduledAt,
  };
}

export type AudienceEstimate =
  | { ok: true; count: number; optedOut: number; invalid: number; duplicates: number; sample: Contact[] }
  | { ok: false; error: string };

/** Wizard: how many people the audience reaches, and a few of them for the preview. */
export async function estimateAudience(spec: AudienceSpec): Promise<AudienceEstimate> {
  await requireAdmin();
  try {
    const r = await resolveAudience(cleanAudience(spec));
    return { ok: true, count: r.contacts.length, optedOut: r.optedOut, invalid: r.invalid, duplicates: r.duplicates, sample: r.contacts.slice(0, 5) };
  } catch (e) {
    console.error("[broadcast] estimate failed", e);
    return { ok: false, error: "Couldn't count the audience." };
  }
}

/** Wizard: sends the broadcast's template to one number, filled in as for the first recipient. */
export async function sendBroadcastTest(raw: unknown, phone: string): Promise<ActionState> {
  await requireAdmin();
  const input = cleanInput(raw);
  if (typeof input === "string") return { ok: false, error: input };
  const to = cleanPhone(String(phone ?? ""));
  if (!to) return { ok: false, error: "Enter a valid test number with country code." };
  const sample = (await resolveAudience(input.audience)).contacts[0] ?? { phone: to, name: "Test", fields: {} };
  const contact = { ...sample, phone: to };
  const result = await sendTemplateMessage(to, {
    name: input.template.name,
    lang: input.template.lang,
    body: resolveVariables(input.config.variables, contact),
    header: resolveVariables(input.config.headerVariables, contact),
    media: input.config.headerMedia,
  });
  return result.ok ? { ok: true, message: `Test sent to +${to}.` } : { ok: false, error: `Meta: ${result.error}` };
}

export async function createBroadcastAction(raw: unknown): Promise<{ ok: true; id: string; recipients: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const input = cleanInput(raw);
  if (typeof input === "string") return { ok: false, error: input };
  try {
    const { id, recipients } = await createBroadcast(input, admin.userId);
    await logActivity({ entityType: "message", entityId: id, action: "broadcast_created", actorType: "admin", actorId: admin.userId, diff: { name: input.name, template: input.template.name, recipients } });
    if (!input.scheduledAt) after(drainBroadcasts);
    revalidatePath("/admin/broadcasts");
    return { ok: true, id, recipients };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't create the broadcast." };
  }
}

async function control(id: string, action: "pause" | "resume" | "cancel" | "send_now"): Promise<ActionState> {
  const admin = await requireAdmin();
  const b = await getBroadcast(id);
  if (!b) return { ok: false, error: "Broadcast not found." };
  let ok = false;
  if (action === "pause") ok = await setBroadcastStatus(id, ["sending", "scheduled"], "paused");
  if (action === "resume") {
    ok = await setBroadcastStatus(id, ["paused"], "sending");
    if (ok) after(drainBroadcasts);
  }
  if (action === "cancel") ok = await setBroadcastStatus(id, ["scheduled", "sending", "paused"], "cancelled");
  if (action === "send_now") {
    ok = (await db.run("UPDATE broadcasts SET scheduled_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'scheduled'", [id])).affectedRows > 0;
    if (ok) after(drainBroadcasts);
  }
  if (!ok) return { ok: false, error: "The broadcast has already moved on. Refresh the page." };
  await logActivity({ entityType: "message", entityId: id, action: `broadcast_${action}`, actorType: "admin", actorId: admin.userId, diff: { name: b.name } });
  revalidatePath("/admin/broadcasts");
  revalidatePath(`/admin/broadcasts/${id}`);
  const label = { pause: "Paused.", resume: "Sending again.", cancel: "Cancelled. Messages already sent stay sent.", send_now: "Sending now." }[action];
  return { ok: true, message: label };
}

export async function pauseBroadcast(id: string) {
  return control(id, "pause");
}
export async function resumeBroadcast(id: string) {
  return control(id, "resume");
}
export async function cancelBroadcast(id: string) {
  return control(id, "cancel");
}
export async function sendBroadcastNow(id: string) {
  return control(id, "send_now");
}

export async function retryFailedBroadcast(id: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const n = await retryFailedRecipients(id);
  if (!n) return { ok: false, error: "No failed messages to retry." };
  await logActivity({ entityType: "message", entityId: id, action: "broadcast_retry", actorType: "admin", actorId: admin.userId, diff: { recipients: n } });
  after(drainBroadcasts);
  revalidatePath(`/admin/broadcasts/${id}`);
  return { ok: true, message: `Retrying ${n} failed message${n === 1 ? "" : "s"}.` };
}

/** Only finished or cancelled broadcasts can be deleted (with their recipient report). */
export async function deleteBroadcast(id: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const b = await getBroadcast(id);
  if (!b) return { ok: false, error: "Broadcast not found." };
  if (b.status !== "done" && b.status !== "cancelled") return { ok: false, error: "Cancel the broadcast before deleting it." };
  await db.run("DELETE FROM broadcasts WHERE id = ?", [id]);
  await logActivity({ entityType: "message", entityId: id, action: "broadcast_deleted", actorType: "admin", actorId: admin.userId, diff: { name: b.name } });
  revalidatePath("/admin/broadcasts");
  return { ok: true, message: "Deleted." };
}

/** Opt-outs page: add numbers (one per line or comma separated). */
export async function addOptOuts(text: string): Promise<ActionState> {
  await requireAdmin();
  const phones = [...new Set(String(text ?? "").split(/[\s,;]+/).map((p) => cleanPhone(p)).filter((p): p is string => Boolean(p)))].slice(0, 5000);
  if (!phones.length) return { ok: false, error: "No valid numbers found." };
  for (const p of phones) await optOut(p, "admin");
  revalidatePath("/admin/broadcasts/opt-outs");
  return { ok: true, message: `${phones.length} number${phones.length === 1 ? "" : "s"} won't get broadcasts.` };
}

export async function removeOptOut(phone: string): Promise<ActionState> {
  await requireAdmin();
  const p = cleanPhone(String(phone ?? ""));
  if (!p) return { ok: false, error: "Invalid number." };
  await optIn(p);
  await db.run("UPDATE users SET wa_opt_out = 0 WHERE phone = ?", [p]);
  revalidatePath("/admin/broadcasts/opt-outs");
  return { ok: true, message: `+${p} can get broadcasts again.` };
}
