// On-site verification checklist, shared by server and client components.

export const VERIFICATION_CHECKLIST: { key: string; label: string; required: boolean }[] = [
  { key: "owner_met", label: "Met the owner or an authorised person", required: true },
  { key: "address_matches", label: "Address and locality match the listing", required: true },
  { key: "photos_match", label: "Photos match the property as it is today", required: true },
  { key: "details_match", label: "Bedrooms, area and amenities match the listing", required: true },
  { key: "documents_seen", label: "Ownership documents seen (sale deed / khata / RTC / rental agreement)", required: false },
  { key: "access_ok", label: "Road access, parking and surroundings as described", required: false },
];

export type VerificationStatus = "scheduled" | "completed" | "cancelled";
export type VerificationResult = "verified" | "issues";
