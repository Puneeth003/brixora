import "server-only";
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
  | "site_visit_scheduled"; // [ref, date & time]

type TemplateName = NotifyTemplate | "otp_login";

// Templates that still go to owners who replied STOP.
const ESSENTIAL: TemplateName[] = ["otp_login", "listing_rejected", "change_rejected", "enquiry_forward"];
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

async function sendTemplate(to: string, template: string, params: string[]): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
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

  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";
  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "en";

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
