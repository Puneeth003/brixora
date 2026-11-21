import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { optIn, optOut, recordBroadcastReply, recordBroadcastStatus } from "@/lib/broadcast";
import { normalizePhone } from "@/lib/whatsapp";
import { connection } from "next/server";

// Meta WhatsApp webhook: delivery status updates (website messages and broadcasts),
// replies to broadcasts, and inbound STOP / START replies.
// Configure in Meta App → WhatsApp → Configuration:
//   Callback URL  https://<your domain>/api/whatsapp/webhook
//   Verify token  WHATSAPP_VERIFY_TOKEN
// POSTs are verified with the app secret signature (WHATSAPP_APP_SECRET).

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };
const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "STOP PROMOTIONS"];
const START_WORDS = ["START", "SUBSCRIBE"];

type StatusEvent = { id: string; status: string; errors?: { title?: string; message?: string }[] };
type InboundMessage = { from: string; type: string; text?: { body: string }; button?: { text: string } };

async function validSignature(body: string, header: string | null) {
  const secret = await env("WHATSAPP_APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return safeEqual(expected, header.slice("sha256=".length));
}

export async function GET(request: Request) {
  // Always per request: never prerendered at build time (cacheComponents). Without this the
  // build could stop here when an earlier await finished after the prerender window.
  await connection();
  const url = new URL(request.url);
  const token = await env("WHATSAPP_VERIFY_TOKEN");
  const ok =
    Boolean(token) &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === token;
  return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!(await validSignature(body, request.headers.get("x-hub-signature-256")))) {
    // Remembered for Settings → WhatsApp → Check connection: Meta reached us, but the
    // signature didn't match (wrong or missing WHATSAPP_APP_SECRET).
    const reason = (await env("WHATSAPP_APP_SECRET")) ? "signature" : "no_secret";
    await db
      .run("INSERT INTO app_config (name, value) VALUES ('webhook_last_rejected', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [`${Date.now()}:${reason}`])
      .catch(() => {});
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { entry?: { changes?: { value?: { statuses?: StatusEvent[]; messages?: InboundMessage[] } }[] }[] };
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // For Settings → WhatsApp → Check connection ("last event from Meta").
  await db
    .run("INSERT INTO app_config (name, value) VALUES ('webhook_last_at', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [String(Date.now())])
    .catch(() => {});

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      for (const s of value.statuses ?? []) {
        const error = s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null;
        if (await recordBroadcastStatus(s.id, s.status, error)) continue;
        const msg = await db.one<{ id: string; status: string }>("SELECT id, status FROM messages WHERE wa_message_id = ? LIMIT 1", [s.id]);
        if (!msg) continue;
        if (s.status === "failed") {
          if ((RANK[msg.status] ?? 0) < RANK.delivered) {
            await db.update("messages", { status: "failed", error: error ?? "failed" }, "id = ?", [msg.id]);
          }
        } else if (s.status in RANK && RANK[s.status] > (RANK[msg.status] ?? -1)) {
          await db.update("messages", { status: s.status, error: null }, "id = ?", [msg.id]);
        }
      }

      for (const m of value.messages ?? []) {
        const text = (m.text?.body ?? m.button?.text ?? "").trim().toUpperCase();
        const phone = normalizePhone(m.from);
        await recordBroadcastReply(phone);
        if (STOP_WORDS.includes(text)) {
          await db.update("users", { wa_opt_out: true }, "phone = ?", [phone]);
          await optOut(phone, "reply");
        } else if (START_WORDS.includes(text)) {
          await db.update("users", { wa_opt_out: false }, "phone = ?", [phone]);
          await optIn(phone);
        }
      }
    }
  }

  // Always 200 so Meta does not retry events we have already processed.
  return Response.json({ ok: true });
}
