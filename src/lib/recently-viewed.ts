// Recently viewed listings. The list lives only in the visitor's browser (localStorage):
// nothing about what someone looked at is stored on the server.

export const RECENT_KEY = "brixora:recently-viewed";
/** How many references are remembered. */
export const RECENT_MAX = 8;
/** How many are shown at once. */
export const RECENT_SHOWN = 3;

const REF = /^[A-Za-z0-9-]{3,40}$/;

export function isListingRef(ref: string) {
  return REF.test(ref);
}

/** A clean list of references from whatever was stored (or sent to the server). Never throws. */
export function parseRecent(raw: unknown): string[] {
  return parseRefs(raw, RECENT_MAX);
}

/** Up to `max` distinct, well-formed listing references from stored text or a posted value. */
export function parseRefs(raw: unknown, max: number): string[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !REF.test(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length === max) break;
  }
  return out;
}

/** The list with `ref` moved to the front, most recent first, capped at RECENT_MAX. */
export function addRecent(list: string[], ref: string): string[] {
  if (!isListingRef(ref)) return parseRecent(list);
  return parseRecent([ref, ...list.filter((r) => r !== ref)]);
}

/** Puts rows back in the visitor's order; anything no longer live is simply absent. */
export function inRecentOrder<T extends { reference_no: string }>(refs: string[], rows: T[]): T[] {
  const byRef = new Map(rows.map((row) => [row.reference_no, row]));
  return refs.flatMap((ref) => byRef.get(ref) ?? []);
}
