"use server";

import { getListingsByRefs } from "@/lib/queries";
import { parseRecent } from "@/lib/recently-viewed";
import { parseCompare } from "@/lib/compare";
import { parseShortlist } from "@/lib/shortlist";

/** Cards for the listings a visitor chose to compare, in the order they chose them. */
export async function compareListings(refs: string[]) {
  return getListingsByRefs(parseCompare(refs));
}

/** Cards for the listings a visitor looked at recently. The list itself stays in their browser. */
export async function recentListings(refs: string[]) {
  return getListingsByRefs(parseRecent(refs));
}

/** Cards for a buyer's shortlist (kept in their browser). Listings no longer live drop out. */
export async function shortlistListings(refs: string[]) {
  return getListingsByRefs(parseShortlist(refs));
}
