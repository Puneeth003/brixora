// Public, non-secret site settings. Values come from NEXT_PUBLIC_* env vars.

export const site = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Brixora",
  tagline: "Verified properties. One trusted point of contact.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  defaultCity: process.env.NEXT_PUBLIC_DEFAULT_CITY || "Mangalore",
  brokerage: {
    phone: process.env.NEXT_PUBLIC_BROKERAGE_PHONE || "",
    whatsapp: (process.env.NEXT_PUBLIC_BROKERAGE_WHATSAPP || "").replace(/\D/g, ""),
    email: process.env.NEXT_PUBLIC_BROKERAGE_EMAIL || "",
    address: process.env.NEXT_PUBLIC_BROKERAGE_ADDRESS || "",
    reraNo: process.env.NEXT_PUBLIC_BROKERAGE_RERA || "",
  },
};

export function whatsappLink(text: string) {
  if (!site.brokerage.whatsapp) return null;
  return `https://wa.me/${site.brokerage.whatsapp}?text=${encodeURIComponent(text)}`;
}

export function publicImageUrl(path: string | null | undefined) {
  if (!path) return null;
  // Demo / seed images ship with the app.
  if (path.startsWith("/samples/")) return path;
  return `/media/${path}`;
}

export function propertyUrl(ref: string) {
  return `${site.url}/properties/${ref}`;
}
