import "server-only";
import { db } from "@/lib/db";
import { ACTIVITY_TYPES, label } from "@/lib/crm-constants";
import { formatPrice } from "@/lib/format";
import type { ClientActivityType } from "@/lib/types";

export type Kind = "all" | "crm" | "listings";

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
  target_id: string;
  target_name: string | null;
  target_sub: string | null;
};

const STAFF = "('admin', 'agent')";
/** Logged client contacts that count towards "Top performers". */
export const CONTACT_TYPES = ["call", "meeting", "site_visit", "whatsapp", "email"] as const;
/** Status-change bodies look like "Negotiation → Won". */
export const WON_LIKE = "%→ Won";

/**
 * The merged feed as one UNION ALL query with a common column set. Both halves take
 * the same optional filters so counts and pages agree.
 */
export function feedQuery(opts: { kind: Kind; person?: string; since?: string; staffOnly?: boolean }) {
  const crmWhere: string[] = [];
  const logWhere: string[] = ["al.action <> 'enquiry_received'"]; // already in the CRM feed as a website enquiry
  const crmParams: unknown[] = [];
  const logParams: unknown[] = [];
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
    JOIN clients c ON c.id = ca.client_id
    LEFT JOIN users u ON u.id = ca.actor_id
    ${where(crmWhere)}`;
  const log = `SELECT 'log' AS src, al.id, al.action AS kind, NULL AS body, al.diff, al.created_at, al.actor_id,
      al.actor_type, u.name AS actor_name, u.role AS actor_role,
      al.entity_type AS target_type, al.entity_id AS target_id, COALESCE(p.reference_no, b.name, pj.name) AS target_name, p.title AS target_sub
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.actor_id
    LEFT JOIN properties p ON al.entity_type = 'property' AND p.id = al.entity_id
    LEFT JOIN builders b ON al.entity_type = 'builder' AND b.id = al.entity_id
    LEFT JOIN projects pj ON al.entity_type = 'project' AND pj.id = al.entity_id
    ${where(logWhere)}`;

  if (opts.kind === "crm") return { sql: crm, params: crmParams };
  if (opts.kind === "listings") return { sql: log, params: logParams };
  return { sql: `${crm}\nUNION ALL\n${log}`, params: [...crmParams, ...logParams] };
}

export async function feedPage(opts: { kind: Kind; person?: string }, limit: number, offset: number) {
  const q = feedQuery(opts);
  const [rows, total] = await Promise.all([
    db.all<FeedRow>(`SELECT * FROM (${q.sql}) f ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...q.params, limit, offset]),
    db.count(`SELECT COUNT(*) FROM (${q.sql}) f`, q.params),
  ]);
  return { rows, total };
}

export function countFeed(opts: { kind: Kind; since: string; staffOnly?: boolean }) {
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
        COUNT(DISTINCT CASE WHEN ca.type = 'status' AND ca.body LIKE ? THEN ca.client_id END) AS won
       FROM client_activities ca
       JOIN users u ON u.id = ca.actor_id AND u.role IN ${STAFF}
      WHERE ca.created_at >= ?
      GROUP BY u.id, u.name, u.email
     HAVING touches > 0 OR won > 0
      ORDER BY touches DESC, won DESC, u.name
      LIMIT 5`,
    [CONTACT_TYPES, WON_LIKE, since],
  );
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
  photo_uploaded: "uploaded photos to",
  photo_deleted: "deleted a photo from",
  photo_hidden: "hid a photo on",
  photo_shown: "unhid a photo on",
  photo_cover_set: "changed the cover photo of",
  retried: "retried",
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

function diffSummary(action: string, diff: unknown): string {
  if (!diff || typeof diff !== "object") return "";
  const d = diff as Record<string, unknown>;
  if (action === "rejected" && typeof d.reason === "string") return d.reason;
  if (typeof d.price === "number") return `New price ${formatPrice(d.price)}`;
  if (action.endsWith(":sold")) return "Marked as sold";
  if (action === "edited" || action.endsWith(":details")) {
    const keys = Object.keys(d).slice(0, 6).map((k) => k.replace(/_/g, " "));
    return keys.length ? `Changed ${keys.join(", ")}` : "";
  }
  return "";
}

export function describe(r: FeedRow): Entry {
  if (r.src === "crm") {
    const type = r.kind as ClientActivityType;
    const client = r.target_name ?? "a client";
    const href = `/admin/clients/${r.target_id}`;
    const body = excerpt(r.body);
    if (type === "enquiry" || !r.actor_id) {
      return { actor: client, actorKind: "client", verb: "sent a website enquiry", target: "", href, sub: null, excerpt: body, tone: "enquiry" };
    }
    if (!isStaff(r.actor_role)) {
      return { actor: r.actor_name ?? client, actorKind: "client", verb: "sent a message", target: "", href, sub: null, excerpt: body, tone: "enquiry" };
    }
    const verb = CRM_VERBS[type] ?? `logged ${label(ACTIVITY_TYPES, type).toLowerCase()} for`;
    return { actor: r.actor_name ?? "Staff", actorKind: "staff", verb, target: client, href, sub: null, excerpt: body, tone: type };
  }

  const actorKind: Entry["actorKind"] = r.actor_type === "system" ? "system" : r.actor_type === "owner" ? "owner" : "staff";
  const actor = actorKind === "system" ? "System" : (r.actor_name ?? (actorKind === "owner" ? "Owner" : "Admin"));
  const [base, change] = r.kind.split(":");
  let verb: string;
  if (change && base === "change_requested") verb = `requested a ${CHANGE_LABEL[change] ?? "change"} on`;
  else if (change && base === "change_approved") verb = `approved the ${CHANGE_LABEL[change] ?? "change"} on`;
  else if (change && base === "change_rejected") verb = `rejected the ${CHANGE_LABEL[change] ?? "change"} on`;
  else verb = LOG_VERBS[r.kind] ?? r.kind.replace(/[_:]/g, " ");

  const entity = r.target_type;
  let target = r.target_name ?? "";
  let href: string | null = null;
  if (entity === "property") {
    target ||= "a listing";
    href = `/admin/properties/${r.target_id}`;
  } else if (entity === "builder" || entity === "project") {
    target = target ? `${entity} ${target}` : `a ${entity}`;
    href = "/admin/builders";
  } else if (entity === "message") {
    target = "a WhatsApp message";
    href = "/admin/messages";
  } else {
    target ||= entity;
  }

  const tone = base === "approved" || base === "change_approved" ? "approved" : base === "rejected" || base === "change_rejected" || base === "expired" ? "rejected" : base === "submitted" || base === "change_requested" ? "submitted" : "listing";
  const showDiff = entity === "property";
  return {
    actor,
    actorKind,
    verb,
    target,
    href,
    sub: entity === "property" ? r.target_sub : null,
    excerpt: showDiff ? excerpt(diffSummary(r.kind, r.diff)) : "",
    tone,
  };
}

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
};
