// The locality map on a listing. It is drawn for the locality only: the exact address of
// a property is never published, so nothing here takes a street or coordinates.
// No imports here: the tests load this file directly.

/** What a visitor can look for around the locality. */
export const NEARBY = [
  { key: "schools", label: "Schools", search: "schools" },
  { key: "hospitals", label: "Hospitals", search: "hospitals" },
  { key: "groceries", label: "Groceries", search: "supermarkets" },
  { key: "restaurants", label: "Restaurants", search: "restaurants" },
  { key: "transport", label: "Bus & rail", search: "bus stops and railway stations" },
  { key: "banks", label: "Banks & ATMs", search: "banks and ATMs" },
] as const;

export type NearbyKey = (typeof NEARBY)[number]["key"];

function place(locality: string, city: string) {
  return [locality.trim(), city.trim(), "India"].filter(Boolean).join(", ");
}

/** What to search the map for: the locality itself, or one kind of place near it. */
export function mapQuery(locality: string, city: string, nearby?: NearbyKey | null) {
  const kind = NEARBY.find((n) => n.key === nearby);
  return kind ? `${kind.search} near ${place(locality, city)}` : place(locality, city);
}

/** A Google Maps frame for that search. Needs no key. */
export function mapEmbedUrl(locality: string, city: string, nearby?: NearbyKey | null) {
  const zoom = nearby ? 14 : 13;
  return `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery(locality, city, nearby))}&z=${zoom}&output=embed`;
}

/** The same search opened in Google Maps itself. */
export function mapLink(locality: string, city: string, nearby?: NearbyKey | null) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(locality, city, nearby))}`;
}
