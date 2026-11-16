// Buyers' shortlist. Buyers don't have accounts, so it lives only in their browser
// (localStorage), like "recently viewed".

import { isListingRef, parseRefs } from "./recently-viewed";

export const SHORTLIST_KEY = "brixora:shortlist";
export const SHORTLIST_MAX = 30;
/** Fired in the browser when the shortlist changes, so other buttons and the page update. */
export const SHORTLIST_EVENT = "brixora:shortlist-changed";

export function parseShortlist(raw: unknown): string[] {
  return parseRefs(raw, SHORTLIST_MAX);
}

export function readShortlist(): string[] {
  try {
    return parseShortlist(localStorage.getItem(SHORTLIST_KEY));
  } catch {
    return []; // storage blocked (private window, site data off)
  }
}

/** Adds or removes a listing; returns whether it is now on the shortlist, or null if storage failed. */
export function toggleShortlist(ref: string): boolean | null {
  if (!isListingRef(ref)) return null;
  const list = readShortlist();
  const on = !list.includes(ref);
  const next = on ? [ref, ...list].slice(0, SHORTLIST_MAX) : list.filter((r) => r !== ref);
  try {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(next));
  } catch {
    return null;
  }
  window.dispatchEvent(new Event(SHORTLIST_EVENT));
  return on;
}

export function clearShortlist() {
  try {
    localStorage.removeItem(SHORTLIST_KEY);
  } catch {
    // nothing to clear
  }
  window.dispatchEvent(new Event(SHORTLIST_EVENT));
}
