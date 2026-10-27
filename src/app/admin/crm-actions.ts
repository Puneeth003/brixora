"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, recordAttempt, requireAdmin, requireStaff, tooManyAttempts, type Staff } from "@/lib/auth";
import { db, transaction, uuid } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { clientScope, loadClientFor, logClientActivity } from "@/lib/crm";
import { normalizeIndianPhone } from "@/lib/format";
import { mailConfigured, passwordChangedEmail, sendMail, welcomeEmail } from "@/lib/mail";
import { passwordProblem } from "@/lib/password";
import { parseIstInput } from "@/lib/time";
import { site } from "@/lib/site";
import { notify } from "@/lib/whatsapp";
import { CLIENT_STATUSES, label } from "@/lib/crm-constants";
import type { ActionState, ClientStatus } from "@/lib/types";

// CRM actions. Every action re-checks the session; agents can only touch clients
// assigned to them (loadClientFor), and only admins manage agents and members.

const opt = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const optNum = (v: FormDataEntryValue | null) => {
  const n = Number(typeof v === "string" ? v.replace(/[,\s₹]/g, "") : NaN);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Only active admin/agent ids may be assigned. */
async function validStaffId(id: string | null, kind: "assignee" | "broker") {
  if (!id) return null;
  if (!isUuid(id)) return undefined;
  const row = await db.one<{ id: string }>(
    `SELECT id FROM users WHERE id = ? AND is_active = 1 AND ${kind === "broker" ? "role = 'agent' AND agent_type = 'broker'" : "role IN ('admin', 'agent')"}`,
    [id],
  );
  return row ? row.id : undefined;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  phone: z.string().trim().min(10, "Enter a valid 10-digit mobile number"),
  alt_phone: z.string().trim().max(20).nullable(),
  email: z.string().trim().email("Enter a valid email").max(254).nullable(),
  type: z.enum(["buyer", "tenant", "seller", "landlord", "investor"]),
  source: z.enum(["website", "walk_in", "referral", "phone", "whatsapp", "broker", "social", "other"]),
  listing_type: z.enum(["sale", "rent"]).nullable(),
  property_types: z.array(z.enum(["apartment", "villa", "independent_house", "plot", "commercial", "office", "shop", "warehouse"])).max(8),
  localities: z.string().trim().max(255).nullable(),
  bedrooms: z.number().int().min(0).max(20).nullable(),
  budget_min: z.number().int().max(10_000_000_000).nullable(),
  budget_max: z.number().int().max(10_000_000_000).nullable(),
  notes: z.string().trim().max(4000).nullable(),
});

export async function saveClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const id = opt(formData.get("id"));
  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    alt_phone: opt(formData.get("alt_phone")),
    email: opt(formData.get("email")),
    type: formData.get("type"),
    source: formData.get("source"),
    listing_type: opt(formData.get("listing_type")),
    property_types: formData.getAll("property_types").map(String),
    localities: opt(formData.get("localities")),
    bedrooms: optNum(formData.get("bedrooms")),
    budget_min: optNum(formData.get("budget_min")),
    budget_max: optNum(formData.get("budget_max")),
    notes: opt(formData.get("notes")),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const phone = normalizeIndianPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Enter a valid 10-digit Indian mobile number." };
  if (parsed.data.budget_min && parsed.data.budget_max && parsed.data.budget_min > parsed.data.budget_max) {
    return { ok: false, error: "Minimum budget is higher than the maximum." };
  }

  // Agents always own what they create and can't reassign; admins choose.
  const assignee = staff.role === "admin" ? await validStaffId(opt(formData.get("assigned_to")), "assignee") : staff.userId;
  const broker = await validStaffId(opt(formData.get("broker_id")), "broker");
  if (assignee === undefined) return { ok: false, error: "Choose a valid agent." };
  if (broker === undefined) return { ok: false, error: "Choose a valid broker." };
  const nextFollowUp = parseIstInput(formData.get("next_follow_up"));

  const row = { ...parsed.data, phone, broker_id: broker, next_follow_up: nextFollowUp };

  if (id) {
    const before = await loadClientFor(staff, id);
    if (!before) return { ok: false, error: "Client not found." };
    const dup = await db.one<{ id: string }>("SELECT id FROM clients WHERE phone = ? AND id <> ?", [phone, id]);
    if (dup) return { ok: false, error: "Another client already has this phone number." };
    await db.update("clients", { ...row, ...(staff.role === "admin" ? { assigned_to: assignee } : {}) }, "id = ?", [id]);
    if (staff.role === "admin" && assignee !== before.assigned_to) {
      await logClientActivity({ clientId: id, type: "assigned", body: await assigneeName(assignee), actorId: staff.userId });
    }
    return { ok: true, message: "Saved." };
  }

  const dup = await db.one<{ id: string; assigned_to: string | null }>("SELECT id, assigned_to FROM clients WHERE phone = ?", [phone]);
  if (dup) {
    const visible = staff.role === "admin" || dup.assigned_to === staff.userId;
    return { ok: false, error: visible ? "A client with this phone number already exists." : "This client is already handled by another agent. Ask an admin." };
  }
  const newId = uuid();
  await db.insert("clients", { id: newId, ...row, status: "new", assigned_to: assignee, created_by: staff.userId });
  await logClientActivity({ clientId: newId, type: "note", body: "Client added.", actorId: staff.userId });
  redirect(`/admin/clients/${newId}`);
}

async function assigneeName(id: string | null) {
  if (!id) return "Unassigned";
  const u = await db.one<{ name: string | null; email: string | null }>("SELECT name, email FROM users WHERE id = ?", [id]);
  return `Assigned to ${u?.name ?? u?.email ?? "agent"}`;
}

export async function changeClientStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const client = await loadClientFor(staff, String(formData.get("id") ?? ""));
  if (!client) return { ok: false, error: "Client not found." };
  const status = String(formData.get("status") ?? "") as ClientStatus;
  if (!CLIENT_STATUSES.some((s) => s.value === status)) return { ok: false, error: "Choose a status." };
  const lostReason = opt(formData.get("lost_reason"));
  if (status === "lost" && !lostReason) return { ok: false, error: "Add a reason for losing this client." };
  if (status === client.status) return { ok: true, message: "No change." };

  await db.update(
    "clients",
    {
      status,
      lost_reason: status === "lost" ? lostReason : null,
      // Closed clients need no follow-up.
      ...(status === "won" || status === "lost" ? { next_follow_up: null } : {}),
    },
    "id = ?",
    [client.id],
  );
  await logClientActivity({
    clientId: client.id,
    type: "status",
    body: `${label(CLIENT_STATUSES, client.status)} → ${label(CLIENT_STATUSES, status)}${lostReason && status === "lost" ? ` (${lostReason})` : ""}`,
    actorId: staff.userId,
  });
  return { ok: true, message: "Status updated." };
}

const LOGGABLE = ["note", "call", "whatsapp", "email", "meeting", "site_visit"] as const;

export async function addClientActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const client = await loadClientFor(staff, String(formData.get("client_id") ?? ""));
  if (!client) return { ok: false, error: "Client not found." };
  const type = String(formData.get("type") ?? "note");
  if (!(LOGGABLE as readonly string[]).includes(type)) return { ok: false, error: "Choose an activity type." };
  const body = opt(formData.get("body"));
  if (!body || body.length > 4000) return { ok: false, error: "Write a short note (up to 4000 characters)." };
  const propertyId = opt(formData.get("property_id"));
  const property = propertyId && isUuid(propertyId) ? await db.one<{ id: string }>("SELECT id FROM properties WHERE id = ?", [propertyId]) : null;

  const nextFollowUp = parseIstInput(formData.get("next_follow_up"));
  // A logged contact moves an early-stage lead along the pipeline.
  let status: ClientStatus = client.status;
  if (type === "site_visit" && (status === "new" || status === "contacted")) status = "site_visit";
  else if (type !== "note" && status === "new") status = "contacted";

  await logClientActivity({ clientId: client.id, type: type as (typeof LOGGABLE)[number], body, propertyId: property?.id, actorId: staff.userId });
  if (status !== client.status) {
    await logClientActivity({
      clientId: client.id,
      type: "status",
      body: `${label(CLIENT_STATUSES, client.status)} → ${label(CLIENT_STATUSES, status)}`,
      actorId: staff.userId,
    });
  }
  await db.update(
    "clients",
    {
      status,
      ...(type === "note" ? {} : { last_contact_at: new Date() }),
      next_follow_up: nextFollowUp ?? (formData.get("clear_follow_up") === "on" ? null : client.next_follow_up),
    },
    "id = ?",
    [client.id],
  );
  return { ok: true, message: "Logged." };
}

export async function deleteClient(id: string) {
  await requireAdmin();
  if (isUuid(id)) await db.run("DELETE FROM clients WHERE id = ?", [id]);
  redirect("/admin/clients");
}

// ---------------------------------------------------------------------------
// Enquiry conversations (staff side)
// ---------------------------------------------------------------------------

/** An enquiry this staff member may answer (admin: any; agent: their clients' enquiries). */
async function enquiryFor(staff: Staff, enquiryId: string) {
  if (!isUuid(enquiryId)) return null;
  const scope = clientScope(staff);
  return db.one<{ id: string; user_id: string | null; client_id: string | null; name: string; phone: string; reference_no: string | null }>(
    `SELECT e.id, e.user_id, e.client_id, e.name, e.phone, p.reference_no
       FROM enquiries e LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN properties p ON p.id = e.property_id
      WHERE e.id = ? AND ${staff.role === "admin" ? "1 = 1" : scope.sql}`,
    [enquiryId, ...scope.values],
  );
}

export async function replyToEnquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const enquiry = await enquiryFor(staff, String(formData.get("enquiry_id") ?? ""));
  if (!enquiry) return { ok: false, error: "Enquiry not found." };
  const body = opt(formData.get("body"));
  if (!body || body.length > 2000) return { ok: false, error: "Write a reply (up to 2000 characters)." };

  await transaction(async (tx) => {
    await tx.insert("enquiry_messages", { id: uuid(), enquiry_id: enquiry.id, sender: "staff", author_id: staff.userId, body });
    // Replying means the member's earlier messages have been seen.
    await tx.run("UPDATE enquiry_messages SET read_at = UTC_TIMESTAMP(3) WHERE enquiry_id = ? AND sender = 'member' AND read_at IS NULL", [enquiry.id]);
    if (enquiry.client_id) {
      await logClientActivity({ clientId: enquiry.client_id, type: "whatsapp", body: `Replied in account: ${body}`, actorId: staff.userId }, tx);
      await tx.update("clients", { last_contact_at: new Date() }, "id = ?", [enquiry.client_id]);
      await tx.run("UPDATE clients SET status = 'contacted' WHERE id = ? AND status = 'new'", [enquiry.client_id]);
    }
  });
  // Nudge on WhatsApp; the reply itself is read in the account area.
  await notify(enquiry.phone, "enquiry_reply", [enquiry.name, enquiry.reference_no ?? "your enquiry", `${site.url}/account/enquiries`]);
  return { ok: true, message: enquiry.user_id ? "Reply sent." : "Reply saved. The visitor will see it once they sign in with this number." };
}

export async function markEnquiryRead(enquiryId: string) {
  const staff = await requireStaff();
  const enquiry = await enquiryFor(staff, enquiryId);
  if (!enquiry) return;
  await db.run("UPDATE enquiry_messages SET read_at = UTC_TIMESTAMP(3) WHERE enquiry_id = ? AND sender = 'member' AND read_at IS NULL", [enquiry.id]);
}

// ---------------------------------------------------------------------------
// Agents & brokers (admin)
// ---------------------------------------------------------------------------

const agentSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254).nullable(),
  work_phone: z.string().trim().max(20).nullable(),
  role: z.enum(["agent", "admin"]),
  agent_type: z.enum(["agent", "broker"]),
  company: z.string().trim().max(120).nullable(),
  rera_no: z.string().trim().max(80).nullable(),
  commission_pct: z.number().min(0).max(100).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export async function saveAgent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = opt(formData.get("id"));
  const pct = opt(formData.get("commission_pct"));
  const parsed = agentSchema.safeParse({
    name: formData.get("name"),
    email: opt(formData.get("email")),
    work_phone: opt(formData.get("work_phone")),
    role: formData.get("role") ?? "agent",
    agent_type: formData.get("agent_type") ?? "agent",
    company: opt(formData.get("company")),
    rera_no: opt(formData.get("rera_no")),
    commission_pct: pct === null ? null : Number(pct),
    notes: opt(formData.get("notes")),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = { ...parsed.data, agent_type: parsed.data.role === "admin" ? null : parsed.data.agent_type };
  const password = String(formData.get("password") ?? "");
  if (password) {
    const problem = passwordProblem(password, data);
    if (problem) return { ok: false, error: problem };
  }

  if (data.email) {
    const taken = await db.one<{ id: string }>("SELECT id FROM users WHERE email = ? AND id <> ?", [data.email, id ?? ""]);
    if (taken) return { ok: false, error: "Another account already uses this email." };
  }

  let userId = id;
  if (id) {
    const before = await db.one<{ id: string; role: string; email: string | null }>("SELECT id, role, email FROM users WHERE id = ? AND role IN ('admin', 'agent')", [id]);
    if (!before) return { ok: false, error: "Agent not found." };
    if (id === admin.userId && data.role !== "admin") return { ok: false, error: "You can't remove your own admin access." };
    await db.update("users", data, "id = ?", [id]);
    // A changed email or role signs the account out everywhere.
    if (before.email !== data.email || before.role !== data.role) await db.run("DELETE FROM sessions WHERE user_id = ?", [id]);
  } else {
    userId = uuid();
    await db.insert("users", { id: userId, ...data, is_active: true });
  }
  if (password) {
    await db.update("users", { password_hash: await hashPassword(password), password_changed_at: new Date() }, "id = ?", [userId]);
    if (id) await db.run("DELETE FROM sessions WHERE user_id = ?", [id]);
  }

  let message = id ? "Saved." : "Agent added.";
  if (!id && data.email && formData.get("send_welcome") === "on") {
    message = (await sendWelcome(userId!)) ? "Agent added and welcome email sent." : "Agent added, but the welcome email couldn't be sent.";
  }
  if (!id) redirect(`/admin/users/${userId}?saved=${encodeURIComponent(message)}`);
  return { ok: true, message };
}

async function sendWelcome(userId: string) {
  const u = await db.one<{ name: string | null; email: string | null }>("SELECT name, email FROM users WHERE id = ?", [userId]);
  if (!u?.email) return false;
  try {
    const link = `${site.url}/admin/forgot-password?email=${encodeURIComponent(u.email)}`;
    await sendMail({ to: u.email, ...welcomeEmail({ name: u.name, email: u.email, link }) });
    return true;
  } catch (e) {
    console.error("[agents] welcome email failed", e);
    return false;
  }
}

export async function sendAgentWelcome(id: string) {
  await requireAdmin();
  if (isUuid(id)) await sendWelcome(id);
  revalidatePath("/admin", "layout");
}

export async function setStaffActive(id: string, active: boolean) {
  const admin = await requireAdmin();
  if (!isUuid(id) || id === admin.userId) return;
  await db.update("users", { is_active: active }, "id = ? AND role IN ('admin', 'agent')", [id]);
  if (!active) await db.run("DELETE FROM sessions WHERE user_id = ?", [id]);
  revalidatePath("/admin", "layout");
}

// ---------------------------------------------------------------------------
// Members: visitors and owners (admin)
// ---------------------------------------------------------------------------

export async function setMemberActive(id: string, active: boolean) {
  await requireAdmin();
  if (!isUuid(id)) return;
  await db.update("users", { is_active: active }, "id = ? AND role = 'owner'", [id]);
  if (!active) await db.run("DELETE FROM sessions WHERE user_id = ?", [id]);
  revalidatePath("/admin", "layout");
}

/** Opens (or creates) the CRM client for a member's phone number. */
export async function openMemberClient(id: string) {
  const staff = await requireAdmin();
  const m = await db.one<{ id: string; name: string | null; phone: string | null }>("SELECT id, name, phone FROM users WHERE id = ? AND role = 'owner'", [id]);
  if (!m?.phone) redirect("/admin/members");
  const existing = await db.one<{ id: string }>("SELECT id FROM clients WHERE phone = ?", [m.phone]);
  if (existing) redirect(`/admin/clients/${existing.id}`);
  const owns = await db.count("SELECT COUNT(*) FROM properties WHERE owner_id = ? AND status <> 'draft'", [m.id]);
  const clientId = uuid();
  await db.insert("clients", {
    id: clientId,
    name: m.name ?? "Member",
    phone: m.phone,
    type: owns ? "seller" : "buyer",
    status: "new",
    source: "website",
    property_types: [],
    created_by: staff.userId,
  });
  await logClientActivity({ clientId, type: "note", body: "Client created from member account.", actorId: staff.userId });
  redirect(`/admin/clients/${clientId}`);
}

// ---------------------------------------------------------------------------
// Own password (any staff)
// ---------------------------------------------------------------------------

export async function changeOwnPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  if (await tooManyAttempts("password_change", staff.userId, 5, 15)) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  }
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const u = await db.one<{ password_hash: string | null; name: string | null }>("SELECT password_hash, name FROM users WHERE id = ?", [staff.userId]);
  const valid = await verifyPassword(current, u?.password_hash ?? null);
  await recordAttempt("password_change", staff.userId, valid);
  if (!valid) return { ok: false, error: "Your current password is incorrect." };
  if (next !== confirm) return { ok: false, error: "New passwords don't match." };
  if (next === current) return { ok: false, error: "Choose a password you haven't used here." };
  const problem = passwordProblem(next, staff);
  if (problem) return { ok: false, error: problem };

  await db.update("users", { password_hash: await hashPassword(next), password_changed_at: new Date() }, "id = ?", [staff.userId]);
  // Sign out everywhere, including here, so a leaked session dies with the old password.
  await db.run("DELETE FROM sessions WHERE user_id = ?", [staff.userId]);
  if (mailConfigured || process.env.NODE_ENV !== "production") {
    await sendMail({ to: staff.email, ...passwordChangedEmail({ name: u?.name ?? null }) }).catch(() => {});
  }
  await endSession("admin");
  redirect("/admin/login");
}
