import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db, dbConfigured } from "./db";
import { site as defaults } from "./site";

// Website details edited in Settings → Organization (brand name, contact details, city).
// Stored in app_config as "site:<field>" and cached under the "site" tag; saving calls
// updateTag("site"), so pages pick up the change without a redeploy. Anything not saved
// falls back to the NEXT_PUBLIC_* build-time value in site.ts. The site URL stays an
// environment variable: it follows the domain.

export type SiteDetails = typeof defaults;

export const SITE_FIELDS = [
  { key: "name", label: "Brand name", hint: "Shown in the header, emails and page titles" },
  { key: "defaultCity", label: "City", hint: "Default city for searches and copy" },
  { key: "phone", label: "Phone", hint: "e.g. +91 98450 12345" },
  { key: "whatsapp", label: "WhatsApp", hint: "Digits with country code, e.g. 919845012345" },
  { key: "email", label: "Email", hint: "Public contact email" },
  { key: "address", label: "Office address", hint: "Shown in the footer and legal pages" },
  { key: "reraNo", label: "RERA number", hint: "Optional" },
] as const;

export type SiteField = (typeof SITE_FIELDS)[number]["key"];

/** Saved values only (for the settings form). */
export async function savedSiteDetails(): Promise<Partial<Record<SiteField, string>>> {
  if (!dbConfigured) return {};
  try {
    const rows = await db.all<{ name: string; value: string }>("SELECT name, value FROM app_config WHERE name LIKE 'site:%'");
    return Object.fromEntries(rows.map((r) => [r.name.slice("site:".length), r.value]));
  } catch (e) {
    console.error("[site] couldn't read saved details", e);
    return {};
  }
}

/** The website details: saved in Settings, else the build-time defaults. */
export async function getSite(): Promise<SiteDetails> {
  "use cache";
  cacheLife("max");
  cacheTag("site");
  const saved = await savedSiteDetails();
  const pick = (k: SiteField, fallback: string) => saved[k]?.trim() || fallback;
  return {
    ...defaults,
    name: pick("name", defaults.name),
    defaultCity: pick("defaultCity", defaults.defaultCity),
    brokerage: {
      phone: pick("phone", defaults.brokerage.phone),
      whatsapp: pick("whatsapp", defaults.brokerage.whatsapp).replace(/\D/g, ""),
      email: pick("email", defaults.brokerage.email),
      address: pick("address", defaults.brokerage.address),
      reraNo: pick("reraNo", defaults.brokerage.reraNo),
    },
  };
}

/** wa.me link to the brokerage's WhatsApp with a prefilled message, or null if none is set. */
export function whatsappLinkFor(s: SiteDetails, text: string) {
  if (!s.brokerage.whatsapp) return null;
  return `https://wa.me/${s.brokerage.whatsapp}?text=${encodeURIComponent(text)}`;
}
