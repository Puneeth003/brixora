import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { normalizePhone } from "@/lib/whatsapp";

// Meta WhatsApp webhook: delivery status updates and inbound STOP / START replies.
// Configure in Meta App → WhatsApp → Configuration:
//   Callback URL  https://<your domain>/api/whatsapp/webhook
//   Verify token  WHATSAPP_VERIFY_TOKEN
// POSTs are verified with the app secret signature (WHATSAPP_APP_SECRET).

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };
const STOP_WORDS = ["STOP", "UNSUBSCRIBE"];
const START_WORDS = ["START", "SUBSCRIBE"];

type StatusEvent = { id: string; status: string; errors?: { title?: string; message?: string }[] };
type InboundMessage = { from: string; type: string; text?: { body: string }; button?: { text: string } };

function validSignature(body: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return safeEqual(expected, header.slice("sha256=".length));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  const ok =
    Boolean(token) &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === token;
  return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!validSignature(body, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { entry?: { changes?: { value?: { statuses?: StatusEvent[]; messages?: InboundMessage[] } }[] }[] };
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      for (const s of value.statuses ?? []) {
        const msg = await db.one<{ id: string; status: string }>("SELECT id, status FROM messages WHERE wa_message_id = ? LIMIT 1", [s.id]);
        if (!msg) continue;
        if (s.status === "failed") {
          if ((RANK[msg.status] ?? 0) < RANK.delivered) {
            const error = s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? "failed";
            await db.update("messages", { status: "failed", error }, "id = ?", [msg.id]);
          }
        } else if (s.status in RANK && RANK[s.status] > (RANK[msg.status] ?? -1)) {
          await db.update("messages", { status: s.status, error: null }, "id = ?", [msg.id]);
        }
      }

      for (const m of value.messages ?? []) {
        const text = (m.text?.body ?? m.button?.text ?? "").trim().toUpperCase();
        const phone = normalizePhone(m.from);
        if (STOP_WORDS.includes(text)) await db.update("users", { wa_opt_out: true }, "phone = ?", [phone]);
        else if (START_WORDS.includes(text)) await db.update("users", { wa_opt_out: false }, "phone = ?", [phone]);
      }
    }
  }

  // Always 200 so Meta does not retry events we have already processed.
  return Response.json({ ok: true });
}
