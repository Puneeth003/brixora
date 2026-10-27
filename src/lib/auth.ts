import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, dbConfigured } from "./db";
import { randomToken, sha256 } from "./crypto";
import type { Profile } from "./types";

// Database-backed sessions. The cookie holds a random token; the sessions table keeps
// only its SHA-256. Owners and staff (admin + agents) use separate cookies, and the
// staff cookie is scoped to /admin so it is never sent with public pages.

type Kind = "owner" | "admin";

const COOKIE: Record<Kind, { name: string; path: string; maxAge: number; sameSite: "lax" | "strict" }> = {
  owner: { name: "brx_owner", path: "/", maxAge: 30 * 86_400, sameSite: "lax" },
  admin: { name: "brx_admin", path: "/admin", maxAge: 12 * 3_600, sameSite: "strict" },
};

const PROFILE_COLUMNS = "u.id, u.role, u.name, u.phone, u.wa_opt_out, u.created_at";

type SessionRow = Profile & {
  session_id: string;
  mfa_verified: boolean;
  email: string | null;
  totp_enabled: boolean;
  phone_verified_at: string | null;
  is_active: boolean;
};

export async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

async function readSession(kind: Kind): Promise<SessionRow | null> {
  if (!dbConfigured) return null;
  const token = (await cookies()).get(COOKIE[kind].name)?.value;
  if (!token) return null;
  return db.one<SessionRow>(
    `SELECT s.id AS session_id, s.mfa_verified, ${PROFILE_COLUMNS}, u.email, u.totp_enabled, u.phone_verified_at, u.is_active
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.kind = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.is_active = 1`,
    [sha256(token), kind],
  );
}

/** Creates a session and sets its cookie. Call only from a server action / route handler. */
export async function startSession(kind: Kind, userId: string, opts: { mfaVerified?: boolean } = {}) {
  const token = randomToken();
  const c = COOKIE[kind];
  const h = await headers();
  await db.insert("sessions", {
    id: sha256(token),
    user_id: userId,
    kind,
    mfa_verified: opts.mfaVerified ?? false,
    ip: await clientIp(),
    user_agent: h.get("user-agent")?.slice(0, 255) ?? null,
    expires_at: new Date(Date.now() + c.maxAge * 1000),
  });
  (await cookies()).set(c.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: c.sameSite,
    path: c.path,
    maxAge: c.maxAge,
  });
}

/** Deletes the current session (if any) and clears its cookie. */
export async function endSession(kind: Kind) {
  const store = await cookies();
  const token = store.get(COOKIE[kind].name)?.value;
  if (token && dbConfigured) await db.run("DELETE FROM sessions WHERE id = ?", [sha256(token)]);
  store.set(COOKIE[kind].name, "", { path: COOKIE[kind].path, maxAge: 0 });
}

/** Marks the current admin session as TOTP-verified. */
export async function markSessionMfaVerified() {
  const token = (await cookies()).get(COOKIE.admin.name)?.value;
  if (!token) return false;
  return (await db.update("sessions", { mfa_verified: true }, "id = ? AND kind = 'admin'", [sha256(token)])) > 0;
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/** Signed-in owner (phone-verified) or null. Never redirects. */
export async function getOwner(): Promise<{ id: string; phone: string; profile: Profile } | null> {
  const s = await readSession("owner");
  if (!s?.phone || !s.phone_verified_at) return null;
  const profile: Profile = { id: s.id, role: s.role, name: s.name, phone: s.phone, wa_opt_out: s.wa_opt_out, created_at: s.created_at };
  return { id: s.id, phone: s.phone, profile };
}

export async function requireOwner(returnTo = "/manage") {
  const owner = await getOwner();
  if (!owner) redirect(`/manage?next=${encodeURIComponent(returnTo)}`);
  return owner;
}

// ---------------------------------------------------------------------------
// Staff: admin (everything) and agents (CRM, their own clients)
// ---------------------------------------------------------------------------

/** ADMIN_2FA=off skips the authenticator step (password only). On by default. */
export const adminMfaRequired = process.env.ADMIN_2FA !== "off";

export type StaffRole = "admin" | "agent";
export type Staff = { userId: string; email: string; name: string | null; role: StaffRole };

type StaffCheck =
  | ({ status: "ok" } & Staff)
  | { status: "signed_out" }
  | { status: "not_admin" }
  | { status: "needs_mfa"; enrolled: boolean; userId: string; email: string };

export async function checkStaff(): Promise<StaffCheck> {
  const s = await readSession("admin");
  if (!s?.email) return { status: "signed_out" };
  if (s.role !== "admin" && s.role !== "agent") return { status: "not_admin" };
  if (adminMfaRequired && (!s.mfa_verified || !s.totp_enabled)) {
    return { status: "needs_mfa", enrolled: s.totp_enabled, userId: s.id, email: s.email };
  }
  return { status: "ok", userId: s.id, email: s.email, name: s.name, role: s.role };
}

/** Same as checkStaff, but an agent session counts as "not_admin". */
export async function checkAdmin(): Promise<StaffCheck> {
  const check = await checkStaff();
  return check.status === "ok" && check.role !== "admin" ? { status: "not_admin" } : check;
}

/** Signed-in admin or agent (TOTP-verified when 2FA is on); otherwise redirects to login / MFA. */
export async function requireStaff(): Promise<Staff> {
  const check = await checkStaff();
  if (check.status === "ok") return { userId: check.userId, email: check.email, name: check.name, role: check.role };
  if (check.status === "needs_mfa") redirect("/admin/mfa");
  redirect("/admin/login");
}

/** Admin only. Agents are sent to their CRM. */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/admin/clients");
  return staff;
}

// ---------------------------------------------------------------------------
// Rate limiting (auth_attempts ledger)
// ---------------------------------------------------------------------------

export type AttemptKind =
  | "admin_password"
  | "admin_totp"
  | "otp_send"
  | "otp_verify"
  | "reset_send"
  | "reset_verify"
  | "password_change";

export async function recordAttempt(kind: AttemptKind, identifier: string, success: boolean) {
  await db.insert("auth_attempts", { kind, identifier, ip: await clientIp(), success });
}

/** True when failures for this identifier or this IP within the window reach `max`. */
export async function tooManyAttempts(kind: AttemptKind, identifier: string, max: number, windowMinutes: number, opts: { countSuccess?: boolean } = {}) {
  const ip = await clientIp();
  const success = opts.countSuccess ? "" : "AND success = 0";
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const [byId, byIp] = await Promise.all([
    db.count(`SELECT COUNT(*) FROM auth_attempts WHERE kind = ? AND identifier = ? ${success} AND created_at > ?`, [kind, identifier, since]),
    ip
      ? db.count(`SELECT COUNT(*) FROM auth_attempts WHERE kind = ? AND ip = ? ${success} AND created_at > ?`, [kind, ip, since])
      : Promise.resolve(0),
  ]);
  // The per-IP budget is wider: one office or mobile carrier NAT can share an IP.
  return byId >= max || byIp >= max * 4;
}
