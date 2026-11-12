// Pure helpers for the admin Activity page: filter parsing, date periods, diff wording
// and burst grouping. No runtime imports, so `npm test` can load this file directly.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export type Kind = "all" | "crm" | "listings" | "admin";

export const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "crm", label: "Clients (CRM)" },
  { value: "listings", label: "Listings" },
  { value: "admin", label: "Accounts & settings" },
];

/** activity_log entity types shown under "Accounts & settings"; every other type is a listing entry. */
export const ADMIN_ENTITIES = ["user", "settings", "client"] as const;

/**
 * Action-type filter. `crm` / `log` are fixed SQL conditions on that half of the feed
 * (client_activities `ca`, activity_log `al`); null means that half has no such entries.
 */
export const ACTION_FILTERS: { value: string; label: string; crm: string | null; log: string | null }[] = [
  { value: "enquiries", label: "Website enquiries", crm: "ca.type = 'enquiry'", log: null },
  { value: "contacts", label: "Calls, meetings & messages", crm: "ca.type IN ('call', 'meeting', 'site_visit', 'whatsapp', 'email')", log: null },
  { value: "notes", label: "Notes & status changes", crm: "ca.type IN ('note', 'status', 'assigned')", log: null },
  { value: "submissions", label: "Submissions & change requests", crm: null, log: "(al.action = 'submitted' OR al.action LIKE 'change_requested:%')" },
  { value: "approvals", label: "Approvals", crm: null, log: "(al.action = 'approved' OR al.action LIKE 'change_approved:%')" },
  { value: "rejections", label: "Rejections", crm: null, log: "(al.action = 'rejected' OR al.action LIKE 'change_rejected:%')" },
  { value: "verification", label: "Site verification", crm: null, log: "(al.action = 'verified_on_site' OR al.action LIKE 'verification_%')" },
  {
    value: "edits",
    label: "Edits & photos",
    crm: null,
    log: "(al.entity_type NOT IN ('user', 'settings') AND (al.action IN ('edited', 'created', 'featured', 'unfeatured', 'expiry_extended', 'restored') OR al.action LIKE 'photo_%'))",
  },
  { value: "removals", label: "Sold, removed & expired", crm: null, log: "al.action IN ('sold', 'archived', 'removed_from_website', 'deleted', 'expired')" },
  { value: "accounts", label: "Users & access", crm: null, log: "(al.entity_type = 'user' AND al.action <> 'signed_in')" },
  { value: "signins", label: "Sign-ins", crm: null, log: "al.action = 'signed_in'" },
  { value: "settings", label: "Settings", crm: null, log: "al.entity_type = 'settings'" },
];

export type Period = "week" | "month" | "quarter";

export const PERIODS: { value: Period; label: string; phrase: string }[] = [
  { value: "week", label: "Week", phrase: "this week" },
  { value: "month", label: "Month", phrase: "this month" },
  { value: "quarter", label: "Quarter", phrase: "this quarter" },
];

/** "YYYY-MM-DD" of an instant, in India time. */
export function istDayKey(ms: number) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight (India) of a "YYYY-MM-DD" day as a UTC ISO timestamp, or null if it isn't a real date. */
export function istDayStart(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime()) || istDayKey(d.getTime()) !== ymd) return null;
  return d.toISOString();
}

/** Start of the current week (Monday), month or calendar quarter in India, as a UTC ISO timestamp. */
export function periodStart(period: Period, nowMs: number) {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  if (period === "week") ist.setTime(ist.getTime() - ((ist.getUTCDay() + 6) % 7) * DAY_MS);
  else if (period === "month") ist.setUTCDate(1);
  else ist.setUTCMonth(Math.floor(ist.getUTCMonth() / 3) * 3, 1);
  return new Date(ist.getTime() - IST_OFFSET_MS).toISOString();
}

export type FeedFilters = {
  kind: Kind;
  /** Staff user id, or "". */
  person: string;
  /** An ACTION_FILTERS value, or "". */
  action: string;
  /** Search text, or "". */
  q: string;
  /** First and last day shown, "YYYY-MM-DD" in India time, or "". */
  from: string;
  to: string;
  /** Period for the performance figures. */
  period: Period;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

/** Reads the page's query string. Anything unrecognised falls back to "no filter". */
export function parseFeedFilters(sp: RawParams, isPerson: (id: string) => boolean): FeedFilters {
  const str = (key: string) => {
    const v = sp[key];
    return typeof v === "string" ? v.trim() : "";
  };
  let from = istDayStart(str("from")) ? str("from") : "";
  let to = istDayStart(str("to")) ? str("to") : "";
  if (from && to && from > to) [from, to] = [to, from];
  const person = str("person");
  return {
    kind: KINDS.find((k) => k.value === str("kind"))?.value ?? "all",
    person: person && isPerson(person) ? person : "",
    action: ACTION_FILTERS.find((a) => a.value === str("action"))?.value ?? "",
    q: str("q").slice(0, 80),
    from,
    to,
    period: PERIODS.find((p) => p.value === str("period"))?.value ?? "month",
    page: Math.max(1, Math.min(10_000, Number.parseInt(str("page") || "1", 10) || 1)),
  };
}

/** The date filter as timestamps: `since` inclusive, `until` exclusive. */
export function feedRange(f: Pick<FeedFilters, "from" | "to">) {
  const toStart = f.to ? istDayStart(f.to) : null;
  return {
    since: (f.from && istDayStart(f.from)) || undefined,
    until: toStart ? new Date(new Date(toStart).getTime() + DAY_MS).toISOString() : undefined,
  };
}

/** True when any filter narrows the feed (the performance period doesn't). */
export function isFiltered(f: FeedFilters) {
  return f.kind !== "all" || Boolean(f.person || f.action || f.q || f.from || f.to);
}

/** Query-string values for links that keep the current filters (defaults left out). */
export function filterQuery(f: FeedFilters, over: Partial<FeedFilters> = {}): Record<string, string | undefined> {
  const m = { ...f, ...over };
  return {
    person: m.person || undefined,
    kind: m.kind === "all" ? undefined : m.kind,
    action: m.action || undefined,
    q: m.q || undefined,
    from: m.from || undefined,
    to: m.to || undefined,
    period: m.period === "month" ? undefined : m.period,
  };
}

export function toQueryString(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Diff wording
// ---------------------------------------------------------------------------

export type DiffFormat = { price(n: number): string; date(iso: string): string; dateTime(iso: string): string };

const MONEY_KEY = /price|rent|deposit|maintenance|budget/;
const DATE_KEY = /(_at|_date|_on)$/;
const MAX_FIELDS = 4;
const LONG_TEXT = 40;

function isChange(v: unknown): v is { from: unknown; to: unknown } {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v) && "from" in (v as object) && "to" in (v as object);
}

function fieldLabel(key: string) {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One side of a change as short text, or null when it's too long or structured to show inline. */
function shortValue(key: string, v: unknown, fmt: DiffFormat): string | null {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return MONEY_KEY.test(key) ? fmt.price(v) : String(v);
  if (typeof v === "string") {
    // Switches kept as "0" / "1" in app_config.
    if (key.startsWith("require_") && (v === "0" || v === "1")) return v === "1" ? "on" : "off";
    if (DATE_KEY.test(key) && !Number.isNaN(new Date(v).getTime())) return fmt.date(v);
    if (v.length > LONG_TEXT) return null;
    // Stored codes such as "under_construction" read better with spaces.
    return /^[a-z]+(_[a-z]+)+$/.test(v) ? v.replace(/_/g, " ") : v;
  }
  return null;
}

/** "Price ₹85 L → ₹82 L · Bedrooms 2 → 3 · Description updated · +2 more" */
function changedFields(d: Record<string, unknown>, fmt: DiffFormat) {
  const keys = Object.keys(d).filter((k) => k !== "request_id");
  const parts = keys.slice(0, MAX_FIELDS).map((key) => {
    const v = d[key];
    // A plain note rather than a from/to pair, e.g. { password: "reset" }.
    if (!isChange(v)) return typeof v === "string" && v.length <= LONG_TEXT ? `${fieldLabel(key)} ${v}` : fieldLabel(key);
    const from = shortValue(key, v.from, fmt);
    const to = shortValue(key, v.to, fmt);
    return from === null || to === null ? `${fieldLabel(key)} updated` : `${fieldLabel(key)} ${from} → ${to}`;
  });
  if (keys.length > MAX_FIELDS) parts.push(`+${keys.length - MAX_FIELDS} more`);
  return parts.join(" · ");
}

/** The line under a listing entry in the feed: what changed, why it was rejected, when the visit is. */
export function summariseDiff(action: string, diff: unknown, fmt: DiffFormat): string {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return "";
  const d = diff as Record<string, unknown>;
  if (action === "rejected" && typeof d.reason === "string") return d.reason;
  if (action === "verification_scheduled" || action === "verification_rescheduled") {
    const when = typeof d.visit_at === "string" ? `Visit on ${fmt.dateTime(d.visit_at)}` : "";
    const who = typeof d.assigned_to === "string" && d.assigned_to ? `assigned to ${d.assigned_to}` : "";
    return [when, who].filter(Boolean).join(" · ");
  }
  if (action === "verified_on_site" || action === "verification_issues") return typeof d.notes === "string" ? d.notes : "";
  // The name and title of a deleted item are shown as the entry's target instead.
  if (action === "deleted") return "";
  if (action === "signed_in") return typeof d.ip === "string" && d.ip ? `From ${d.ip}` : "";
  if (action === "whatsapp_connected" || action === "whatsapp_disconnected") return typeof d.number === "string" ? d.number : "";
  if (action === "invite_sent") return d.delivered === false ? "The invite could not be delivered" : "";
  if (action === "created" && typeof d.role === "string") return `Role ${d.role}`;
  if (typeof d.price === "number") return `New price ${fmt.price(d.price)}`;
  if (action.endsWith(":sold")) return "Marked as sold";
  return changedFields(d, fmt);
}

// ---------------------------------------------------------------------------
// Burst grouping
// ---------------------------------------------------------------------------

/** Per-photo log entries that are folded into one line when done in a row. */
export const BURST_VERBS: Record<string, (n: number) => string> = {
  photo_uploaded: (n) => `uploaded ${n} photos to`,
  photo_deleted: (n) => `deleted ${n} photos from`,
  photo_hidden: (n) => `hid ${n} photos on`,
  photo_shown: (n) => `unhid ${n} photos on`,
};

type BurstRow = { src: string; kind: string; actor_id: string | null; target_id: string | null; created_at: string };

/**
 * Folds runs of the same photo action by the same person on the same listing into one
 * entry with a count. `rows` are newest first; a run breaks when two neighbours are more
 * than `windowMs` apart. The newest row of each run is kept.
 */
export function groupBursts<T extends BurstRow>(rows: T[], windowMs = 10 * 60_000): { row: T; count: number }[] {
  const out: { row: T; count: number }[] = [];
  let lastAt = 0;
  for (const row of rows) {
    const at = new Date(row.created_at).getTime();
    const prev = out[out.length - 1];
    if (
      prev &&
      row.src === "log" &&
      row.kind in BURST_VERBS &&
      prev.row.src === row.src &&
      prev.row.kind === row.kind &&
      prev.row.actor_id === row.actor_id &&
      prev.row.target_id === row.target_id &&
      lastAt - at <= windowMs
    ) {
      prev.count += 1;
    } else {
      out.push({ row, count: 1 });
    }
    lastAt = at;
  }
  return out;
}
