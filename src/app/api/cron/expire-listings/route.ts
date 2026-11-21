import { revalidateTag } from "next/cache";
import { db, transaction, uuid } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { removeStoredImage } from "@/lib/images";
import { removeFile } from "@/lib/storage";
import { connection } from "next/server";

// Daily housekeeping, called by a Hostinger cron job (or any external scheduler):
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your domain>/api/cron/expire-listings
// Expires approved listings past expires_at, clears dead sessions / login codes, and
// removes abandoned drafts and unsubmitted change requests (with their files).
// Public pages already hide expired listings via the public_properties view, so a
// missed run is harmless.

export async function GET(request: Request) {
  // Always per request: never prerendered at build time (cacheComponents). Without this the
  // build could stop here when an earlier await finished after the prerender window.
  await connection();
  const secret = await env("CRON_SECRET");
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });

  const expired = await transaction(async (tx) => {
    const rows = await tx.all<{ id: string }>(
      "SELECT id FROM properties WHERE status = 'approved' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP(3) FOR UPDATE",
    );
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    await tx.run("UPDATE properties SET status = 'expired', featured = 0 WHERE id IN (?)", [ids]);
    for (const id of ids) {
      await tx.insert("activity_log", { id: uuid(), entity_type: "property", entity_id: id, action: "expired", actor_type: "system" });
    }
    return ids.length;
  });

  const day = new Date(Date.now() - 86_400_000);
  await db.run("DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(3)");
  await db.run("DELETE FROM otp_codes WHERE created_at < ?", [day]);
  await db.run("DELETE FROM auth_attempts WHERE created_at < ?", [new Date(Date.now() - 30 * 86_400_000)]);
  await db.run("DELETE FROM password_resets WHERE expires_at < ?", [day]);

  // Abandoned submissions: drafts never finished within 7 days, with their files.
  const week = new Date(Date.now() - 7 * 86_400_000);
  const drafts = await db.all<{ id: string }>("SELECT id FROM properties WHERE status = 'draft' AND created_at < ? LIMIT 200", [week]);
  if (drafts.length) {
    const ids = drafts.map((d) => d.id);
    const [imgs, docs] = await Promise.all([
      db.all<{ storage_path: string; watermarked_path: string }>("SELECT storage_path, watermarked_path FROM property_images WHERE property_id IN (?)", [ids]),
      db.all<{ storage_path: string }>("SELECT storage_path FROM property_documents WHERE property_id IN (?)", [ids]),
    ]);
    await db.run("DELETE FROM properties WHERE id IN (?) AND status = 'draft'", [ids]);
    await Promise.all([
      ...imgs.filter((i) => !i.storage_path.startsWith("demo/")).map((i) => removeStoredImage(i.storage_path, i.watermarked_path)),
      ...docs.map((d) => removeFile("documents", d.storage_path)),
    ]);
  }

  // Change requests started but never submitted (the owner left mid-upload), with their photos.
  const stale = await db.all<{ id: string }>("SELECT id FROM change_requests WHERE submitted = 0 AND requested_at < ? LIMIT 200", [new Date(Date.now() - 2 * 86_400_000)]);
  if (stale.length) {
    const ids = stale.map((r) => r.id);
    const imgs = await db.all<{ storage_path: string; watermarked_path: string }>(
      "SELECT storage_path, watermarked_path FROM property_images WHERE change_request_id IN (?) AND approved = 0",
      [ids],
    );
    await db.run("DELETE FROM property_images WHERE change_request_id IN (?) AND approved = 0", [ids]);
    await db.run("DELETE FROM change_requests WHERE id IN (?) AND submitted = 0", [ids]);
    await Promise.all(imgs.map((i) => removeStoredImage(i.storage_path, i.watermarked_path)));
  }

  await db.run("INSERT INTO app_config (name, value) VALUES ('cron_last_run', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [new Date().toISOString()]);

  if (expired) revalidateTag("listings", "max");
  return Response.json({ ok: true, expired, draftsRemoved: drafts.length, staleRequestsRemoved: stale.length });
}
