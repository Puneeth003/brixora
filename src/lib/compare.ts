// Side-by-side comparison of listings. Like recently viewed, the chosen listings are
// remembered only in the visitor's browser.

// No imports here: the tests load this file directly.

export const COMPARE_KEY = "brixora:compare";
/** How many listings fit side by side. */
export const COMPARE_MAX = 3;

const REF = /^[A-Za-z0-9-]{3,40}$/;
const isListingRef = (ref: unknown): ref is string => typeof ref === "string" && REF.test(ref);

/** A clean list of chosen references from stored text or a posted value. Never throws. */
export function parseCompare(raw: unknown): string[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isListingRef))].slice(0, COMPARE_MAX);
}

/**
 * Adds the listing, or removes it if it is already chosen. When the list is full nothing
 * changes and `full` is true, so the visitor can be told to remove one first.
 */
export function toggleCompare(list: string[], ref: string): { list: string[]; chosen: boolean; full: boolean } {
  const clean = parseCompare(list);
  if (clean.includes(ref)) return { list: clean.filter((r) => r !== ref), chosen: false, full: false };
  if (!isListingRef(ref)) return { list: clean, chosen: false, full: false };
  if (clean.length >= COMPARE_MAX) return { list: clean, chosen: false, full: true };
  return { list: [...clean, ref], chosen: true, full: false };
}

/**
 * Which columns hold the best value in a row (lowest or highest). Empty when fewer than
 * two listings have a value or when they all match: there is nothing to point out.
 */
export function bestColumns(values: (number | null | undefined)[], prefer: "low" | "high"): number[] {
  const known = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (known.length < 2) return [];
  const best = prefer === "low" ? Math.min(...known) : Math.max(...known);
  if (known.every((v) => v === best)) return [];
  return values.flatMap((v, i) => (v === best ? [i] : []));
}
