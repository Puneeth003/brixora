"use server";

import { revalidatePath } from "next/cache";
import { logActivity, SETTINGS_ENTITY_ID } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { graphVersion, whatsappConnection } from "@/lib/whatsapp";
import { templateProblems, toMetaComponents, type TemplateButton, type TemplateDraft } from "@/lib/wa-template-types";
import type { ActionState } from "@/lib/types";

// Admin → WhatsApp → Templates: create message templates in Meta (they go to Meta's
// review, usually minutes to a day) and delete them. The list itself is read with
// metaTemplates() in src/lib/whatsapp.ts.

const MEDIA_TYPES: Record<string, { format: "IMAGE" | "VIDEO" | "DOCUMENT"; max: number }> = {
  "image/jpeg": { format: "IMAGE", max: 5 * 1024 * 1024 },
  "image/png": { format: "IMAGE", max: 5 * 1024 * 1024 },
  "video/mp4": { format: "VIDEO", max: 8 * 1024 * 1024 },
  "application/pdf": { format: "DOCUMENT", max: 8 * 1024 * 1024 },
};

async function conn() {
  const c = await whatsappConnection();
  if (!c) throw new Error("WhatsApp isn't set up yet. Add WHATSAPP_TOKEN and the Phone number ID in Settings first.");
  if (!c.wabaId) throw new Error("Set WHATSAPP_WABA_ID in Settings → Environment variables (the WhatsApp Business Account ID).");
  return c;
}

function metaError(json: { error?: { error_user_title?: string; error_user_msg?: string; message?: string } }, status: number) {
  const e = json?.error;
  const text = [e?.error_user_title, e?.error_user_msg].filter(Boolean).join(": ") || e?.message || `HTTP ${status}`;
  return `Meta: ${text}`;
}

/** Cleans what the browser sent into a TemplateDraft (never trust the client's shape). */
function cleanDraft(raw: unknown): TemplateDraft {
  const v = (raw ?? {}) as Record<string, unknown>;
  const str = (x: unknown, max = 2000) => String(x ?? "").slice(0, max);
  const category = (["MARKETING", "UTILITY", "AUTHENTICATION"] as const).find((c) => c === v.category) ?? "MARKETING";
  const h = (v.header ?? {}) as Record<string, unknown>;
  const header: TemplateDraft["header"] =
    h.format === "TEXT"
      ? { format: "TEXT", text: str(h.text, 200), example: str(h.example, 200) }
      : h.format === "IMAGE" || h.format === "VIDEO" || h.format === "DOCUMENT"
        ? { format: h.format, handle: str(h.handle, 4000) }
        : { format: "NONE" };
  const buttons: TemplateButton[] = (Array.isArray(v.buttons) ? v.buttons : []).slice(0, 12).flatMap((b): TemplateButton[] => {
    const x = (b ?? {}) as Record<string, unknown>;
    if (x.type === "QUICK_REPLY") return [{ type: "QUICK_REPLY", text: str(x.text, 60) }];
    if (x.type === "URL") return [{ type: "URL", text: str(x.text, 60), url: str(x.url).trim() }];
    if (x.type === "PHONE_NUMBER") return [{ type: "PHONE_NUMBER", text: str(x.text, 60), phone: str(x.phone, 30) }];
    return [];
  });
  const a = (v.auth ?? {}) as Record<string, unknown>;
  return {
    name: str(v.name, 600).trim(),
    language: str(v.language, 10),
    category,
    header,
    body: str(v.body, 1100),
    bodyExamples: (Array.isArray(v.bodyExamples) ? v.bodyExamples : []).slice(0, 60).map((s) => str(s, 500)),
    footer: str(v.footer, 100),
    buttons,
    auth:
      category === "AUTHENTICATION"
        ? {
            securityRecommendation: a.securityRecommendation !== false,
            expiryMinutes: Number(a.expiryMinutes) > 0 ? Math.floor(Number(a.expiryMinutes)) : null,
            buttonText: str(a.buttonText, 60),
          }
        : undefined,
  };
}

/** Submits a new template to Meta for review. */
export async function createTemplate(raw: unknown): Promise<ActionState & { status?: string }> {
  const admin = await requireAdmin();
  const draft = cleanDraft(raw);
  const problems = templateProblems(draft);
  if (problems.length) return { ok: false, error: problems[0] };
  try {
    const c = await conn();
    const res = await fetch(`https://graph.facebook.com/${await graphVersion()}/${c.wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft.name, language: draft.language, category: draft.category, components: toMetaComponents(draft) }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: metaError(json, res.status) };
    await logActivity({
      entityType: "settings",
      entityId: SETTINGS_ENTITY_ID,
      action: "template_created",
      actorType: "admin",
      actorId: admin.userId,
      diff: { name: draft.name, language: draft.language, category: json.category ?? draft.category },
    });
    revalidatePath("/admin/templates");
    const status = String(json.status ?? "PENDING");
    const changed = json.category && json.category !== draft.category ? ` Meta filed it as ${String(json.category).toLowerCase()}.` : "";
    return {
      ok: true,
      status,
      message:
        status === "APPROVED"
          ? `${draft.name} is approved and ready to use.${changed}`
          : `${draft.name} was sent to Meta for review. It usually takes a few minutes, at most 24 hours.${changed}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't reach Meta." };
  }
}

/** Deletes one language of a template (with its id) or every language (name only). */
export async function deleteTemplate(name: string, id?: string): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!/^[a-z0-9_]{1,512}$/.test(String(name ?? ""))) return { ok: false, error: "Invalid template name." };
  if (id && !/^\d{1,40}$/.test(id)) return { ok: false, error: "Invalid template id." };
  try {
    const c = await conn();
    const q = new URLSearchParams({ name, ...(id ? { hsm_id: id } : {}) });
    const res = await fetch(`https://graph.facebook.com/${await graphVersion()}/${c.wabaId}/message_templates?${q}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${c.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: metaError(json, res.status) };
    await logActivity({ entityType: "settings", entityId: SETTINGS_ENTITY_ID, action: "template_deleted", actorType: "admin", actorId: admin.userId, diff: { name } });
    revalidatePath("/admin/templates");
    return { ok: true, message: `Deleted ${name}. Meta keeps the name blocked for 30 days, so use a new name if you recreate it.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't reach Meta." };
  }
}

/**
 * Uploads a sample header file with Meta's Resumable Upload API and returns the handle
 * the template needs. Meta only uses it for review; the real file is chosen per broadcast.
 * Needs META_APP_ID (Settings → Environment variables).
 */
export async function uploadTemplateSample(form: FormData): Promise<{ ok: true; handle: string; format: string } | { ok: false; error: string }> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a file." };
  const kind = MEDIA_TYPES[file.type];
  if (!kind) return { ok: false, error: "Use a JPG or PNG image, an MP4 video, or a PDF." };
  if (file.size > kind.max) return { ok: false, error: `That file is too big. The limit is ${kind.max / 1024 / 1024} MB.` };
  const appId = ((await env("META_APP_ID")) ?? "").trim();
  if (!/^\d+$/.test(appId)) return { ok: false, error: "Set META_APP_ID in Settings → Environment variables first (App settings → Basic in Meta)." };
  try {
    const c = await conn();
    const v = await graphVersion();
    const q = new URLSearchParams({ file_name: file.name.slice(0, 200) || "sample", file_length: String(file.size), file_type: file.type });
    const start = await fetch(`https://graph.facebook.com/${v}/${appId}/uploads?${q}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const session = await start.json().catch(() => ({}));
    if (!start.ok || !session.id) return { ok: false, error: metaError(session, start.status) };
    const up = await fetch(`https://graph.facebook.com/${v}/${session.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${c.token}`, file_offset: "0" },
      body: Buffer.from(await file.arrayBuffer()),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const done = await up.json().catch(() => ({}));
    if (!up.ok || !done.h) return { ok: false, error: metaError(done, up.status) };
    return { ok: true, handle: String(done.h), format: kind.format };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
