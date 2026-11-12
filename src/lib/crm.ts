import "server-only";
import { db, uuid, type Db } from "./db";
import type { Staff } from "./auth";
import { fitsClient, inPreferredLocality, NEW_MATCH_DAYS, type MatchListing } from "./match";
import type { Client, ClientActivityType, ListingType, PropertyType } from "./types";

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
  approved_at: string | null;
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
    `SELECT id, reference_no, title, price, listing_type, locality, bedrooms, cover_path, approved_at FROM public_properties
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${rank} featured DESC, approved_at DESC LIMIT ?`,
    [...values, limit],
  );
}

// ---------------------------------------------------------------------------
// Listing → clients (the reverse of matchingListings). The rule lives in match.ts.
// ---------------------------------------------------------------------------

type LookingClient = Client & { agent_name: string | null };
type ListingForMatch = MatchRow & { property_type: PropertyType };

/** Clients still looking, within what this staff member may see (all of them when `staff` is omitted: admin pages only). */
function lookingClients(staff?: Staff) {
  const scope = staff ? clientScope(staff) : { sql: "1 = 1", values: [] };
  return db.all<LookingClient>(
    `SELECT c.*, u.name AS agent_name FROM clients c LEFT JOIN users u ON u.id = c.assigned_to
      WHERE ${scope.sql} AND c.status NOT IN ('won', 'lost') AND c.type NOT IN ('seller', 'landlord')
      ORDER BY c.updated_at DESC LIMIT 2000`,
    scope.values,
  );
}

/** "client:property" for every pair already on a timeline (shared, enquired about, visited…). */
async function contactedPairs(propertyIds: string[]) {
  if (!propertyIds.length) return new Set<string>();
  const rows = await db.all<{ client_id: string; property_id: string }>(
    "SELECT DISTINCT client_id, property_id FROM client_activities WHERE property_id IN (?)",
    [propertyIds],
  );
  return new Set(rows.map((r) => `${r.client_id}:${r.property_id}`));
}

export type NewMatch = { client: LookingClient; listing: ListingForMatch; preferred: boolean };

/**
 * Recently approved listings paired with the clients they suit, for the dashboard.
 * A pair drops off once that listing is on the client's timeline (shared, enquiry,
 * visit) or is already the listing they are interested in.
 */
export async function newMatchesFor(staff: Staff, now: number, limit = 6): Promise<{ rows: NewMatch[]; total: number }> {
  const listings = await db.all<ListingForMatch>(
    `SELECT id, reference_no, title, price, listing_type, property_type, locality, bedrooms, cover_path, approved_at
       FROM public_properties WHERE approved_at >= ? ORDER BY approved_at DESC LIMIT 100`,
    [new Date(now - NEW_MATCH_DAYS * 86_400_000)],
  );
  if (!listings.length) return { rows: [], total: 0 };

  const [clients, contacted] = await Promise.all([lookingClients(staff), contactedPairs(listings.map((l) => l.id))]);
  const pairs: NewMatch[] = [];
  for (const listing of listings) {
    const forMatch = { ...listing, price: Number(listing.price) };
    for (const client of clients) {
      if (client.property_id === listing.id || contacted.has(`${client.id}:${listing.id}`)) continue;
      if (fitsClient(client, forMatch)) pairs.push({ client, listing, preferred: inPreferredLocality(client, listing) });
    }
  }
  // Preferred-locality matches first; within each group the newest listing first (already the listing order).
  pairs.sort((a, b) => Number(b.preferred) - Number(a.preferred));
  return { rows: pairs.slice(0, limit), total: pairs.length };
}

export type ClientForListing = LookingClient & { preferred: boolean; contacted: boolean };

/** Every client a listing suits, the ones not yet told about it first. Admin pages only: not scoped to an agent. */
export async function matchingClientsFor(listing: MatchListing & { id: string }): Promise<ClientForListing[]> {
  const [clients, contacted] = await Promise.all([lookingClients(), contactedPairs([listing.id])]);
  const forMatch = { ...listing, price: Number(listing.price) };
  return clients
    .filter((c) => fitsClient(c, forMatch))
    .map((c) => ({
      ...c,
      preferred: inPreferredLocality(c, listing),
      contacted: c.property_id === listing.id || contacted.has(`${c.id}:${listing.id}`),
    }))
    .sort((a, b) => Number(a.contacted) - Number(b.contacted) || Number(b.preferred) - Number(a.preferred));
}

/** Active staff for assignment pickers. */
export function staffOptions() {
  return db.all<{ id: string; name: string | null; email: string | null; role: string; agent_type: string | null }>(
    "SELECT id, name, email, role, agent_type FROM users WHERE role IN ('admin', 'agent') AND is_active = 1 ORDER BY role, name",
  );
}
