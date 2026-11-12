"use server";

import { getOwner, recordAttempt, startSession, tooManyAttempts } from "@/lib/auth";
import { db, dbConfigured, transaction, uuid } from "@/lib/db";
import { hmac, randomDigits, safeEqual } from "@/lib/crypto";
import { normalizeIndianPhone } from "@/lib/format";
import { recentOtpCount, sendOtp, whatsappConnection } from "@/lib/whatsapp";

// Owner sign-in: phone → 6-digit code on WhatsApp → session cookie.

type Result = { ok: true } | { ok: false; error: string };

const CODE_TTL_MS = 5 * 60_000;
const MAX_VERIFY_TRIES = 5;
const OTP_PER_HOUR = 3;

const codeHash = (phone: string, code: string) => hmac("otp", `${phone}:${code}`);

export async function hasOwnerSession() {
  return Boolean(await getOwner());
}

export async function sendLoginCode(rawPhone: string): Promise<Result> {
  if (!dbConfigured) return { ok: false, error: "Sign-in isn't configured yet." };
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid 10-digit Indian mobile number." };
  // Outside production a missing connection is fine: the code is printed to the server console.
  if (process.env.NODE_ENV === "production" && !(await whatsappConnection())) {
    return { ok: false, error: "WhatsApp sign-in isn't set up yet. Please contact us to get access." };
  }

  if ((await recentOtpCount(phone)) >= OTP_PER_HOUR || (await tooManyAttempts("otp_send", phone, OTP_PER_HOUR * 2, 60, { countSuccess: true }))) {
    return { ok: false, error: "Too many codes requested. Please try again in an hour." };
  }
  await recordAttempt("otp_send", phone, true);

  const code = randomDigits(6);
  // A new code replaces any earlier one.
  await db.run("UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP(3) WHERE phone = ? AND consumed_at IS NULL", [phone]);
  await db.insert("otp_codes", { id: uuid(), phone, code_hash: codeHash(phone, code), expires_at: new Date(Date.now() + CODE_TTL_MS) });

  if (!(await sendOtp(phone, code))) return { ok: false, error: "Could not send the code on WhatsApp. Please try again." };
  return { ok: true };
}

export async function verifyLoginCode(rawPhone: string, rawCode: string): Promise<Result> {
  if (!dbConfigured) return { ok: false, error: "Sign-in isn't configured yet." };
  const phone = normalizeIndianPhone(rawPhone);
  const code = rawCode.replace(/\D/g, "");
  const wrong = { ok: false as const, error: "That code is incorrect or has expired." };
  if (!phone || code.length !== 6) return wrong;

  if (await tooManyAttempts("otp_verify", phone, 10, 60)) {
    return { ok: false, error: "Too many attempts. Please wait a while and try again." };
  }

  const userId = await transaction(async (tx) => {
    const row = await tx.one<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM otp_codes
        WHERE phone = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP(3)
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone],
    );
    if (!row || row.attempts >= MAX_VERIFY_TRIES) return null;
    if (!safeEqual(row.code_hash, codeHash(phone, code))) {
      await tx.run("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", [row.id]);
      return null;
    }
    await tx.run("UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP(3) WHERE id = ?", [row.id]);

    const existing = await tx.one<{ id: string; role: string; is_active: boolean }>(
      "SELECT id, role, is_active FROM users WHERE phone = ? FOR UPDATE",
      [phone],
    );
    if (existing) {
      // Staff never sign in through the member flow; blocked members can't sign in.
      if (existing.role !== "owner" || !existing.is_active) return null;
      await tx.run("UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, UTC_TIMESTAMP(3)) WHERE id = ?", [existing.id]);
      return existing.id;
    }
    const id = uuid();
    await tx.insert("users", { id, role: "owner", phone, phone_verified_at: new Date() });
    return id;
  });

  await recordAttempt("otp_verify", phone, Boolean(userId));
  if (!userId) return wrong;

  // Enquiries sent from this number before signing up now show in the account.
  await db.run("UPDATE enquiries SET user_id = ? WHERE phone = ? AND user_id IS NULL", [userId, phone]);
  await db.update("users", { last_login_at: new Date() }, "id = ?", [userId]);
  await startSession("owner", userId);
  return { ok: true };
}
