import "server-only";
import { db, uuid, type Db } from "./db";
import type { Staff } from "./auth";
import type { Client, ClientActivityType, ListingType } from "./types";

// CRM data rules. Admins see every client; an agent sees only the clients assigned to
// them. Every CRM page and action goes through clientScope / loadClientFor.

/** WHERE fragment (on alias `c`) limiting clients to what this staff member may see. */
export function clientScope(staff: Staff): { sql: string; values: unknown[] } {
  return staff.role === "admin" ? { sql: "1 = 1", values: [] } : { sql: "c.assigned_to = ?", values: [staff.userId] };
}

/** The client, if this staff member may see it. */
export async function loadClientFor(staff: Staff, clientId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const scope = clientScope(staff);
  return db.one<Client>(`SELECT c.* FROM clients c WHERE c.id = ? AND ${scope.sql}`, [clientId, ...scope.values]);
}

export async function logClientActivity(
  entry: { clientId: string; type: ClientActivityType; body?: string | null; propertyId?: string | null; actorId?: string | null },
  tx: Db = db,
) {
  await tx.insert("client_activities", {
    id: uuid(),
    client_id: entry.clientId,
    type: entry.type,
    body: entry.body ?? null,
    property_id: entry.propertyId ?? null,
    actor_id: entry.actorId ?? null,
  });
}

/**
 * Website enquiry → CRM. Finds the client by phone (or creates one), links the
 * enquiry and adds it to the client's timeline. A closed client (won/lost) who
 * enquires again is reopened as "new".
 */
export async function recordEnquiryInCrm(e: {
  enquiryId: string;
  name: string;
  phone: string;
  message: string | null;
  propertyId: string;
  listingType: ListingType;
}) {
  try {
    const existing = await db.one<{ id: string; status: string; property_id: string | null }>(
      "SELECT id, status, property_id FROM clients WHERE phone = ?",
      [e.phone],
    );
    let clientId = existing?.id;
    if (!existing) {
      clientId = uuid();
      await db.insert("clients", {
        id: clientId,
        name: e.name,
        phone: e.phone,
        type: e.listingType === "rent" ? "tenant" : "buyer",
        status: "new",
        source: "website",
        listing_type: e.listingType,
        property_types: [],
        property_id: e.propertyId,
        last_contact_at: new Date(),
      });
    } else {
      await db.update(
        "clients",
        {
          last_contact_at: new Date(),
          ...(existing.property_id ? {} : { property_id: e.propertyId }),
          ...(existing.status === "won" || existing.status === "lost" ? { status: "new", lost_reason: null } : {}),
        },
        "id = ?",
        [existing.id],
      );
    }
    await db.update("enquiries", { client_id: clientId }, "id = ?", [e.enquiryId]);
    await logClientActivity({ clientId: clientId!, type: "enquiry", body: e.message, propertyId: e.propertyId });
    return clientId!;
  } catch (err) {
    // The enquiry itself is already saved; the CRM link must never fail it.
    console.error("[crm] enquiry link failed", err);
    return null;
  }
}

export type MatchRow = {
  id: string;
  reference_no: string;
  title: string;
  price: number;
  listing_type: ListingType;
  locality: string;
  bedrooms: number | null;
  cover_path: string | null;
};

/** Live listings that fit a buyer/tenant's requirements, best matches first. */
export async function matchingListings(c: Client, limit = 6) {
  if (c.type === "seller" || c.type === "landlord") return [];
  const where: string[] = [];
  const values: unknown[] = [];
  if (c.listing_type) {
    where.push("listing_type = ?");
    values.push(c.listing_type);
  }
  if (c.property_types?.length) {
    where.push("property_type IN (?)");
    values.push(c.property_types);
  }
  if (c.budget_max) {
    where.push("price <= ?");
    values.push(Math.round(c.budget_max * 1.1)); // a little headroom for negotiation
  }
  if (c.budget_min) {
    where.push("price >= ?");
    values.push(Math.round(c.budget_min * 0.8));
  }
  if (c.bedrooms) {
    where.push("(bedrooms IS NULL OR bedrooms >= ?)");
    values.push(c.bedrooms);
  }
  const localities = (c.localities ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  // Preferred localities rank first rather than excluding everything else.
  const rank = localities.length ? `(locality IN (?)) DESC,` : "";
  if (localities.length) values.push(localities);
  return db.all<MatchRow>(
    `SELECT id, reference_no, title, price, listing_type, locality, bedrooms, cover_path FROM public_properties
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${rank} featured DESC, approved_at DESC LIMIT ?`,
    [...values, limit],
  );
}

/** Active staff for assignment pickers. */
export function staffOptions() {
  return db.all<{ id: string; name: string | null; email: string | null; role: string; agent_type: string | null }>(
    "SELECT id, name, email, role, agent_type FROM users WHERE role IN ('admin', 'agent') AND is_active = 1 ORDER BY role, name",
  );
}
