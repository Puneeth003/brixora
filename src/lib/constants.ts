import type { Furnishing, ListingType, PropertyStatus, PropertyType } from "./types";

export const LISTING_TYPES: { value: ListingType; label: string }[] = [
  { value: "sale", label: "Buy" },
  { value: "rent", label: "Rent" },
];

export const PROPERTY_TYPES: { value: PropertyType; label: string; residential: boolean }[] = [
  { value: "apartment", label: "Apartment", residential: true },
  { value: "villa", label: "Villa", residential: true },
  { value: "independent_house", label: "Independent house", residential: true },
  { value: "plot", label: "Plot / land", residential: false },
  { value: "commercial", label: "Commercial building", residential: false },
  { value: "office", label: "Office space", residential: false },
  { value: "shop", label: "Shop / showroom", residential: false },
  { value: "warehouse", label: "Warehouse / godown", residential: false },
];

export const FURNISHING: { value: Furnishing; label: string }[] = [
  { value: "unfurnished", label: "Unfurnished" },
  { value: "semi_furnished", label: "Semi-furnished" },
  { value: "fully_furnished", label: "Fully furnished" },
];

export const AMENITIES = [
  "Car parking",
  "Lift",
  "Power backup",
  "Security",
  "CCTV",
  "Swimming pool",
  "Gym",
  "Clubhouse",
  "Children's play area",
  "Garden",
  "Water supply 24x7",
  "Borewell",
  "Rainwater harvesting",
  "Gated community",
  "Pet friendly",
  "Modular kitchen",
];

export const BHK_OPTIONS = [1, 2, 3, 4, 5];

export const SALE_BUDGETS = [
  { value: "0-3000000", label: "Under ₹30 L" },
  { value: "3000000-6000000", label: "₹30 L – 60 L" },
  { value: "6000000-10000000", label: "₹60 L – 1 Cr" },
  { value: "10000000-20000000", label: "₹1 Cr – 2 Cr" },
  { value: "20000000-", label: "Above ₹2 Cr" },
];

export const RENT_BUDGETS = [
  { value: "0-15000", label: "Under ₹15k" },
  { value: "15000-30000", label: "₹15k – 30k" },
  { value: "30000-60000", label: "₹30k – 60k" },
  { value: "60000-", label: "Above ₹60k" },
];

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  draft: "Draft",
  pending: "Pending review",
  under_review: "Under review",
  approved: "Live",
  rejected: "Rejected",
  sold_pending: "Sold – awaiting confirmation",
  sold: "Sold",
  archived: "Archived",
  expired: "Expired",
};

export const CHANGE_TYPE_LABELS = {
  price: "Price change",
  details: "Details update",
  sold: "Mark as sold",
} as const;

export const PHOTO_LIMITS = { min: 3, max: 15, maxBytes: 15 * 1024 * 1024 };

export const PAGE_SIZE = 12;

export function propertyTypeLabel(value: string) {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function furnishingLabel(value: string | null) {
  return FURNISHING.find((f) => f.value === value)?.label ?? null;
}

export function isResidential(type: string) {
  return PROPERTY_TYPES.find((t) => t.value === type)?.residential ?? false;
}
