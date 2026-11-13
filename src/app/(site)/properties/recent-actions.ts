"use server";

import { getListingsByRefs } from "@/lib/queries";
import { parseRecent } from "@/lib/recently-viewed";

/** Cards for the listings a visitor looked at recently. The list itself stays in their browser. */
export async function recentListings(refs: string[]) {
  return getListingsByRefs(parseRecent(refs));
}
