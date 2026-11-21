"use server";

import { revalidatePath } from "next/cache";
import { logActivity, SETTINGS_ENTITY_ID } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeIndianPhone } from "@/lib/format";
import { graphVersion, sendTemplateTest, templateSettings, TEMPLATES, whatsappConnection, type TemplateName } from "@/lib/whatsapp";
import type { ActionState } from "@/lib/types";

// Connects the brokerage's existing WhatsApp Business app number to the Cloud API
// (coexistence). The browser runs Meta's Embedded Signup (WhatsAppConnect.tsx) and hands
// over the one-time code plus the WABA and phone number IDs; everything else happens here.

const ID = /^\d{5,30}$/;
const graph = async (path: string) => `https://graph.facebook.com/${await graphVersion()}/${path}`;

async function call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}`);
  return json as T;
}

const setConfig = (name: string, value: string) =>
  db.run("INSERT INTO app_config (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [name, value]);

export async function connectWhatsApp(input: { code: string; wabaId: string; phoneNumberId?: string }): Promise<ActionState> {
  const admin = await requireAdmin();
  const appId = await env("META_APP_ID");
  const appSecret = await env("WHATSAPP_APP_SECRET");
  if (!appId || !appSecret) return { ok: false, error: "META_APP_ID and WHATSAPP_APP_SECRET must be set." };
  const code = String(input.code ?? "");
  if (!code || code.length > 2048 || !ID.test(input.wabaId) || (input.phoneNumberId && !ID.test(input.phoneNumberId))) {
    return { ok: false, error: "Meta didn't return a complete signup. Try again." };
  }

  try {
    // The code is valid for about 30 seconds, so exchange it first.
    const q = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    const { access_token: token } = await call<{ access_token: string }>(await graph(`oauth/access_token?${q}`));
    if (!token) return { ok: false, error: "Meta didn't return an access token." };

    // The coexistence finish event doesn't always carry the phone number ID.
    let phoneNumberId = input.phoneNumberId;
    if (!phoneNumberId) {
      const list = await call<{ data?: { id: string }[] }>(await graph(`${input.wabaId}/phone_numbers?fields=id`), { token });
      phoneNumberId = list.data?.[0]?.id;
      if (!phoneNumberId) return { ok: false, error: "No phone number found on this WhatsApp Business Account." };
    }

    // Deliver this WABA's webhooks (statuses, inbound, app echoes) to our app. Coexistence
    // numbers are already registered on the phone app, so /register is not called.
    await call(await graph(`${input.wabaId}/subscribed_apps`), { method: "POST", token });

    const number = await call<{ display_phone_number?: string; verified_name?: string }>(
      await graph(`${phoneNumberId}?fields=display_phone_number,verified_name`),
      { token },
    );

    const values: [string, string][] = [
      ["wa_token", encrypt(token)],
      ["wa_waba_id", input.wabaId],
      ["wa_phone_number_id", phoneNumberId],
      ["wa_display_phone", number.display_phone_number ?? ""],
      ["wa_verified_name", number.verified_name ?? ""],
      ["wa_connected_at", new Date().toISOString()],
    ];
    for (const [name, value] of values) await setConfig(name, value);
    await logActivity({
      entityType: "settings",
      entityId: SETTINGS_ENTITY_ID,
      action: "whatsapp_connected",
      actorType: "admin",
      actorId: admin.userId,
      diff: { number: number.display_phone_number ?? null },
    });

    revalidatePath("/admin/settings");
    return { ok: true, message: `Connected ${number.display_phone_number ?? ""}. Existing contacts and chat history were not synced.` };
  } catch (e) {
    return { ok: false, error: `Meta: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Forgets the connected number. Sending falls back to WHATSAPP_TOKEN, if set. The phone app keeps working. */
export async function disconnectWhatsApp(): Promise<ActionState> {
  const admin = await requireAdmin();
  const conn = await whatsappConnection();
  if (conn?.source === "connected" && conn.wabaId) {
    // Best effort: stop webhooks for this WABA.
    await call(await graph(`${conn.wabaId}/subscribed_apps`), { method: "DELETE", token: conn.token }).catch(() => {});
  }
  await db.run("DELETE FROM app_config WHERE name LIKE 'wa\\_%'");
  await logActivity({
    entityType: "settings",
    entityId: SETTINGS_ENTITY_ID,
    action: "whatsapp_disconnected",
    actorType: "admin",
    actorId: admin.userId,
    diff: { number: conn?.displayPhone ?? null },
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: "WhatsApp disconnected." };
}

const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;
const LANG = /^[a-z]{2,3}(_[A-Z]{2})?$/;

/** Settings → WhatsApp templates → Add / Change: use this Meta template for a website message. */
export async function addTemplate(input: { key: string; name: string; lang: string }): Promise<ActionState> {
  const admin = await requireAdmin();
  const t = TEMPLATES.find((x) => x.key === input?.key);
  if (!t) return { ok: false, error: "Choose which website message this template is for." };
  const name = String(input.name ?? "").trim();
  const lang = String(input.lang ?? "").trim();
  if (!TEMPLATE_NAME.test(name)) return { ok: false, error: "The Meta template name may only use lowercase letters, digits and _." };
  if (!LANG.test(lang)) return { ok: false, error: "Language must look like en or en_US." };
  await setConfig(`tpl:${t.key}`, JSON.stringify({ name, lang }));
  await logActivity({ entityType: "settings", entityId: SETTINGS_ENTITY_ID, action: "templates_changed", actorType: "admin", actorId: admin.userId, diff: { [t.key]: `${name} (${lang})` } });
  revalidatePath("/admin/settings");
  return { ok: true, message: `${t.purpose} now uses ${name} (${lang}).` };
}

/** Settings → WhatsApp templates → Remove: the website stops sending this message. */
export async function removeTemplate(key: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) return { ok: false, error: "Unknown template." };
  await db.run("DELETE FROM app_config WHERE name = ?", [`tpl:${t.key}`]);
  await logActivity({ entityType: "settings", entityId: SETTINGS_ENTITY_ID, action: "templates_changed", actorType: "admin", actorId: admin.userId, diff: { [t.key]: "removed" } });
  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: t.key === "otp_login" ? "Removed. Login codes go back to the default otp_login template." : `Removed. The website no longer sends "${t.purpose}".`,
  };
}

/** Sends one template with its sample values to a test number. */
export async function sendTemplateTestAction(template: string, phone: string): Promise<ActionState> {
  await requireAdmin();
  if (!TEMPLATES.some((t) => t.key === template)) return { ok: false, error: "Unknown template." };
  const to = normalizeIndianPhone(phone) ?? (/^\d{10,15}$/.test(phone.replace(/\D/g, "")) ? phone.replace(/\D/g, "") : null);
  if (!to) return { ok: false, error: "Enter a phone number with country code, e.g. 919876543210." };
  const res = await sendTemplateTest(template as TemplateName, to);
  revalidatePath("/admin/messages");
  return res.ok ? { ok: true, message: `Sent ${template} to ${to}. Check that phone, and Admin → Messages for delivery.` } : { ok: false, error: `Not sent: ${res.error}` };
}

// ---------------------------------------------------------------------------
// Settings → WhatsApp → "Check connection"
// ---------------------------------------------------------------------------

export type HealthCheck = {
  key: string;
  label: string;
  state: "ok" | "warn" | "fail";
  detail: string;
  /** A one-click fix the page can offer. */
  fix?: "subscribe";
};

/**
 * Checks every link in the chain with Meta's API: credentials, the number, the business
 * account, the webhook subscription, the templates. Read-only; never sends a message.
 */
export async function checkWhatsApp(): Promise<HealthCheck[]> {
  await requireAdmin();
  const out: HealthCheck[] = [];
  const add = (c: HealthCheck) => out.push(c);
  const conn = await whatsappConnection();
  if (!conn) {
    add({ key: "credentials", label: "Credentials", state: "fail", detail: "WHATSAPP_TOKEN and the Phone number ID aren't set (or still hold placeholder text). Add them in Environment variables and Website details." });
    return out;
  }
  add({ key: "credentials", label: "Credentials", state: "ok", detail: conn.source === "env" ? "Token and Phone number ID found." : "Using the number connected with Meta signup." });

  type Phone = {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    code_verification_status?: string;
    name_status?: string;
    status?: string;
    platform_type?: string;
    messaging_limit_tier?: string;
  };
  try {
    const p = await call<Phone>(
      await graph(`${conn.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,platform_type,messaging_limit_tier`),
      { token: conn.token },
    );
    add({ key: "token", label: "Access token", state: "ok", detail: "Meta accepted the token." });
    const status = (p.status ?? "").toUpperCase();
    add({
      key: "number",
      label: "Phone number",
      state: status === "CONNECTED" ? "ok" : status ? "fail" : "warn",
      detail: `${p.display_phone_number ?? "?"} (${p.verified_name ?? "no name"}): ${status ? status.toLowerCase() : "status unknown"}${p.platform_type ? `, ${p.platform_type.replace(/_/g, " ").toLowerCase()}` : ""}.${
        status && status !== "CONNECTED" ? " Register the number in WhatsApp Manager (set the two-step PIN) so it can send." : ""
      }`,
    });
    add({
      key: "name",
      label: "Display name",
      state: p.name_status === "APPROVED" || p.name_status === "AVAILABLE_WITHOUT_REVIEW" ? "ok" : p.name_status === "DECLINED" ? "fail" : "warn",
      detail: p.name_status ? `Meta review: ${p.name_status.toLowerCase().replace(/_/g, " ")}.` : "Unknown.",
    });
    const q = (p.quality_rating ?? "").toUpperCase();
    add({
      key: "quality",
      label: "Quality and limit",
      state: q === "GREEN" || q === "UNKNOWN" || !q ? "ok" : q === "YELLOW" ? "warn" : "fail",
      detail: `Quality ${q ? q.toLowerCase() : "not rated yet"}${p.messaging_limit_tier ? `; limit ${p.messaging_limit_tier.replace("TIER_", "").replace("_", " ").toLowerCase()} customers a day` : ""}.`,
    });
  } catch (e) {
    add({ key: "token", label: "Access token", state: "fail", detail: `Meta refused: ${e instanceof Error ? e.message : String(e)}. Generate a permanent System User token with whatsapp_business_messaging and whatsapp_business_management.` });
    return out;
  }

  if (!conn.wabaId) {
    add({ key: "waba", label: "Business account", state: "fail", detail: "WHATSAPP_WABA_ID isn't set. Templates, broadcasts and the webhook check need it." });
  } else {
    try {
      const w = await call<{ name?: string; account_review_status?: string }>(await graph(`${conn.wabaId}?fields=name,account_review_status`), { token: conn.token });
      add({
        key: "waba",
        label: "Business account",
        state: !w.account_review_status || w.account_review_status === "APPROVED" ? "ok" : "warn",
        detail: `${w.name ?? conn.wabaId}${w.account_review_status ? `: review ${w.account_review_status.toLowerCase()}` : ""}.`,
      });
      const subs = await call<{ data?: { whatsapp_business_api_data?: { id?: string; name?: string } }[] }>(await graph(`${conn.wabaId}/subscribed_apps`), { token: conn.token });
      const appId = ((await env("META_APP_ID")) ?? "").trim();
      const apps = subs.data ?? [];
      const ours = apps.some((a) => !appId || a.whatsapp_business_api_data?.id === appId);
      add({
        key: "subscribed",
        label: "App subscribed to the account",
        state: apps.length && ours ? "ok" : "fail",
        detail: apps.length && ours ? "Meta sends this account's delivery updates and replies to the app." : "The app isn't subscribed, so no delivery statuses or STOP replies arrive.",
        fix: apps.length && ours ? undefined : "subscribe",
      });
      const t = await call<{ data?: { name: string; status: string; category: string }[] }>(await graph(`${conn.wabaId}/message_templates?fields=name,status,category&limit=200`), { token: conn.token });
      const list = t.data ?? [];
      const settings = await templateSettings();
      const approved = (name: string) => list.some((x) => x.name === name && x.status === "APPROVED");
      add({
        key: "templates",
        label: "Templates",
        state: approved(settings.otp_login.name) ? "ok" : "fail",
        detail: `${list.filter((x) => x.status === "APPROVED").length} approved of ${list.length}. Login code template "${settings.otp_login.name}": ${
          approved(settings.otp_login.name) ? "approved" : "not approved or missing, so sign-in codes can't be sent"
        }. Welcome message: ${settings.welcome.added ? `"${settings.welcome.name}"${approved(settings.welcome.name) ? " approved" : " not approved yet"}` : "not set up"}.`,
      });
    } catch (e) {
      add({ key: "waba", label: "Business account", state: "fail", detail: `Meta refused: ${e instanceof Error ? e.message : String(e)}. Check WHATSAPP_WABA_ID and that the token's system user has this account assigned.` });
    }
  }

  const [secret, verify, appId] = await Promise.all([env("WHATSAPP_APP_SECRET"), env("WHATSAPP_VERIFY_TOKEN"), env("META_APP_ID")]);
  const last = await db.one<{ value: string }>("SELECT value FROM app_config WHERE name = 'webhook_last_at'");
  // Stored as epoch milliseconds (an ISO string would be turned into a DATETIME by db params).
  const lastAt = last && /^\d+$/.test(last.value) ? new Date(Number(last.value)) : null;
  add({
    key: "webhook",
    label: "Webhook",
    state: !secret || !verify ? "fail" : lastAt ? "ok" : "warn",
    detail:
      !secret || !verify
        ? `${[!secret && "WHATSAPP_APP_SECRET", !verify && "WHATSAPP_VERIFY_TOKEN"].filter(Boolean).join(" and ")} not set. Without them Meta's events are refused.`
        : lastAt
          ? `Last event from Meta ${lastAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}.`
          : "No event received yet. In Meta → WhatsApp → Configuration set the callback URL to https://<your domain>/api/whatsapp/webhook, the verify token, and subscribe to messages; then send a test.",
  });
  add({
    key: "app",
    label: "Meta app ID",
    state: appId?.trim() ? "ok" : "warn",
    detail: appId?.trim() ? "Set (needed to upload template header samples)." : "META_APP_ID isn't set: image / video / document template headers can't be uploaded.",
  });
  return out;
}

/** "Fix" for the subscription check: subscribes the app to the WhatsApp Business Account. */
export async function subscribeWhatsAppApp(): Promise<ActionState> {
  await requireAdmin();
  const conn = await whatsappConnection();
  if (!conn?.wabaId) return { ok: false, error: "Set WHATSAPP_WABA_ID first." };
  try {
    await call(await graph(`${conn.wabaId}/subscribed_apps`), { method: "POST", token: conn.token });
    return { ok: true, message: "Subscribed. Delivery updates and replies will now reach the website." };
  } catch (e) {
    return { ok: false, error: `Meta: ${e instanceof Error ? e.message : String(e)}` };
  }
}
