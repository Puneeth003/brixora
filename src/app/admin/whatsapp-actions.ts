"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { graphVersion, whatsappConnection } from "@/lib/whatsapp";
import type { ActionState } from "@/lib/types";

// Connects the brokerage's existing WhatsApp Business app number to the Cloud API
// (coexistence). The browser runs Meta's Embedded Signup (WhatsAppConnect.tsx) and hands
// over the one-time code plus the WABA and phone number IDs; everything else happens here.

const ID = /^\d{5,30}$/;
const graph = (path: string) => `https://graph.facebook.com/${graphVersion()}/${path}`;

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

/** Contacts and chat history from the phone app. Meta only accepts these within 24 h of onboarding. */
async function requestSync(token: string, phoneNumberId: string) {
  const errors: string[] = [];
  for (const sync_type of ["smb_app_state_sync", "history"]) {
    try {
      await call(graph(`${phoneNumberId}/smb_app_data`), {
        method: "POST",
        token,
        body: JSON.stringify({ messaging_product: "whatsapp", sync_type }),
      });
    } catch (e) {
      errors.push(`${sync_type}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return errors;
}

export async function connectWhatsApp(input: { code: string; wabaId: string; phoneNumberId?: string }): Promise<ActionState> {
  await requireAdmin();
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, error: "META_APP_ID and WHATSAPP_APP_SECRET must be set." };
  const code = String(input.code ?? "");
  if (!code || code.length > 2048 || !ID.test(input.wabaId) || (input.phoneNumberId && !ID.test(input.phoneNumberId))) {
    return { ok: false, error: "Meta didn't return a complete signup. Try again." };
  }

  try {
    // The code is valid for about 30 seconds, so exchange it first.
    const q = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    const { access_token: token } = await call<{ access_token: string }>(graph(`oauth/access_token?${q}`));
    if (!token) return { ok: false, error: "Meta didn't return an access token." };

    // The coexistence finish event doesn't always carry the phone number ID.
    let phoneNumberId = input.phoneNumberId;
    if (!phoneNumberId) {
      const list = await call<{ data?: { id: string }[] }>(graph(`${input.wabaId}/phone_numbers?fields=id`), { token });
      phoneNumberId = list.data?.[0]?.id;
      if (!phoneNumberId) return { ok: false, error: "No phone number found on this WhatsApp Business Account." };
    }

    // Deliver this WABA's webhooks (statuses, inbound, app echoes) to our app. Coexistence
    // numbers are already registered on the phone app, so /register is not called.
    await call(graph(`${input.wabaId}/subscribed_apps`), { method: "POST", token });

    const number = await call<{ display_phone_number?: string; verified_name?: string }>(
      graph(`${phoneNumberId}?fields=display_phone_number,verified_name`),
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

    const syncErrors = await requestSync(token, phoneNumberId);
    revalidatePath("/admin/settings");
    return syncErrors.length
      ? { ok: true, message: `Connected ${number.display_phone_number ?? ""}. Chat sync didn't start (${syncErrors.join("; ")}). Messaging works.` }
      : { ok: true, message: `Connected ${number.display_phone_number ?? ""}. Contacts and chat history are syncing.` };
  } catch (e) {
    return { ok: false, error: `Meta: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Forgets the connected number. Sending falls back to WHATSAPP_TOKEN, if set. The phone app keeps working. */
export async function disconnectWhatsApp(): Promise<ActionState> {
  await requireAdmin();
  const conn = await whatsappConnection();
  if (conn?.source === "connected" && conn.wabaId) {
    // Best effort: stop webhooks for this WABA.
    await call(graph(`${conn.wabaId}/subscribed_apps`), { method: "DELETE", token: conn.token }).catch(() => {});
  }
  await db.run("DELETE FROM app_config WHERE name LIKE 'wa\\_%'");
  revalidatePath("/admin/settings");
  return { ok: true, message: "WhatsApp disconnected." };
}
