import type { ListingType } from "./types";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function trim(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** ₹1.25 Cr, ₹45 L, ₹25,000/month */
export function formatPrice(price: number, listingType?: ListingType) {
  let text: string;
  if (price >= 1_00_00_000) text = `₹${trim(price / 1_00_00_000)} Cr`;
  else if (price >= 1_00_000) text = `₹${trim(price / 1_00_000)} L`;
  else text = `₹${inr.format(price)}`;
  return listingType === "rent" ? `${text}/month` : text;
}

export function formatNumber(n: number) {
  return inr.format(n);
}

// Dates are always shown in India time. Without an explicit zone they follow the machine
// rendering them: UTC on the server, the visitor's zone in the browser.
const DISPLAY_TIME_ZONE = "Asia/Kolkata";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Indian mobile numbers to E.164 digits without "+": 9876543210 → 919876543210. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return null;
}

export function displayPhone(phone: string | null | undefined) {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
