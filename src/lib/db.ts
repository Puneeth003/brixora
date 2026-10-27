import "server-only";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type TypeCastField } from "mysql2/promise";

// MySQL access for server code only. The database user must never be reachable from a
// browser: authorise the caller (requireAdmin / requireOwner + ownership) before any
// query that touches private data. Public pages read only the public_* views.
//
// Rows come back normalised: DATETIME → ISO string (UTC),
// DATE → "YYYY-MM-DD", TINYINT(1) → boolean, JSON columns → parsed values.

export const dbConfigured = Boolean(process.env.DATABASE_URL);

// JSON columns, by name. Parsed here so MariaDB (which stores JSON as LONGTEXT) and
// MySQL behave the same.
const JSON_COLUMNS = new Set(["amenities", "original_submission", "proposed", "payload", "diff", "property_types", "checklist"]);

function typeCast(field: TypeCastField, next: () => unknown) {
  if (JSON_COLUMNS.has(field.name)) {
    const s = field.string("utf8");
    if (s === null) return null;
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  switch (field.type) {
    case "DATETIME":
    case "TIMESTAMP": {
      const s = field.string();
      return s === null ? null : new Date(`${s.replace(" ", "T")}Z`).toISOString();
    }
    case "DATE":
      return field.string();
    case "TINY":
      if (field.length === 1) {
        const s = field.string();
        return s === null ? null : s === "1";
      }
      return next();
    case "NEWDECIMAL": {
      const s = field.string();
      return s === null ? null : Number(s);
    }
    case "LONGLONG": {
      // BIGINT / COUNT(*). Prices fit comfortably in a JS number.
      const s = field.string();
      return s === null ? null : Number(s);
    }
    default:
      return next();
  }
}

const globalForDb = globalThis as unknown as { __brixoraPool?: Pool };

function pool(): Pool {
  if (!dbConfigured) throw new Error("DATABASE_URL is not set");
  if (!globalForDb.__brixoraPool) {
    const p = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: Number(process.env.DATABASE_POOL_SIZE) || 5,
      waitForConnections: true,
      timezone: "Z",
      dateStrings: false,
      charset: "utf8mb4_unicode_ci",
      typeCast,
      enableKeepAlive: true,
      ...(process.env.DATABASE_SSL === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
    });
    // NOW() and CURRENT_TIMESTAMP must be UTC, matching the values the app writes.
    p.pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
    globalForDb.__brixoraPool = p;
  }
  return globalForDb.__brixoraPool;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** ISO timestamps → Date (written as UTC), arrays/objects → JSON for JSON columns. */
function toDbValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "string" && ISO_RE.test(v)) return new Date(v);
  if (v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}

/** Params for `?` placeholders. Arrays stay arrays so `IN (?)` expands. */
function params(values: unknown[]) {
  return values.map((v) => (Array.isArray(v) ? v.map(toDbValue) : toDbValue(v)));
}

type Queryable = Pool | PoolConnection;

export type Db = {
  /** All rows. */
  all<T>(sql: string, values?: unknown[]): Promise<T[]>;
  /** First row or null. */
  one<T>(sql: string, values?: unknown[]): Promise<T | null>;
  /** The first column of the first row as a number (COUNT(*) etc). */
  count(sql: string, values?: unknown[]): Promise<number>;
  /** INSERT / UPDATE / DELETE. */
  run(sql: string, values?: unknown[]): Promise<ResultSetHeader>;
  /** INSERT INTO table SET … from an object (undefined keys skipped). */
  insert(table: Table, row: Record<string, unknown>): Promise<ResultSetHeader>;
  /** UPDATE table SET … WHERE <where>. Returns affected rows. */
  update(table: Table, set: Record<string, unknown>, where: string, values?: unknown[]): Promise<number>;
};

export type Table =
  | "app_config"
  | "users"
  | "sessions"
  | "otp_codes"
  | "auth_attempts"
  | "builders"
  | "projects"
  | "properties"
  | "change_requests"
  | "property_images"
  | "enquiries"
  | "messages"
  | "activity_log"
  | "clients"
  | "client_activities"
  | "password_resets"
  | "enquiry_messages"
  | "saved_properties"
  | "site_verifications"
  | "site_verification_photos";

function setClause(row: Record<string, unknown>) {
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  if (!keys.length) throw new Error("empty row");
  for (const k of keys) if (!/^[a-z_]+$/.test(k)) throw new Error(`bad column ${k}`);
  return { sql: keys.map((k) => `\`${k}\` = ?`).join(", "), values: keys.map((k) => toDbValue(row[k])) };
}

function bind(q: () => Queryable): Db {
  const db: Db = {
    async all<T>(sql: string, values: unknown[] = []) {
      const [rows] = await q().query(sql, params(values));
      return rows as T[];
    },
    async one<T>(sql: string, values: unknown[] = []) {
      const rows = await db.all<T>(sql, values);
      return rows[0] ?? null;
    },
    async count(sql: string, values: unknown[] = []) {
      const row = await db.one<Record<string, unknown>>(sql, values);
      return row ? Number(Object.values(row)[0]) || 0 : 0;
    },
    async run(sql: string, values: unknown[] = []) {
      const [res] = await q().query(sql, params(values));
      return res as ResultSetHeader;
    },
    async insert(table: Table, row: Record<string, unknown>) {
      const set = setClause(row);
      return db.run(`INSERT INTO \`${table}\` SET ${set.sql}`, set.values);
    },
    async update(table: Table, row: Record<string, unknown>, where: string, values: unknown[] = []) {
      const set = setClause(row);
      const res = await db.run(`UPDATE \`${table}\` SET ${set.sql} WHERE ${where}`, [...set.values, ...values]);
      return res.affectedRows;
    },
  };
  return db;
}

/** Pooled access for single statements. */
export const db: Db = bind(pool);

/** Runs `fn` in a transaction; commits on success, rolls back on throw. */
export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(bind(() => conn));
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

export const uuid = () => crypto.randomUUID();

/** Escapes LIKE wildcards in user input; wrap the result in %…% yourself. */
export function likeEscape(term: string) {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Next reference number, e.g. BRX-2026-0042. Atomic across concurrent submissions. */
export async function nextReferenceNo() {
  // LAST_INSERT_ID(expr) hands the new value back in this statement's OK packet, so no
  // second query (which could land on another pooled connection) is needed.
  const res = await db.run("UPDATE app_config SET value = LAST_INSERT_ID(CAST(value AS UNSIGNED) + 1) WHERE name = 'ref_seq'");
  const n = res.insertId;
  const prefix = (await configValue("ref_prefix")) ?? "BRX";
  return `${prefix}-${new Date().getUTCFullYear()}-${String(n).padStart(4, "0")}`;
}

export async function configValue(name: string) {
  return (await db.one<{ value: string }>("SELECT value FROM app_config WHERE name = ?", [name]))?.value ?? null;
}
