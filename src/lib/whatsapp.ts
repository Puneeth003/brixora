import "server-only";
import { decrypt } from "./crypto";
import { db, uuid } from "./db";
import { env } from "./env";
import { getSite } from "./site-settings";

// WhatsApp Cloud API (Meta) template sender. See SPEC.md §10, §12.
// If a BSP (Interakt / WATI / AiSensy) is chosen instead, replace sendTemplate() only.
// Every message is logged to `messages` before sending. notify() never throws: a failed
// notification must not fail the admin/owner action that caused it.

export type NotifyTemplate =
  | "submission_received" // [name, ref]
  | "listing_approved" // [ref, link]
  | "listing_rejected" // [ref, reason]
  | "change_received" // [ref, change type]
  | "change_approved" // [ref, change type]
  | "change_rejected" // [ref, change type, reason]
  | "sold_confirmed" // [ref]
  | "enquiry_forward" // [ref, name, phone, message, link]
  | "enquiry_reply" // [name, ref, link]
  | "site_visit_scheduled" // [ref, date & time]
  | "staff_invite" // [name, set-password link]
  | "welcome"; // [] first message to a new customer, sent just before their first login code

export type TemplateName = NotifyTemplate | "otp_login";

/** Every template the website sends, with its variables and the samples Meta asks for. */
export const TEMPLATES: { key: TemplateName; category: "Authentication" | "Utility" | "Marketing"; purpose: string; params: string[]; sample: string[] }[] = [
  { key: "otp_login", category: "Authentication", purpose: "Login code", params: ["code"], sample: ["482913"] },
  { key: "welcome", category: "Marketing", purpose: "Welcome to a new customer (before their first login code)", params: [], sample: [] },
  { key: "submission_received", category: "Utility", purpose: "Owner posted a property", params: ["name", "ref"], sample: ["Ravi", "BRX-2026-0042"] },
  { key: "listing_approved", category: "Utility", purpose: "Listing is live", params: ["ref", "link"], sample: ["BRX-2026-0042", "https://brixora.in/properties/BRX-2026-0042"] },
  { key: "listing_rejected", category: "Utility", purpose: "Listing declined", params: ["ref", "reason"], sample: ["BRX-2026-0042", "Photos are not clear"] },
  { key: "change_received", category: "Utility", purpose: "Owner asked for a change", params: ["ref", "change"], sample: ["BRX-2026-0042", "Price change"] },
  { key: "change_approved", category: "Utility", purpose: "Change approved", params: ["ref", "change"], sample: ["BRX-2026-0042", "Price change"] },
  { key: "change_rejected", category: "Utility", purpose: "Change declined", params: ["ref", "change", "reason"], sample: ["BRX-2026-0042", "Price change", "Price is outside the market range"] },
  { key: "sold_confirmed", category: "Utility", purpose: "Marked as sold", params: ["ref"], sample: ["BRX-2026-0042"] },
  { key: "enquiry_forward", category: "Utility", purpose: "New enquiry to the team", params: ["ref", "name", "phone", "message", "link"], sample: ["BRX-2026-0042", "Anita", "+91 98450 12345", "Is this still available?", "https://brixora.in/properties/BRX-2026-0042"] },
  { key: "enquiry_reply", category: "Utility", purpose: "Team replied to an enquiry", params: ["name", "ref", "link"], sample: ["Anita", "BRX-2026-0042", "https://brixora.in/account/enquiries"] },
  { key: "site_visit_scheduled", category: "Utility", purpose: "Site visit booked", params: ["ref", "date & time"], sample: ["BRX-2026-0042", "12 Nov 2026, 11:00 AM"] },
  { key: "staff_invite", category: "Utility", purpose: "New staff member invited", params: ["name", "link"], sample: ["Priya", "https://brixora.in/admin/forgot-password"] },
];

export type TemplateSetting = { name: string; lang: string; enabled: boolean; added: boolean };

/**
 * Settings → WhatsApp templates: which Meta template (name + language) each website
 * message uses. Stored in app_config as "tpl:<key>" (JSON). A message is only sent once
 * a template has been added for it, except the login code, which falls back to
 * "otp_login" so sign-in never breaks.
 */
export async function templateSettings(): Promise<Record<TemplateName, TemplateSetting>> {
  const rows = await db.all<{ name: string; value: string }>("SELECT name, value FROM app_config WHERE name LIKE 'tpl:%'");
  const lang = (await env("WHATSAPP_TEMPLATE_LANG")) || "en";
  const out = {} as Record<TemplateName, TemplateSetting>;
  for (const t of TEMPLATES) {
    const row = rows.find((r) => r.name === `tpl:${t.key}`);
    let saved: Partial<TemplateSetting> = {};
    try {
      saved = JSON.parse(row?.value ?? "{}");
    } catch {}
    out[t.key] = {
      name: saved.name || t.key,
      lang: saved.lang || lang,
      added: Boolean(row),
      enabled: t.key === "otp_login" || Boolean(row),
    };
  }
  return out;
}

// Templates that still go to owners who replied STOP.
const ESSENTIAL: TemplateName[] = ["otp_login", "listing_rejected", "change_rejected", "enquiry_forward", "staff_invite"];
const AUTH_TEMPLATES: TemplateName[] = ["otp_login"];

type Result = { ok: boolean; status?: string; error?: string; suppressed?: boolean };
export type SendResult = { ok: true; waMessageId: string } | { ok: false; error: string };

/** Meta wants digits only, with country code (e.g. 919876543210). */
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export async function brokeragePhone() {
  return ((await env("BROKERAGE_ENQUIRY_WHATSAPP")) || (await getSite()).brokerage.whatsapp || "").replace(/\D/g, "");
}

export const graphVersion = async () => (await env("WHATSAPP_API_VERSION")) || "v26.0";

export type WhatsAppConnection = {
  token: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  verifiedName: string | null;
  connectedAt: string | null;
  source: "connected" | "env";
};

/**
 * WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID (Settings → Environment variables, else the server), or null for each one that is empty or
 * still a placeholder (e.g. "<LATER: from Meta>"). Meta tokens have no spaces or angle
 * brackets and phone number IDs are all digits.
 */
async function envCredentials() {
  const token = ((await env("WHATSAPP_TOKEN")) ?? "").trim();
  const phoneNumberId = ((await env("WHATSAPP_PHONE_NUMBER_ID")) ?? "").trim();
  return {
    raw: { token, phoneNumberId },
    token: /^[^\s<>]+$/.test(token) ? token : null,
    phoneNumberId: /^\d+$/.test(phoneNumberId) ? phoneNumberId : null,
  };
}

/** Names of the WhatsApp env variables that are set but can't be real values. */
export async function whatsappEnvProblems() {
  const valid = await envCredentials();
  const bad: string[] = [];
  if (valid.raw.token && !valid.token) bad.push("WHATSAPP_TOKEN");
  if (valid.raw.phoneNumberId && !valid.phoneNumberId) bad.push("WHATSAPP_PHONE_NUMBER_ID");
  return bad;
}

/**
 * The number messages go out from: the one connected in Settings → WhatsApp (Embedded
 * Signup, coexistence with the WhatsApp Business app) if any, else WHATSAPP_TOKEN /
 * WHATSAPP_PHONE_NUMBER_ID.
 */
export async function whatsappConnection(): Promise<WhatsAppConnection | null> {
  const rows = await db.all<{ name: string; value: string }>("SELECT name, value FROM app_config WHERE name LIKE 'wa\\_%'");
  const get = (name: string) => rows.find((r) => r.name === name)?.value || null;
  const sealed = get("wa_token");
  const phoneNumberId = get("wa_phone_number_id");
  if (sealed && phoneNumberId) {
    try {
      return {
        token: decrypt(sealed),
        phoneNumberId,
        wabaId: get("wa_waba_id"),
        displayPhone: get("wa_display_phone"),
        verifiedName: get("wa_verified_name"),
        connectedAt: get("wa_connected_at"),
        source: "connected",
      };
    } catch (e) {
      // AUTH_SECRET changed: the stored token can't be read. Fall back to env.
      console.error("[whatsapp] stored token can't be decrypted", e);
    }
  }
  const { token, phoneNumberId: envPhoneId } = await envCredentials();
  if (!token || !envPhoneId) return null;
  const wabaId = ((await env("WHATSAPP_WABA_ID")) ?? "").trim();
  return { token, phoneNumberId: envPhoneId, wabaId: /^\d+$/.test(wabaId) ? wabaId : null, displayPhone: null, verifiedName: null, connectedAt: null, source: "env" };
}

async function sendTemplate(to: string, template: string, params: string[]): Promise<SendResult> {
  const conn = await whatsappConnection();
  const setting = (await templateSettings())[template as TemplateName];

  if (!conn) {
    if (process.env.NODE_ENV === "production") return { ok: false, error: "WhatsApp is not configured" };
    // Dev mode: no WhatsApp credentials yet. Log instead of sending.
    console.log(`[whatsapp:dev] to=${to} template=${template} params=${JSON.stringify(params)}`);
    return { ok: true, waMessageId: `dev-${uuid()}` };
  }

  const components: unknown[] = [];
  if (params.length) {
    components.push({ type: "body", parameters: params.map((text) => ({ type: "text", text })) });
  }
  if (AUTH_TEMPLATES.includes(template as TemplateName)) {
    // Authentication templates carry the code again on the copy-code button.
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params[0] }] });
  }

  const lang = setting?.lang || (await env("WHATSAPP_TEMPLATE_LANG")) || "en";
  return postTemplate(conn, to, setting?.name || template, lang, components);
}

/** POSTs one template message. Never throws. */
async function postTemplate(conn: WhatsAppConnection, to: string, name: string, lang: string, components: unknown[]): Promise<SendResult> {
  // With coexistence the API number is the brokerage's own WhatsApp; it can't message itself.
  if (conn.displayPhone && normalizePhone(conn.displayPhone) === to) {
    return { ok: false, error: "Recipient is the connected WhatsApp number itself. Set BROKERAGE_ENQUIRY_WHATSAPP to another number." };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${await graphVersion()}/${conn.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name, language: { code: lang }, components },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error?.error_data?.details ?? json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, waMessageId: json.messages?.[0]?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type HeaderMedia = { type: "image" | "video" | "document"; link: string; filename?: string };

/**
 * Sends any approved Meta template (broadcasts). `body` fills {{1}}…{{n}} in the body,
 * `header` the text header's variable, `media` an image / video / document header.
 * Pass `conn` when sending many, so the connection is read once.
 */
export async function sendTemplateMessage(
  to: string,
  t: { name: string; lang: string; body: string[]; header?: string[]; media?: HeaderMedia | null },
  conn?: WhatsAppConnection | null,
): Promise<SendResult> {
  const c = conn === undefined ? await whatsappConnection() : conn;
  if (!c) {
    if (process.env.NODE_ENV === "production") return { ok: false, error: "WhatsApp is not configured" };
    console.log(`[whatsapp:dev] to=${to} template=${t.name} body=${JSON.stringify(t.body)}`);
    return { ok: true, waMessageId: `dev-${uuid()}` };
  }
  const components: unknown[] = [];
  if (t.media?.link) {
    const media: Record<string, string> = { link: t.media.link };
    if (t.media.type === "document" && t.media.filename) media.filename = t.media.filename;
    components.push({ type: "header", parameters: [{ type: t.media.type, [t.media.type]: media }] });
  } else if (t.header?.length) {
    components.push({ type: "header", parameters: t.header.map((text) => ({ type: "text", text })) });
  }
  if (t.body.length) components.push({ type: "body", parameters: t.body.map((text) => ({ type: "text", text })) });
  return postTemplate(c, normalizePhone(to), t.name, t.lang, components);
}

async function queue(to: string, template: TemplateName, params: string[], enquiryId?: string | null) {
  const id = uuid();
  await db.insert("messages", {
    id,
    recipient_phone: normalizePhone(to),
    template_name: template,
    payload: { params },
    enquiry_id: enquiryId ?? null,
  });
  return id;
}

/**
 * Sends (or re-sends) a logged message. Mirrors the result onto the enquiry when the
 * message is an enquiry forward.
 */
async function deliver(messageId: string): Promise<Result> {
  const msg = await db.one<{ id: string; recipient_phone: string; template_name: string; payload: { params?: string[] }; attempts: number; enquiry_id: string | null }>(
    "SELECT id, recipient_phone, template_name, payload, attempts, enquiry_id FROM messages WHERE id = ?",
    [messageId],
  );
  if (!msg) return { ok: false, error: "Message not found" };

  const params = Array.isArray(msg.payload?.params) ? msg.payload.params : [];
  const result = await sendTemplate(msg.recipient_phone, msg.template_name, params);

  await db.update(
    "messages",
    result.ok
      ? { status: "sent", wa_message_id: result.waMessageId, error: null, attempts: msg.attempts + 1 }
      : { status: "failed", error: result.error, attempts: msg.attempts + 1 },
    "id = ?",
    [msg.id],
  );

  if (msg.enquiry_id) {
    await db.update(
      "enquiries",
      result.ok ? { forwarded: true, forward_error: null } : { forwarded: false, forward_error: result.error },
      "id = ?",
      [msg.enquiry_id],
    );
  }
  return result.ok ? { ok: true, status: "sent" } : { ok: false, status: "failed", error: result.error };
}

export async function notify(to: string | null | undefined, template: NotifyTemplate, params: string[], enquiryId?: string): Promise<Result> {
  if (!to) return { ok: false, error: "No recipient phone" };
  try {
    const phone = normalizePhone(to);
    if (!(await templateSettings())[template]?.enabled) return { ok: true, suppressed: true };
    if (!ESSENTIAL.includes(template)) {
      const user = await db.one<{ wa_opt_out: boolean }>("SELECT wa_opt_out FROM users WHERE phone = ?", [phone]);
      if (user?.wa_opt_out) return { ok: true, suppressed: true };
    }
    return await deliver(await queue(phone, template, params, enquiryId));
  } catch (e) {
    console.error("[whatsapp] notify failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function retryMessage(messageId: string): Promise<Result> {
  try {
    const msg = await db.one<{ template_name: string }>("SELECT template_name FROM messages WHERE id = ?", [messageId]);
    // OTP messages are logged with a masked code and can't be resent.
    if (!msg || msg.template_name === "otp_login") return { ok: false, error: "Can't retry this message" };
    return await deliver(messageId);
  } catch (e) {
    console.error("[whatsapp] retry failed", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sends a login code. The code itself is masked in the log once sent. */
export async function sendOtp(phone: string, code: string) {
  const id = await queue(phone, "otp_login", [code]);
  const result = await deliver(id);
  await db.update("messages", { payload: { params: ["******"] } }, "id = ?", [id]);
  return result.ok;
}

/**
 * A first-time customer's welcome message, sent just before their first login code.
 * Only once per number, only when a "welcome" template has been added in Settings →
 * WhatsApp templates, and never to an existing account. Never throws or blocks the code.
 */
export async function sendWelcomeIfNew(phone: string): Promise<void> {
  try {
    const p = normalizePhone(phone);
    if (!(await templateSettings()).welcome.added) return;
    const known = await db.count(
      `SELECT (SELECT COUNT(*) FROM users WHERE phone = ?) + (SELECT COUNT(*) FROM messages WHERE recipient_phone = ? AND template_name = 'welcome')`,
      [p, p],
    );
    if (known) return;
    await notify(p, "welcome", []);
  } catch (e) {
    console.error("[whatsapp] welcome failed", e);
  }
}

/** OTP sends to this number in the last hour (for rate limiting). */
export function recentOtpCount(phone: string) {
  return db.count(
    "SELECT COUNT(*) FROM messages WHERE recipient_phone = ? AND template_name = 'otp_login' AND created_at > ?",
    [normalizePhone(phone), new Date(Date.now() - 3_600_000)],
  );
}

/** Settings → WhatsApp templates "Send test": the template with its sample values, logged like any message. */
export async function sendTemplateTest(template: TemplateName, phone: string) {
  const t = TEMPLATES.find((x) => x.key === template);
  if (!t) return { ok: false, error: "Unknown template" } as Result;
  const id = await queue(phone, template, t.sample);
  return deliver(id);
}

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  header: string | null;
  /** TEXT, IMAGE, VIDEO, DOCUMENT or LOCATION; null without a header. */
  headerFormat: string | null;
  body: string;
  footer: string | null;
  buttons: string[];
  /** Why Meta rejected it (REJECTED only), e.g. INVALID_FORMAT. */
  rejectedReason: string | null;
  /** GREEN / YELLOW / RED / UNKNOWN */
  quality: string | null;
};

/** The templates as designed in Meta (WhatsApp Manager), or null when the WABA isn't known or Meta can't be reached. */
export async function metaTemplates(): Promise<MetaTemplate[] | null> {
  const conn = await whatsappConnection();
  if (!conn?.wabaId) return null;
  type Component = { type: string; format?: string; text?: string; buttons?: { text?: string }[] };
  try {
    const res = await fetch(
      `https://graph.facebook.com/${await graphVersion()}/${conn.wabaId}/message_templates?fields=id,name,status,language,category,components,rejected_reason,quality_score&limit=200`,
      { headers: { Authorization: `Bearer ${conn.token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { id: string; name: string; status: string; language: string; category: string; components?: Component[]; rejected_reason?: string; quality_score?: { score?: string } }[];
    };
    return (json.data ?? []).map((t) => {
      const part = (type: string) => t.components?.find((c) => c.type === type);
      return {
        id: t.id,
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
        header: part("HEADER")?.format === "TEXT" ? (part("HEADER")?.text ?? null) : null,
        headerFormat: part("HEADER")?.format ?? null,
        body: part("BODY")?.text ?? "",
        footer: part("FOOTER")?.text ?? null,
        buttons: (part("BUTTONS")?.buttons ?? []).map((b) => b.text ?? "").filter(Boolean),
        rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
        quality: t.quality_score?.score ?? null,
      };
    });
  } catch {
    return null;
  }
}
