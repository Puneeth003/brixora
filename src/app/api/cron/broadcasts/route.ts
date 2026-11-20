import { safeEqual } from "@/lib/crypto";
import { processBroadcasts } from "@/lib/broadcast";
import { env } from "@/lib/env";

// Sends scheduled WhatsApp broadcasts and continues long ones. Call every minute from a
// Hostinger cron job (or any scheduler):
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your domain>/api/cron/broadcasts
// "Send now" starts sending straight away; this only matters for scheduled broadcasts
// and as a safety net if the server restarted mid-broadcast.

export async function GET(request: Request) {
  const secret = await env("CRON_SECRET");
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const processed = await processBroadcasts();
  return Response.json({ ok: true, processed });
}
