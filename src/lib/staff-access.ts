import "server-only";
import { db } from "./db";
import type { Staff } from "./auth";

/**
 * Private files of a property (original photos, visit photos, documents): admins see
 * all of them, other staff only those of a property they were sent to visit.
 */
export async function canSeePropertyFiles(staff: Pick<Staff, "role" | "userId">, propertyId: string) {
  if (staff.role === "admin") return true;
  return (await db.count("SELECT COUNT(*) FROM site_verifications WHERE property_id = ? AND assigned_to = ?", [propertyId, staff.userId])) > 0;
}
