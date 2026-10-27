import { revalidateTag } from "next/cache";
import { db, transaction, uuid } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";

// Daily housekeeping, called by a Hostinger cron job (or any external scheduler):
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your domain>/api/cron/expire-listings
// Expires approved listings past expires_at and clears dead sessions / login codes.
// Public pages already hide expired listings via the public_properties view, so a
// missed run is harmless.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });

  const expired = await transaction(async (tx) => {
    const rows = await tx.all<{ id: string }>(
      "SELECT id FROM properties WHERE status = 'approved' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP(3) FOR UPDATE",
    );
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    await tx.run("UPDATE properties SET status = 'expired' WHERE id IN (?)", [ids]);
    for (const id of ids) {
      await tx.insert("activity_log", { id: uuid(), entity_type: "property", entity_id: id, action: "expired", actor_type: "system" });
    }
    return ids.length;
  });

  const day = new Date(Date.now() - 86_400_000);
  await db.run("DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(3)");
  await db.run("DELETE FROM otp_codes WHERE created_at < ?", [day]);
  await db.run("DELETE FROM auth_attempts WHERE created_at < ?", [new Date(Date.now() - 30 * 86_400_000)]);

  if (expired) revalidateTag("listings", "max");
  return Response.json({ ok: true, expired });
}
