// Derived listing facts: "New" badge, price per sq.ft, share text (src/lib/listing-facts.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { NEW_LISTING_DAYS, byPricePerSqft, isNewOnSite, pricePerSqft, shareLinks } from "../src/lib/listing-facts.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-11-13T06:00:00Z");
const ago = (ms) => new Date(now - ms).toISOString();

test("a listing is new for its first week live", () => {
  assert.equal(NEW_LISTING_DAYS, 7);
  assert.equal(isNewOnSite(ago(0), now), true);
  assert.equal(isNewOnSite(ago(7 * DAY - 1), now), true);
  assert.equal(isNewOnSite(ago(7 * DAY), now), false);
  assert.equal(isNewOnSite(ago(30 * DAY), now), false);
});

test("missing, unreadable or future approval dates are never new", () => {
  assert.equal(isNewOnSite(null, now), false);
  assert.equal(isNewOnSite(undefined, now), false);
  assert.equal(isNewOnSite("not a date", now), false);
  assert.equal(isNewOnSite(new Date(now + DAY).toISOString(), now), false);
});

test("price per sq.ft is for sale listings with an area", () => {
  assert.equal(pricePerSqft({ listing_type: "sale", price: 8_500_000, area_sqft: 1300 }), 6538);
  assert.equal(pricePerSqft({ listing_type: "sale", price: 16_000_000, area_sqft: 2100 }), 7619);
  assert.equal(pricePerSqft({ listing_type: "rent", price: 25_000, area_sqft: 1000 }), null);
  assert.equal(pricePerSqft({ listing_type: "sale", price: 8_500_000, area_sqft: null }), null);
  assert.equal(pricePerSqft({ listing_type: "sale", price: 8_500_000, area_sqft: 0 }), null);
  assert.equal(pricePerSqft({ listing_type: "sale", price: 0, area_sqft: 1300 }), null);
});

test("sorting by price per sq.ft puts listings without an area last, in their own order", () => {
  const rows = [
    { id: "no-area-1", price: 1_000_000, area_sqft: null },
    { id: "dear", price: 9_000_000, area_sqft: 1000 },
    { id: "cheap", price: 4_000_000, area_sqft: 1000 },
    { id: "no-area-2", price: 500_000, area_sqft: 0 },
    { id: "middle", price: 12_000_000, area_sqft: 2000 },
  ];
  assert.deepEqual(
    byPricePerSqft(rows).map((r) => r.id),
    ["cheap", "middle", "dear", "no-area-1", "no-area-2"],
  );
  assert.equal(rows[0].id, "no-area-1", "the input is left untouched");
});

test("the WhatsApp share link carries the title, price, place and address", () => {
  const s = shareLinks({ title: "3 BHK & garden", priceText: "₹85 L", locality: "Kadri, Mangalore", url: "https://brixora.in/properties/BRX-2026-0001" });
  assert.equal(s.text, "3 BHK & garden · ₹85 L · Kadri, Mangalore");
  assert.ok(s.whatsapp.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(s.whatsapp.slice("https://wa.me/?text=".length)), "3 BHK & garden · ₹85 L · Kadri, Mangalore\nhttps://brixora.in/properties/BRX-2026-0001");
  assert.doesNotMatch(s.whatsapp.slice("https://wa.me/?text=".length), /[&\s]/, "the text is fully encoded");
});
