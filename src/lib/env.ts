import "server-only";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";

// Environment variables an admin can set in Settings → Environment variables, without
// touching the hosting panel. Stored encrypted in app_config as "env:<NAME>" and read
// before process.env, so a value saved here wins over the server's.
//
// Server-only (hosting panel), never here: the database, AUTH_SECRET (the encryption key
// itself), UPLOAD_DIR and NEXT_PUBLIC_SITE_URL, because the site can't start without them;
// and mail (SERVER_ENV below), by choice. Each variable lives in one place only: the
// editor flags any that is set both here and on the server.

export const SETTABLE_ENV = [
  { name: "META_APP_ID", group: "WhatsApp", secret: false, hint: "Meta app ID (App settings → Basic)" },
  { name: "WHATSAPP_ES_CONFIG_ID", group: "WhatsApp", secret: false, hint: "Embedded Signup configuration ID" },
  { name: "WHATSAPP_APP_SECRET", group: "WhatsApp", secret: true, hint: "App settings → Basic → App secret" },
  { name: "WHATSAPP_VERIFY_TOKEN", group: "WhatsApp", secret: true, hint: "Word you made up for the webhook" },
  { name: "WHATSAPP_TOKEN", group: "WhatsApp", secret: true, hint: "System-user token (if not using Connect)" },
  { name: "WHATSAPP_PHONE_NUMBER_ID", group: "WhatsApp", secret: false, hint: "Sending number's Phone number ID" },
  { name: "WHATSAPP_WABA_ID", group: "WhatsApp", secret: false, hint: "WhatsApp Business Account ID (shows template status)" },
  { name: "WHATSAPP_TEMPLATE_LANG", group: "WhatsApp", secret: false, hint: "Template language, e.g. en or en_US" },
  { name: "WHATSAPP_API_VERSION", group: "WhatsApp", secret: false, hint: "Graph API version, e.g. v26.0" },
  { name: "BROKERAGE_ENQUIRY_WHATSAPP", group: "WhatsApp", secret: false, hint: "Team number for enquiry alerts, e.g. 919876543210" },
  { name: "CRON_SECRET", group: "Security", secret: true, hint: "Bearer token for the daily expire-listings job" },
] as const;

export type SettableEnvName = (typeof SETTABLE_ENV)[number]["name"];

/** Set in the hosting panel only (read straight from process.env). */
export const SERVER_ENV = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "MAIL_FROM_NAME"] as const;

export const isSettableEnv = (name: string): name is SettableEnvName => SETTABLE_ENV.some((v) => v.name === name);

const PREFIX = "env:";
const TTL = 15_000;
const cache = globalThis as unknown as { __brixoraEnv?: { at: number; values: Map<string, string> } };

/** Values saved in Settings (decrypted), cached briefly so each request doesn't hit the database. */
async function saved() {
  if (cache.__brixoraEnv && Date.now() - cache.__brixoraEnv.at < TTL) return cache.__brixoraEnv.values;
  const values = new Map<string, string>();
  try {
    const rows = await db.all<{ name: string; value: string }>("SELECT name, value FROM app_config WHERE name LIKE 'env:%'");
    for (const r of rows) {
      try {
        values.set(r.name.slice(PREFIX.length), decrypt(r.value));
      } catch {
        console.error(`[env] ${r.name} can't be decrypted (AUTH_SECRET changed?)`);
      }
    }
  } catch (e) {
    // Database down: fall back to the server's variables rather than failing the request.
    console.error("[env] couldn't read saved variables", e);
  }
  cache.__brixoraEnv = { at: Date.now(), values };
  return values;
}

/** The variable saved in Settings, else the server's, else undefined. */
export async function env(name: SettableEnvName): Promise<string | undefined> {
  const value = (await saved()).get(name);
  return value !== undefined && value !== "" ? value : process.env[name];
}

/** Several variables at once, as an object. */
export async function envs<N extends SettableEnvName>(...names: N[]): Promise<Record<N, string | undefined>> {
  await saved();
  const out = {} as Record<N, string | undefined>;
  for (const n of names) out[n] = await env(n);
  return out;
}

/** Edited in Settings → Organization → Website details instead, so not listed on the Environment variables page. */
export const IN_WEBSITE_DETAILS: SettableEnvName[] = ["BROKERAGE_ENQUIRY_WHATSAPP", "WHATSAPP_PHONE_NUMBER_ID"];

/** For the settings page: which variables are saved here, and which come from the server. Secrets are never returned. */
export async function envOverview() {
  const values = await saved();
  return SETTABLE_ENV.filter((v) => !IN_WEBSITE_DETAILS.includes(v.name)).map((v) => ({
    ...v,
    saved: values.has(v.name),
    value: v.secret ? "" : (values.get(v.name) ?? ""),
    onServer: Boolean(process.env[v.name]?.trim()),
  }));
}

/** Writes (or with null, deletes) saved variables. */
export async function writeEnv(changes: [SettableEnvName, string | null][]) {
  for (const [name, value] of changes) {
    if (value === null) await db.run("DELETE FROM app_config WHERE name = ?", [PREFIX + name]);
    else {
      await db.run("INSERT INTO app_config (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [PREFIX + name, encrypt(value)]);
    }
  }
  // Drop values saved for variables that no longer belong here (e.g. mail, now
  // server-only), so no second, stale copy (or password) stays in the database.
  await db.run("DELETE FROM app_config WHERE name LIKE 'env:%' AND name NOT IN (?)", [SETTABLE_ENV.map((v) => PREFIX + v.name)]);
  cache.__brixoraEnv = undefined;
}
