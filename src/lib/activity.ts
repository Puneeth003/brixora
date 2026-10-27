import "server-only";
import { db, uuid } from "./db";

export async function logActivity(entry: {
  entityType: "property" | "change_request" | "enquiry" | "builder" | "project" | "message";
  entityId: string;
  action: string;
  actorType: "admin" | "owner" | "system";
  actorId?: string | null;
  diff?: Record<string, unknown> | null;
}) {
  try {
    await db.insert("activity_log", {
      id: uuid(),
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      diff: entry.diff ?? null,
    });
  } catch (error) {
    console.error("[activity] insert failed", error);
  }
}

/** Field-level diff of `next` against `prev`, for the activity log. */
export function diffFields(prev: Record<string, unknown>, next: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null)) {
      out[key] = { from: prev[key] ?? null, to: next[key] ?? null };
    }
  }
  return out;
}
