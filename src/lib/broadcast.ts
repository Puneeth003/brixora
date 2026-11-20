import "server-only";
import { db, uuid } from "./db";
import { normalizeIndianPhone } from "./format";
import { sendTemplateMessage, whatsappConnection, type HeaderMedia } from "./whatsapp";

// WhatsApp broadcasts (Admin → Broadcasts), like AiSensy / Interakt campaigns: one
// approved Meta template sent to many numbers, each with its own variables.
//
//   createBroadcast()     resolves the audience into broadcast_recipients rows
//   processBroadcasts()   sends due broadcasts in small batches; called right after
//                         "Send now" (via after()) and every minute by the cron route
//   webhook               updates each recipient's delivered / read / failed, replied_at,
//                         and records STOP replies in wa_optouts
//
// Recipients are claimed with a random token (UPDATE … LIMIT), so two runners never send
// the same row. A row left "sending" by a crash is marked failed, never resent blindly:
// the message may have gone out.

// ---------------------------------------------------------------------------
// Types shared with the admin screens
// ---------------------------------------------------------------------------

export type BroadcastStatus = "scheduled" | "sending" | "paused" | "done" | "cancelled";
export type RecipientStatus = "pending" | "sending" | "sent" | "delivered" | "read" | "failed" | "skipped";

/** Who gets the broadcast. Every part is optional; the result is de-duplicated by phone. */
export type AudienceSpec = {
  /** CRM clients. Empty arrays mean "any". */
  clients?: { types: string[]; statuses: string[]; sources: string[] } | null;
  /** Website members (owner accounts with a phone). */
  members?: boolean;
  /** People who sent an enquiry in the last `days` days (null = ever). */
  enquiries?: { days: number | null } | null;
  /** Uploaded CSV / pasted numbers. `fields` holds the other CSV columns, by header. */
  contacts?: { phone: string; name?: string; fields?: Record<string, string> }[];
};

/** Where one template variable gets its value. */
export type VariableSource =
  | { kind: "text"; value: string }
  /** "name", "phone", or a CSV column header. `fallback` is used when it is empty. */
  | { kind: "field"; field: string; fallback: string };

export type BroadcastConfig = {
  /** Template text snapshot, for the preview in the report. */
  body: string;
  header: string | null;
  headerFormat: string | null;
  footer: string | null;
  buttons: string[];
  headerMedia: HeaderMedia | null;
  /** {{1}}… in the body, in order. */
  variables: VariableSource[];
  /** The text header's {{1}}, if it has one. */
  headerVariables: VariableSource[];
};

export type BroadcastInput = {
  name: string;
  template: { name: string; lang: string; category: string | null };
  config: BroadcastConfig;
  audience: AudienceSpec;
  /** ISO time, or null to send now. */
  scheduledAt: string | null;
};

export type Contact = { phone: string; name: string | null; fields: Record<string, string> };

export type AudienceResult = {
  contacts: Contact[];
  optedOut: number;
  invalid: number;
  duplicates: number;
};

export type BroadcastCounts = Record<RecipientStatus, number> & { total: number; replied: number };

export type BroadcastRow = {
  id: string;
  name: string;
  template_name: string;
  template_lang: string;
  template_category: string | null;
  config: BroadcastConfig;
  audience: AudienceSpec;
  status: BroadcastStatus;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type RecipientRow = {
  id: number;
  phone: string;
  name: string | null;
  params: { body: string[]; header: string[] };
  status: RecipientStatus;
  error: string | null;
  sent_at: string | null;
  replied_at: string | null;
  updated_at: string;
};

export const MAX_RECIPIENTS = 10_000;

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

/** Digits with country code; 10-digit Indian numbers get 91. Null if not a usable number. */
export function cleanPhone(input: string): string | null {
  const indian = normalizeIndianPhone(input);
  if (indian) return indian;
  const digits = input.replace(/\D/g, "");
  return /^[1-9]\d{9,14}$/.test(digits) && !/^91/.test(digits) ? digits : null;
}

export async function optedOutPhones(): Promise<Set<string>> {
  const rows = await db.all<{ phone: string }>(
    "SELECT phone FROM wa_optouts UNION SELECT phone FROM users WHERE wa_opt_out = 1 AND phone IS NOT NULL",
  );
  return new Set(rows.map((r) => r.phone));
}

/** The people an audience spec covers, de-duplicated, without opted-out numbers. */
export async function resolveAudience(spec: AudienceSpec): Promise<AudienceResult> {
  const raw: { phone: string; name: string | null; fields: Record<string, string> }[] = [];

  if (spec.clients) {
    const where: string[] = [];
    const values: unknown[] = [];
    const filter = (column: string, list: string[]) => {
      if (list.length) {
        where.push(`${column} IN (?)`);
        values.push(list);
      }
    };
    filter("type", spec.clients.types);
    filter("status", spec.clients.statuses);
    filter("source", spec.clients.sources);
    const rows = await db.all<{ name: string; phone: string; email: string | null; localities: string | null }>(
      `SELECT name, phone, email, localities FROM clients ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at`,
      values,
    );
    for (const r of rows) raw.push({ phone: r.phone, name: r.name, fields: { email: r.email ?? "", localities: r.localities ?? "" } });
  }

  if (spec.members) {
    const rows = await db.all<{ name: string | null; phone: string; email: string | null }>(
      "SELECT name, phone, email FROM users WHERE role = 'owner' AND phone IS NOT NULL ORDER BY created_at",
    );
    for (const r of rows) raw.push({ phone: r.phone, name: r.name, fields: { email: r.email ?? "" } });
  }

  if (spec.enquiries) {
    const days = spec.enquiries.days;
    const rows = await db.all<{ name: string; phone: string }>(
      `SELECT name, phone FROM enquiries ${days ? "WHERE created_at > ?" : ""} ORDER BY created_at DESC`,
      days ? [new Date(Date.now() - days * 86_400_000)] : [],
    );
    for (const r of rows) raw.push({ phone: r.phone, name: r.name, fields: {} });
  }

  for (const c of spec.contacts ?? []) raw.push({ phone: c.phone, name: c.name?.trim() || null, fields: c.fields ?? {} });

  const optedOutSet = await optedOutPhones();
  const seen = new Map<string, Contact>();
  let invalid = 0;
  let duplicates = 0;
  let optedOut = 0;
  for (const r of raw) {
    const phone = cleanPhone(r.phone);
    if (!phone) {
      invalid++;
      continue;
    }
    const existing = seen.get(phone);
    if (existing) {
      duplicates++;
      // Keep the first row, but fill in a missing name or fields from later ones.
      if (!existing.name && r.name) existing.name = r.name;
      for (const [k, v] of Object.entries(r.fields)) if (v && !existing.fields[k]) existing.fields[k] = v;
      continue;
    }
    if (optedOutSet.has(phone)) {
      optedOut++;
      seen.set(phone, { phone: "", name: null, fields: {} }); // counted once
      continue;
    }
    seen.set(phone, { phone, name: r.name, fields: { ...r.fields } });
  }
  return { contacts: [...seen.values()].filter((c) => c.phone), optedOut, invalid, duplicates };
}

/** Fills each variable for one contact. Meta rejects empty values, so "-" is the last resort. */
export function resolveVariables(sources: VariableSource[], c: Contact): string[] {
  return sources.map((s) => {
    let v = "";
    if (s.kind === "text") v = s.value;
    else if (s.field === "name") v = c.name ?? "";
    else if (s.field === "phone") v = `+${c.phone}`;
    else v = c.fields[s.field] ?? "";
    v = v.replace(/\s*\n\s*/g, " ").replace(/\s{5,}/g, "    ").trim();
    if (!v && s.kind === "field") v = s.fallback.trim();
    return v || "-";
  });
}

// ---------------------------------------------------------------------------
// Create / control
// ---------------------------------------------------------------------------

export async function createBroadcast(input: BroadcastInput, createdBy: string | null) {
  const { contacts } = await resolveAudience(input.audience);
  if (!contacts.length) throw new Error("No one to send to: the audience is empty after removing invalid and opted-out numbers.");
  if (contacts.length > MAX_RECIPIENTS) throw new Error(`Too many recipients (${contacts.length}). The limit is ${MAX_RECIPIENTS} per broadcast.`);

  const id = uuid();
  // The audience is stored without the uploaded rows themselves (they're in recipients).
  const audience: AudienceSpec = { ...input.audience, contacts: undefined };
  const uploaded = input.audience.contacts?.length ?? 0;
  await db.insert("broadcasts", {
    id,
    name: input.name,
    template_name: input.template.name,
    template_lang: input.template.lang,
    template_category: input.template.category,
    config: input.config,
    audience: { ...audience, uploaded },
    status: "scheduled",
    scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
    created_by: createdBy,
  });
  for (let i = 0; i < contacts.length; i += 500) {
    const chunk = contacts.slice(i, i + 500);
    // Flat placeholders: db params would JSON-encode nested row arrays.
    await db.run(
      `INSERT IGNORE INTO broadcast_recipients (broadcast_id, phone, name, params) VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
      chunk.flatMap((c) => [
        id,
        c.phone,
        c.name?.slice(0, 120) ?? null,
        JSON.stringify({ body: resolveVariables(input.config.variables, c), header: resolveVariables(input.config.headerVariables, c) }),
      ]),
    );
  }
  return { id, recipients: contacts.length };
}

export async function getBroadcast(id: string) {
  return db.one<BroadcastRow>(
    `SELECT b.*, u.name AS created_by_name FROM broadcasts b LEFT JOIN users u ON u.id = b.created_by WHERE b.id = ?`,
    [id],
  );
}

/** Recipient counts per status for the given broadcasts. */
export async function broadcastCounts(ids: string[]): Promise<Map<string, BroadcastCounts>> {
  const out = new Map<string, BroadcastCounts>();
  if (!ids.length) return out;
  const empty = (): BroadcastCounts => ({ total: 0, replied: 0, pending: 0, sending: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0 });
  const rows = await db.all<{ broadcast_id: string; status: RecipientStatus; n: number; replied: number }>(
    `SELECT broadcast_id, status, COUNT(*) AS n, SUM(replied_at IS NOT NULL) AS replied
       FROM broadcast_recipients WHERE broadcast_id IN (?) GROUP BY broadcast_id, status`,
    [ids],
  );
  for (const id of ids) out.set(id, empty());
  for (const r of rows) {
    const c = out.get(r.broadcast_id)!;
    c[r.status] = Number(r.n);
    c.total += Number(r.n);
    c.replied += Number(r.replied) || 0;
  }
  return out;
}

export async function setBroadcastStatus(id: string, from: BroadcastStatus[], to: BroadcastStatus) {
  const extra = to === "cancelled" ? ", finished_at = UTC_TIMESTAMP(3)" : "";
  const res = await db.run(`UPDATE broadcasts SET status = ?${extra} WHERE id = ? AND status IN (?)`, [to, id, from]);
  if (to === "cancelled" && res.affectedRows) {
    await db.run("UPDATE broadcast_recipients SET status = 'skipped', error = 'Broadcast cancelled' WHERE broadcast_id = ? AND status = 'pending'", [id]);
  }
  return res.affectedRows > 0;
}

/** Puts failed recipients back in the queue and starts the broadcast again. */
export async function retryFailedRecipients(id: string) {
  const res = await db.run(
    "UPDATE broadcast_recipients SET status = 'pending', error = NULL, claim = NULL, wa_message_id = NULL WHERE broadcast_id = ? AND status = 'failed'",
    [id],
  );
  if (res.affectedRows) {
    await db.run("UPDATE broadcasts SET status = 'sending', finished_at = NULL WHERE id = ? AND status IN ('done', 'paused', 'sending')", [id]);
  }
  return res.affectedRows;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const BATCH = 40;
const CONCURRENCY = 8;
/** Stop after this long; the caller (or the next cron run) continues. */
const TIME_BUDGET_MS = 50_000;

let running: Promise<number> | null = null;

/**
 * Sends what's due; returns how many recipients were processed (0 = nothing left now).
 * Safe to call often: one runner per process, rows claimed atomically.
 */
export function processBroadcasts(): Promise<number> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<number> {
  const started = Date.now();
  let sent = 0;

  // Rows a crashed runner left half-way: the message may have gone out, so don't resend.
  await db.run(
    `UPDATE broadcast_recipients SET status = 'failed', error = 'Interrupted while sending. Use "Retry failed" to send again.'
      WHERE status = 'sending' AND claimed_at < ?`,
    [new Date(Date.now() - 10 * 60_000)],
  );

  await db.run(
    "UPDATE broadcasts SET status = 'sending', started_at = COALESCE(started_at, UTC_TIMESTAMP(3)) WHERE status = 'scheduled' AND scheduled_at <= UTC_TIMESTAMP(3)",
  );

  const conn = await whatsappConnection();
  const active = await db.all<{ id: string; template_name: string; template_lang: string; config: BroadcastConfig }>(
    "SELECT id, template_name, template_lang, config FROM broadcasts WHERE status = 'sending' ORDER BY scheduled_at",
  );

  for (const b of active) {
    while (Date.now() - started < TIME_BUDGET_MS) {
      // Paused or cancelled meanwhile?
      const still = await db.one<{ status: BroadcastStatus }>("SELECT status FROM broadcasts WHERE id = ?", [b.id]);
      if (still?.status !== "sending") break;

      const claim = uuid();
      await db.run(
        `UPDATE broadcast_recipients SET status = 'sending', claim = ?, claimed_at = UTC_TIMESTAMP(3)
          WHERE broadcast_id = ? AND status = 'pending' ORDER BY id LIMIT ${BATCH}`,
        [claim, b.id],
      );
      const rows = await db.all<{ id: number; phone: string; params: { body?: string[]; header?: string[] } }>(
        "SELECT id, phone, params FROM broadcast_recipients WHERE claim = ? AND status = 'sending'",
        [claim],
      );
      if (!rows.length) break;
      sent += rows.length;

      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
          rows.slice(i, i + CONCURRENCY).map(async (r) => {
            const result = await sendTemplateMessage(
              r.phone,
              { name: b.template_name, lang: b.template_lang, body: r.params?.body ?? [], header: r.params?.header ?? [], media: b.config.headerMedia },
              conn,
            );
            await db.run(
              result.ok
                ? "UPDATE broadcast_recipients SET status = 'sent', wa_message_id = ?, error = NULL, sent_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'sending'"
                : "UPDATE broadcast_recipients SET status = 'failed', error = ? WHERE id = ? AND status = 'sending'",
              [result.ok ? result.waMessageId : result.error.slice(0, 2000), r.id],
            );
          }),
        );
      }
    }

    const left = await db.count("SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = ? AND status IN ('pending', 'sending')", [b.id]);
    if (!left) await db.run("UPDATE broadcasts SET status = 'done', finished_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'sending'", [b.id]);
    if (Date.now() - started >= TIME_BUDGET_MS) break;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Webhook hooks
// ---------------------------------------------------------------------------

const RANK: Record<string, number> = { pending: 0, sending: 0, sent: 1, delivered: 2, read: 3 };

/** Delivery status from Meta for a broadcast message. Returns false if it isn't one. */
export async function recordBroadcastStatus(waMessageId: string, status: string, error: string | null) {
  const row = await db.one<{ id: number; status: RecipientStatus }>("SELECT id, status FROM broadcast_recipients WHERE wa_message_id = ? LIMIT 1", [waMessageId]);
  if (!row) return false;
  if (status === "failed") {
    if ((RANK[row.status] ?? 0) < RANK.delivered) await db.run("UPDATE broadcast_recipients SET status = 'failed', error = ? WHERE id = ?", [error ?? "failed", row.id]);
  } else if (status in RANK && RANK[status] > (RANK[row.status] ?? -1)) {
    await db.run("UPDATE broadcast_recipients SET status = ?, error = NULL WHERE id = ?", [status, row.id]);
  }
  return true;
}

/** An inbound message: marks the latest broadcast to that number (last 3 days) as replied. */
export async function recordBroadcastReply(phone: string) {
  await db.run(
    `UPDATE broadcast_recipients SET replied_at = UTC_TIMESTAMP(3)
      WHERE phone = ? AND replied_at IS NULL AND sent_at > ? ORDER BY sent_at DESC LIMIT 1`,
    [phone, new Date(Date.now() - 3 * 86_400_000)],
  );
}

export async function optOut(phone: string, source: "reply" | "admin") {
  await db.run("INSERT IGNORE INTO wa_optouts (phone, source) VALUES (?, ?)", [phone, source]);
}

export async function optIn(phone: string) {
  await db.run("DELETE FROM wa_optouts WHERE phone = ?", [phone]);
}

/** Keeps sending until nothing is due (for after(): the Node server has no time limit). */
export async function drainBroadcasts() {
  try {
    for (let i = 0; i < 500; i++) if (!(await processBroadcasts())) break;
  } catch (e) {
    console.error("[broadcast] sending failed", e);
  }
}
