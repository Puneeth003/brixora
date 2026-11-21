import { safeEqual } from "@/lib/crypto";
import { processBroadcasts } from "@/lib/broadcast";
import { env } from "@/lib/env";
import { connection } from "next/server";

// Sends scheduled WhatsApp broadcasts and continues long ones. Call every minute from a
// Hostinger cron job (or any scheduler):
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your domain>/api/cron/broadcasts
// "Send now" starts sending straight away; this only matters for scheduled broadcasts
// and as a safety net if the server restarted mid-broadcast.

export async function GET(request: Request) {
  // Always per request: never prerendered at build time (cacheComponents). Without this the
  // build could stop here when an earlier await finished after the prerender window.
  await connection();
  const secret = await env("CRON_SECRET");
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const processed = await processBroadcasts();
  return Response.json({ ok: true, processed });
}
