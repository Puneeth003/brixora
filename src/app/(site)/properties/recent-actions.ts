"use server";

import { getListingsByRefs } from "@/lib/queries";
import { parseRecent } from "@/lib/recently-viewed";
import { parseCompare } from "@/lib/compare";

/** Cards for the listings a visitor chose to compare, in the order they chose them. */
export async function compareListings(refs: string[]) {
  return getListingsByRefs(parseCompare(refs));
}

/** Cards for the listings a visitor looked at recently. The list itself stays in their browser. */
export async function recentListings(refs: string[]) {
  return getListingsByRefs(parseRecent(refs));
}
