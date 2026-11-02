"use server";

import { adminMfaRequired, checkStaff, markSessionMfaVerified, recordAttempt, startSession, tooManyAttempts } from "@/lib/auth";
import { db, dbConfigured, transaction, uuid } from "@/lib/db";
import { authSecretConfigured, encrypt, hashPassword, hmac, newTotpSecret, randomDigits, randomToken, safeEqual, sha256, tryDecrypt, verifyPassword, verifyTotp } from "@/lib/crypto";
import { passwordChangedEmail, passwordResetEmail, sendMail } from "@/lib/mail";
import { passwordProblem } from "@/lib/password";

// Staff sign-in (admin and agents): email + password, then a TOTP code when 2FA is
// on (ADMIN_2FA). Plus the forgot-password flow: emailed 6-digit code → one-time
// reset token → new password.

type Result = { ok: true } | { ok: false; error: string };
type LoginResult = { ok: true; next: string } | { ok: false; error: string };

const normEmail = (raw: unknown) => String(raw ?? "").trim().toLowerCase().slice(0, 254);

type StaffRow = { id: string; name: string | null; email: string; role: string; password_hash: string | null; totp_secret: string | null };

function findStaff(email: string) {
  return db.one<StaffRow>(
    "SELECT id, name, email, role, password_hash, totp_secret FROM users WHERE email = ? AND role IN ('admin', 'agent') AND is_active = 1",
    [email],
  );
}

export async function adminLogin(rawEmail: string, password: string): Promise<LoginResult> {
  if (!dbConfigured) return { ok: false, error: "The database is not configured yet." };
  const email = normEmail(rawEmail);
  if (!email || !password) return { ok: false, error: "Incorrect email or password." };

  if (await tooManyAttempts("admin_password", email, 5, 15)) {
    return { ok: false, error: "Too many failed attempts. Try again in 15 minutes, or reset your password." };
  }

  const user = await findStaff(email);
  const valid = await verifyPassword(String(password), user?.password_hash ?? null);
  await recordAttempt("admin_password", email, valid && Boolean(user));
  if (!user || !valid) return { ok: false, error: "Incorrect email or password." };

  if (!adminMfaRequired) {
    await startSession("admin", user.id);
    return { ok: true, next: "/admin" };
  }

  if (!authSecretConfigured()) {
    return { ok: false, error: "Two-factor sign-in isn't set up on the server (AUTH_SECRET is missing). Ask the site owner." };
  }
  // First sign-in: create the TOTP secret the MFA page will show as a QR code.
  if (!user.totp_secret) {
    await db.update("users", { totp_secret: encrypt(newTotpSecret()), totp_enabled: false }, "id = ?", [user.id]);
  }
  await startSession("admin", user.id);
  return { ok: true, next: "/admin/mfa" };
}

export async function verifyAdminTotp(code: string): Promise<Result> {
  const check = await checkStaff();
  if (check.status !== "needs_mfa") return { ok: false, error: "Please sign in again." };

  if (await tooManyAttempts("admin_totp", check.userId, 5, 15)) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  }

  const user = await db.one<{ totp_secret: string | null; totp_last_step: number | null }>(
    "SELECT totp_secret, totp_last_step FROM users WHERE id = ?",
    [check.userId],
  );
  if (!user?.totp_secret) return { ok: false, error: "Please sign in again." };

  const secret = tryDecrypt(user.totp_secret);
  if (!secret) return { ok: false, error: "Your two-factor setup can't be read on this server. Ask the site owner to reset it." };
  const step = verifyTotp(secret, String(code).trim());
  // Each code works once, even within its 30-second window.
  const ok = step !== null && step > (user.totp_last_step ?? -1);
  await recordAttempt("admin_totp", check.userId, ok);
  if (!ok) return { ok: false, error: "That code didn't work. Check your authenticator app and try again." };

  await db.update("users", { totp_enabled: true, totp_last_step: step }, "id = ?", [check.userId]);
  await markSessionMfaVerified();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

const RESET_MINUTES = 10;
const MAX_CODE_TRIES = 5;
const GENERIC_SENT = "If that email belongs to an account, we've sent a 6-digit code to it. Check your inbox and spam folder.";

const codeHash = (userId: string, code: string) => hmac("password-reset", `${userId}:${code}`);

/** Step 1: email a code. Answers the same whether or not the email has an account. */
export async function requestPasswordReset(rawEmail: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (!dbConfigured) return { ok: false, error: "The database is not configured yet." };
  const email = normEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };

  // 5 requests per 15 minutes per email (and a wider budget per IP), counted up front
  // so a burst can't flood someone's inbox.
  if (await tooManyAttempts("reset_send", email, 5, 15, { countSuccess: true })) {
    return { ok: false, error: "Too many requests. Please try again in 15 minutes." };
  }
  await recordAttempt("reset_send", email, true);

  const user = await findStaff(email);
  if (!user) return { ok: true, message: GENERIC_SENT };

  const recent = await db.count("SELECT COUNT(*) FROM password_resets WHERE user_id = ? AND created_at > ?", [
    user.id,
    new Date(Date.now() - RESET_MINUTES * 60_000),
  ]);
  if (recent >= 3) return { ok: false, error: "Too many codes requested. Please wait 10 minutes and try again." };

  const code = randomDigits(6);
  // A new code retires every earlier one.
  await db.run("UPDATE password_resets SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND used_at IS NULL", [user.id]);
  await db.insert("password_resets", {
    id: uuid(),
    user_id: user.id,
    code_hash: codeHash(user.id, code),
    expires_at: new Date(Date.now() + RESET_MINUTES * 60_000),
  });
  try {
    await sendMail({ to: user.email, ...passwordResetEmail({ name: user.name, code, minutes: RESET_MINUTES }) });
  } catch (e) {
    console.error("[reset] email failed", e);
    return { ok: false, error: "We couldn't send the email right now. Please try again shortly." };
  }
  return { ok: true, message: GENERIC_SENT };
}

/** Step 2: check the code. Returns a one-time token that authorises step 3. */
export async function verifyResetCode(rawEmail: string, rawCode: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const email = normEmail(rawEmail);
  const code = String(rawCode ?? "").replace(/\D/g, "");
  const wrong = { ok: false as const, error: "That code is incorrect or has expired." };
  if (code.length !== 6) return { ok: false, error: "Please enter the 6-digit code." };

  if (await tooManyAttempts("reset_verify", email, 10, 15)) {
    return { ok: false, error: "Too many wrong codes. Please try again in 15 minutes." };
  }

  const user = await findStaff(email);
  const live = user
    ? await db.one<{ id: string; code_hash: string }>(
        `SELECT id, code_hash FROM password_resets
          WHERE user_id = ? AND used_at IS NULL AND token_hash IS NULL AND expires_at > UTC_TIMESTAMP(3)
          ORDER BY created_at DESC LIMIT 1`,
        [user.id],
      )
    : null;

  // Claim one guess on the code first. Once MAX_CODE_TRIES are used the code is
  // burned, however many requests arrive at once.
  const claimed =
    live &&
    (await db.run("UPDATE password_resets SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ?", [live.id, MAX_CODE_TRIES]))
      .affectedRows === 1;
  if (live && !claimed) {
    await db.update("password_resets", { used_at: new Date() }, "id = ?", [live.id]);
    await recordAttempt("reset_verify", email, false);
    return { ok: false, error: "Too many wrong codes. Request a new code." };
  }

  const matches = Boolean(user && live && safeEqual(live.code_hash, codeHash(user.id, code)));
  await recordAttempt("reset_verify", email, matches);
  if (!matches || !live) return wrong;

  const token = randomToken();
  const set = await db.update(
    "password_resets",
    { token_hash: sha256(token), expires_at: new Date(Date.now() + RESET_MINUTES * 60_000) },
    "id = ? AND token_hash IS NULL AND used_at IS NULL",
    [live.id],
  );
  return set ? { ok: true, token } : wrong;
}

/** Step 3: set the new password and sign out every session for the account. */
export async function resetPassword(rawEmail: string, token: string, password: string, confirm: string): Promise<Result> {
  const email = normEmail(rawEmail);
  const user = await findStaff(email);
  const row = user
    ? await db.one<{ id: string }>(
        "SELECT id FROM password_resets WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)",
        [user.id, sha256(String(token ?? ""))],
      )
    : null;
  if (!user || !row) return { ok: false, error: "This reset has expired. Please start again." };

  if (password !== confirm) return { ok: false, error: "Passwords don't match." };
  const problem = passwordProblem(password, user);
  if (problem) return { ok: false, error: problem };

  const hash = await hashPassword(password);
  await transaction(async (tx) => {
    await tx.update("users", { password_hash: hash, password_changed_at: new Date() }, "id = ?", [user.id]);
    await tx.run("UPDATE password_resets SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND used_at IS NULL", [user.id]);
    await tx.run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
    // Clear the sign-in lockout for this email.
    await tx.run("DELETE FROM auth_attempts WHERE kind = 'admin_password' AND identifier = ? AND success = 0", [email]);
  });
  await sendMail({ to: user.email, ...passwordChangedEmail({ name: user.name }) }).catch((e) => console.error("[reset] notice failed", e));
  return { ok: true };
}
