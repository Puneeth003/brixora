import "server-only";
import { db, likeEscape } from "@/lib/db";
import { ACTION_FILTERS, ADMIN_ENTITIES, BURST_VERBS, summariseDiff, type DiffFormat, type Kind } from "@/lib/activity-feed";
import { ACTIVITY_TYPES, WON_BODY_LIKE, label } from "@/lib/crm-constants";
import { formatPrice } from "@/lib/format";
import type { ClientActivityType } from "@/lib/types";

export type FeedRow = {
  src: "crm" | "log";
  id: string;
  kind: string;
  body: string | null;
  diff: unknown;
  created_at: string;
  actor_id: string | null;
  actor_type: "admin" | "owner" | "system" | null;
  actor_name: string | null;
  actor_role: "admin" | "agent" | "owner" | null;
  target_type: string;
  /** Null on a timeline entry whose client has since been deleted. */
  target_id: string | null;
  /** Null when the listing, builder, project, user or client no longer exists. */
  target_name: string | null;
  target_sub: string | null;
};

const STAFF = "('admin', 'agent')";
const ADMIN_ENTITY_LIST = `(${ADMIN_ENTITIES.map((e) => `'${e}'`).join(", ")})`;
/** Logged client contacts that count towards "Top performers". */
export const CONTACT_TYPES = ["call", "meeting", "site_visit", "whatsapp", "email"] as const;
/** Status-change bodies look like "Negotiation → Won". */
export const WON_LIKE = WON_BODY_LIKE;
/**
 * One win per client. A deleted client's entries have no client_id left (migration 007),
 * so each of those counts on its own.
 */
const WON_CLIENT = "COALESCE(ca.client_id, ca.id)";

/**
 * The merged feed as one UNION ALL query with a common column set. Both halves take
 * the same optional filters so counts and pages agree.
 */
export type FeedOpts = {
  kind: Kind;
  person?: string;
  /** Inclusive lower bound (ISO). */
  since?: string;
  /** Exclusive upper bound (ISO). */
  until?: string;
  staffOnly?: boolean;
  /** An ACTION_FILTERS value. */
  action?: string;
  /** Matches a client's name or note, a listing's reference, title, builder or project, or a user's name. */
  q?: string;
  /** Leave sign-ins out (the "actions" counts: signing in isn't work done). */
  noSignIns?: boolean;
};

export function feedQuery(opts: FeedOpts) {
  const crmWhere: string[] = [];
  const logWhere: string[] = ["al.action <> 'enquiry_received'"]; // already in the CRM feed as a website enquiry
  const crmParams: unknown[] = [];
  const logParams: unknown[] = [];
  const actionFilter = ACTION_FILTERS.find((a) => a.value === opts.action);
  if (actionFilter) {
    // "1 = 0": this half of the feed has no entries of that type.
    crmWhere.push(actionFilter.crm ?? "1 = 0");
    logWhere.push(actionFilter.log ?? "1 = 0");
  }
  if (opts.q) {
    const term = `%${likeEscape(opts.q)}%`;
    crmWhere.push("(c.name LIKE ? OR ca.body LIKE ?)");
    crmParams.push(term, term);
    logWhere.push("(p.reference_no LIKE ? OR p.title LIKE ? OR b.name LIKE ? OR pj.name LIKE ? OR tu.name LIKE ?)");
    logParams.push(term, term, term, term, term);
  }
  if (opts.kind === "listings") logWhere.push(`al.entity_type NOT IN ${ADMIN_ENTITY_LIST}`);
  if (opts.kind === "admin") logWhere.push(`al.entity_type IN ${ADMIN_ENTITY_LIST}`);
  if (opts.noSignIns) logWhere.push("al.action <> 'signed_in'");
  if (opts.until) {
    crmWhere.push("ca.created_at < ?");
    crmParams.push(opts.until);
    logWhere.push("al.created_at < ?");
    logParams.push(opts.until);
  }
  if (opts.person) {
    crmWhere.push("ca.actor_id = ?");
    crmParams.push(opts.person);
    logWhere.push("al.actor_id = ?");
    logParams.push(opts.person);
  }
  if (opts.since) {
    crmWhere.push("ca.created_at >= ?");
    crmParams.push(opts.since);
    logWhere.push("al.created_at >= ?");
    logParams.push(opts.since);
  }
  if (opts.staffOnly) {
    crmWhere.push(`u.role IN ${STAFF}`);
    logWhere.push(`u.role IN ${STAFF}`);
  }
  const where = (w: string[]) => (w.length ? `WHERE ${w.join(" AND ")}` : "");

  const crm = `SELECT 'crm' AS src, ca.id, ca.type AS kind, ca.body, NULL AS diff, ca.created_at, ca.actor_id,
      NULL AS actor_type, u.name AS actor_name, u.role AS actor_role,
      'client' AS target_type, ca.client_id AS target_id, c.name AS target_name, NULL AS target_sub
    FROM client_activities ca
    LEFT JOIN clients c ON c.id = ca.client_id
    LEFT JOIN users u ON u.id = ca.actor_id
    ${where(crmWhere)}`;
  const log = `SELECT 'log' AS src, al.id, al.action AS kind, NULL AS body, al.diff, al.created_at, al.actor_id,
      al.actor_type, u.name AS actor_name, u.role AS actor_role,
      al.entity_type AS target_type, al.entity_id AS target_id,
      COALESCE(p.reference_no, b.name, pj.name, tu.name, tu.email) AS target_name, p.title AS target_sub
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.actor_id
    LEFT JOIN properties p ON al.entity_type = 'property' AND p.id = al.entity_id
    LEFT JOIN builders b ON al.entity_type = 'builder' AND b.id = al.entity_id
    LEFT JOIN projects pj ON al.entity_type = 'project' AND pj.id = al.entity_id
    LEFT JOIN users tu ON al.entity_type = 'user' AND tu.id = al.entity_id
    ${where(logWhere)}`;

  if (opts.kind === "crm") return { sql: crm, params: crmParams };
  if (opts.kind === "listings" || opts.kind === "admin") return { sql: log, params: logParams };
  return { sql: `${crm}\nUNION ALL\n${log}`, params: [...crmParams, ...logParams] };
}

export function feedRows(opts: FeedOpts, limit: number, offset = 0) {
  const q = feedQuery(opts);
  return db.all<FeedRow>(`SELECT * FROM (${q.sql}) f ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...q.params, limit, offset]);
}

export async function feedPage(opts: FeedOpts, limit: number, offset: number) {
  const [rows, total] = await Promise.all([feedRows(opts, limit, offset), countFeed(opts)]);
  return { rows, total };
}

export function countFeed(opts: FeedOpts) {
  const q = feedQuery(opts);
  return db.count(`SELECT COUNT(*) FROM (${q.sql}) f`, q.params);
}

export function activeStaffSince(since: string) {
  return db.count(
    `SELECT COUNT(DISTINCT x.actor_id) FROM (
       SELECT actor_id FROM client_activities WHERE created_at >= ?
       UNION ALL
       SELECT actor_id FROM activity_log WHERE created_at >= ?
     ) x JOIN users u ON u.id = x.actor_id AND u.role IN ${STAFF}`,
    [since, since],
  );
}

export type Performer = { id: string; name: string | null; email: string | null; touches: number; won: number };

export function topPerformers(since: string) {
  return db.all<Performer>(
    `SELECT u.id, u.name, u.email,
        SUM(ca.type IN (?)) AS touches,
        COUNT(DISTINCT CASE WHEN ca.type = 'status' AND ca.body LIKE ? THEN ${WON_CLIENT} END) AS won
       FROM client_activities ca
       JOIN users u ON u.id = ca.actor_id AND u.role IN ${STAFF}
      WHERE ca.created_at >= ?
      GROUP BY u.id, u.name, u.email
     HAVING touches > 0 OR won > 0
      ORDER BY touches DESC, won DESC, u.name
      LIMIT 10`,
    [CONTACT_TYPES, WON_LIKE, since],
  );
}

/** Clients moved to "won" since `since`, by everyone or by one staff member. */
export function wonSince(since: string, userId?: string) {
  return db.count(
    `SELECT COUNT(DISTINCT ${WON_CLIENT}) FROM client_activities ca
      WHERE ca.type = 'status' AND ca.body LIKE ? AND ca.created_at >= ?${userId ? " AND ca.actor_id = ?" : ""}`,
    userId ? [WON_LIKE, since, userId] : [WON_LIKE, since],
  );
}

export type AgentStats = {
  /** Client contacts logged since `since`, by type (call, meeting, …). */
  byType: Record<string, number>;
  contacts: number;
  won: number;
  /** Clients assigned to them that are still open (not won or lost), right now. */
  openClients: number;
  listingActions: number;
  lastActiveAt: string | null;
};

/** One staff member's figures for the performance panel. */
export async function agentStats(userId: string, since: string): Promise<AgentStats> {
  const [types, won, openClients, listingActions, last] = await Promise.all([
    db.all<{ type: string; n: number }>("SELECT type, COUNT(*) AS n FROM client_activities WHERE actor_id = ? AND created_at >= ? GROUP BY type", [userId, since]),
    wonSince(since, userId),
    db.count("SELECT COUNT(*) FROM clients WHERE assigned_to = ? AND status NOT IN ('won', 'lost')", [userId]),
    db.count(`SELECT COUNT(*) FROM activity_log WHERE actor_id = ? AND created_at >= ? AND entity_type NOT IN ${ADMIN_ENTITY_LIST}`, [userId, since]),
    db.one<{ at: string | null }>(
      `SELECT MAX(x.created_at) AS at FROM (
         SELECT created_at FROM client_activities WHERE actor_id = ?
         UNION ALL
         SELECT created_at FROM activity_log WHERE actor_id = ?
       ) x`,
      [userId, userId],
    ),
  ]);
  const byType = Object.fromEntries(types.map((t) => [t.type, Number(t.n) || 0]));
  return {
    byType,
    contacts: CONTACT_TYPES.reduce((sum, t) => sum + (byType[t] ?? 0), 0),
    won,
    openClients,
    listingActions,
    lastActiveAt: last?.at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function excerpt(s: string | null | undefined, max = 140) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const CRM_VERBS: Partial<Record<ClientActivityType, string>> = {
  note: "added a note on",
  call: "logged a call with",
  whatsapp: "sent a WhatsApp to",
  email: "emailed",
  meeting: "logged a meeting with",
  site_visit: "logged a site visit with",
  status: "updated the status of",
  assigned: "reassigned",
};

const LOG_VERBS: Record<string, string> = {
  approved: "approved",
  rejected: "rejected",
  submitted: "submitted",
  edited: "edited",
  created: "created",
  deleted: "deleted",
  review_started: "started reviewing",
  featured: "featured",
  unfeatured: "unfeatured",
  expiry_extended: "extended the expiry of",
  expired: "expired",
  photo_uploaded: "uploaded a photo to",
  photo_deleted: "deleted a photo from",
  photo_hidden: "hid a photo on",
  photo_shown: "unhid a photo on",
  photo_cover_set: "changed the cover photo of",
  retried: "retried",
  verification_scheduled: "scheduled a site visit for",
  verification_rescheduled: "rescheduled the site visit for",
  verification_cancelled: "cancelled the site visit for",
  verified_on_site: "completed the site visit and verified",
  verification_issues: "found issues on the site visit for",
  archived: "archived",
  restored: "restored",
  sold: "confirmed the sale of",
  removed_from_website: "took down",
};

const CHANGE_LABEL: Record<string, string> = { price: "price change", details: "details change", sold: "sale confirmation" };

export type Entry = {
  actor: string;
  actorKind: "staff" | "owner" | "system" | "client";
  /** Text between the actor and the target. */
  verb: string;
  target: string;
  href: string | null;
  /** Optional trailing text after the target (e.g. a property title). */
  sub: string | null;
  excerpt: string;
  /** Category for the timeline dot colour. */
  tone: string;
};

function isStaff(role: FeedRow["actor_role"]) {
  return role === "admin" || role === "agent";
}

const IST = "Asia/Kolkata";

/** "27 Oct, 12:10 pm" in India time, whatever the server's timezone. */
export function istDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const DIFF_FORMAT: DiffFormat = {
  price: (n) => formatPrice(n),
  date: (iso) => new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" }),
  dateTime: istDateTime,
};

/**
 * A feed row as a sentence. `count` is how many identical photo actions the row stands
 * for (see groupBursts); `fullText` keeps the detail line unshortened (CSV export).
 */
export function describe(r: FeedRow, count = 1, fullText = false): Entry {
  const clip = (s: string | null | undefined, max = 140) => (fullText ? (s ?? "").replace(/\s+/g, " ").trim() : excerpt(s, max));
  if (r.src === "crm") {
    const type = r.kind as ClientActivityType;
    // No client row any more: the client was deleted and the entry kept for the team's figures.
    const client = r.target_name ?? "a deleted client";
    const href = r.target_name && r.target_id ? `/admin/clients/${r.target_id}` : null;
    const body = clip(r.body);
    if (type === "enquiry" || !r.actor_id) {
      return { actor: client, actorKind: "client", verb: "sent a website enquiry", target: "", href, sub: null, excerpt: body, tone: "enquiry" };
    }
    if (!isStaff(r.actor_role)) {
      return { actor: r.actor_name ?? client, actorKind: "client", verb: "sent a message", target: "", href, sub: null, excerpt: body, tone: "enquiry" };
    }
    const verb = CRM_VERBS[type] ?? `logged ${label(ACTIVITY_TYPES, type).toLowerCase()} for`;
    return { actor: r.actor_name ?? "Staff", actorKind: "staff", verb, target: client, href, sub: null, excerpt: body, tone: type };
  }

  // Older rows logged agents' site visits as "system"; a row with an actor is never the system.
  const actorKind: Entry["actorKind"] = r.actor_type === "owner" ? "owner" : r.actor_type === "system" && !r.actor_id ? "system" : "staff";
  const actor = actorKind === "system" ? "System" : (r.actor_name ?? (actorKind === "owner" ? "Owner" : "Admin"));
  const [base, change] = r.kind.split(":");
  let verb: string;
  if (change && base === "change_requested") verb = `requested a ${CHANGE_LABEL[change] ?? "change"} on`;
  else if (change && base === "change_approved") verb = `approved the ${CHANGE_LABEL[change] ?? "change"} on`;
  else if (change && base === "change_rejected") verb = `rejected the ${CHANGE_LABEL[change] ?? "change"} on`;
  else if (count > 1 && BURST_VERBS[r.kind]) verb = BURST_VERBS[r.kind](count);
  else verb = LOG_VERBS[r.kind] ?? r.kind.replace(/[_:]/g, " ");

  const entity = r.target_type;
  // What the log entry itself recorded about its target; all that is left once the row is deleted.
  const saved = r.diff && typeof r.diff === "object" && !Array.isArray(r.diff) ? (r.diff as Record<string, unknown>) : {};
  const savedText = (key: string) => (typeof saved[key] === "string" && saved[key] ? (saved[key] as string) : "");
  const exists = r.target_name !== null;
  let target = r.target_name ?? "";
  let href: string | null = null;
  let sub: string | null = null;
  if (entity === "property") {
    target ||= savedText("reference_no") || "a listing";
    sub = r.target_sub ?? (savedText("title") || null);
    if (exists) href = `/admin/properties/${r.target_id}`;
  } else if (entity === "builder" || entity === "project") {
    target ||= savedText("name");
    target = target ? `${entity} ${target}` : `a ${entity}`;
    href = "/admin/builders";
  } else if (entity === "message") {
    target = "a WhatsApp message";
    href = "/admin/messages";
  } else if (entity === "user") {
    const self = r.actor_id !== null && r.actor_id === r.target_id;
    const member = r.kind === "blocked" || r.kind === "unblocked";
    verb = (self ? SELF_VERBS[r.kind] : undefined) ?? USER_VERBS[r.kind] ?? verb;
    // "Priya signed in": the person is already the subject.
    target = self && SELF_VERBS[r.kind] ? "" : target || savedText("name") || (member ? "a member" : "a user");
    if (target && exists) href = member ? "/admin/members" : `/admin/users/${r.target_id}`;
  } else if (entity === "settings") {
    verb = SETTINGS_VERBS[r.kind] ?? verb;
    target = "";
  } else if (entity === "client") {
    verb = "deleted client";
    target = savedText("name") || "a client";
  } else {
    target ||= entity;
  }

  const tone = TONE_BY_ACTION[base] ?? "listing";
  const showDiff = entity === "property" || entity === "user" || entity === "settings";
  return {
    actor,
    actorKind,
    verb,
    target,
    href,
    sub,
    excerpt: showDiff ? clip(summariseDiff(r.kind, r.diff, DIFF_FORMAT), 220) : "",
    tone,
  };
}

/** Account entries about someone else: "<admin> deactivated <user>". */
const USER_VERBS: Record<string, string> = {
  created: "added",
  edited: "edited the account of",
  deactivated: "deactivated",
  reactivated: "reactivated",
  blocked: "blocked member",
  unblocked: "unblocked member",
  invite_sent: "sent a sign-in invite to",
};

/** Account entries where the person acted on their own account; no target is shown. */
const SELF_VERBS: Record<string, string> = {
  signed_in: "signed in",
  password_changed: "changed their password",
  password_reset: "reset their password by email",
};

const SETTINGS_VERBS: Record<string, string> = {
  settings_changed: "changed the organization settings",
  signed_out_all: "signed out all staff",
  whatsapp_connected: "connected WhatsApp",
  whatsapp_disconnected: "disconnected WhatsApp",
};

/** Timeline dot category by action (the part before any ":"); anything else is "listing". */
const TONE_BY_ACTION: Record<string, string> = {
  approved: "approved",
  change_approved: "approved",
  reactivated: "approved",
  unblocked: "approved",
  rejected: "rejected",
  change_rejected: "rejected",
  expired: "rejected",
  deleted: "rejected",
  deactivated: "rejected",
  blocked: "rejected",
  submitted: "submitted",
  change_requested: "submitted",
  signed_in: "account",
  password_changed: "account",
  password_reset: "account",
};

/** Timeline dot colours by entry category. */
export const DOT: Record<string, string> = {
  call: "bg-sky-500",
  whatsapp: "bg-emerald-500",
  email: "bg-indigo-500",
  meeting: "bg-amber-500",
  site_visit: "bg-violet-500",
  note: "bg-zinc-400",
  status: "bg-[var(--brand)]",
  assigned: "bg-teal-500",
  enquiry: "bg-sky-300",
  approved: "bg-[var(--brand)]",
  rejected: "bg-[var(--s-late)]",
  submitted: "bg-amber-400",
  listing: "bg-zinc-400",
  account: "bg-zinc-300",
};
