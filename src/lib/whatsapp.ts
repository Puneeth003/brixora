import "server-only";
import { decrypt } from "./crypto";
import { db, uuid } from "./db";

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
  | "staff_invite"; // [name, set-password link]

type TemplateName = NotifyTemplate | "otp_login";

// Templates that still go to owners who replied STOP.
const ESSENTIAL: TemplateName[] = ["otp_login", "listing_rejected", "change_rejected", "enquiry_forward", "staff_invite"];
const AUTH_TEMPLATES: TemplateName[] = ["otp_login"];

type Result = { ok: boolean; status?: string; error?: string; suppressed?: boolean };
type SendResult = { ok: true; waMessageId: string } | { ok: false; error: string };

/** Meta wants digits only, with country code (e.g. 919876543210). */
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function brokeragePhone() {
  return (process.env.BROKERAGE_ENQUIRY_WHATSAPP || process.env.NEXT_PUBLIC_BROKERAGE_WHATSAPP || "").replace(/\D/g, "");
}

export const graphVersion = () => process.env.WHATSAPP_API_VERSION || "v26.0";

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
 * WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID, or null for each one that is empty or
 * still a placeholder (e.g. "<LATER: from Meta>"). Meta tokens have no spaces or angle
 * brackets and phone number IDs are all digits.
 */
function envCredentials() {
  const token = (process.env.WHATSAPP_TOKEN ?? "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  return {
    token: /^[^\s<>]+$/.test(token) ? token : null,
    phoneNumberId: /^\d+$/.test(phoneNumberId) ? phoneNumberId : null,
  };
}

/** Names of the WhatsApp env variables that are set but can't be real values. */
export function whatsappEnvProblems() {
  const valid = envCredentials();
  const bad: string[] = [];
  if (process.env.WHATSAPP_TOKEN?.trim() && !valid.token) bad.push("WHATSAPP_TOKEN");
  if (process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && !valid.phoneNumberId) bad.push("WHATSAPP_PHONE_NUMBER_ID");
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
  const { token, phoneNumberId: envPhoneId } = envCredentials();
  if (!token || !envPhoneId) return null;
  return { token, phoneNumberId: envPhoneId, wabaId: null, displayPhone: null, verifiedName: null, connectedAt: null, source: "env" };
}

async function sendTemplate(to: string, template: string, params: string[]): Promise<SendResult> {
  const conn = await whatsappConnection();

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

  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "en";
  // With coexistence the API number is the brokerage's own WhatsApp; it can't message itself.
  if (conn.displayPhone && normalizePhone(conn.displayPhone) === to) {
    return { ok: false, error: "Recipient is the connected WhatsApp number itself. Set BROKERAGE_ENQUIRY_WHATSAPP to another number." };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${conn.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: template, language: { code: lang }, components },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, waMessageId: json.messages?.[0]?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

/** OTP sends to this number in the last hour (for rate limiting). */
export function recentOtpCount(phone: string) {
  return db.count(
    "SELECT COUNT(*) FROM messages WHERE recipient_phone = ? AND template_name = 'otp_login' AND created_at > ?",
    [normalizePhone(phone), new Date(Date.now() - 3_600_000)],
  );
}
