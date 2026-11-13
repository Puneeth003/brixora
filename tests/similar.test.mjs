// "Similar properties" ranking (src/lib/similar.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { rankSimilar, similarityScore } from "../src/lib/similar.ts";

const target = { id: "t", listing_type: "sale", property_type: "apartment", locality: "Kadri", price: 8_000_000, bedrooms: 3 };
const listing = (id, over = {}) => ({ id, listing_type: "sale", property_type: "apartment", locality: "Kadri", price: 8_000_000, bedrooms: 3, ...over });

test("a listing is never similar to itself, and sale never mixes with rent", () => {
  assert.equal(similarityScore(target, listing("t")), 0);
  assert.equal(similarityScore(target, listing("a", { listing_type: "rent" })), 0);
  assert.deepEqual(rankSimilar(target, [listing("t"), listing("a", { listing_type: "rent" })]), []);
});

test("locality counts most, then type and price, then bedrooms", () => {
  assert.equal(similarityScore(target, listing("a")), 8); // everything matches
  assert.equal(similarityScore(target, listing("a", { locality: "Bejai" })), 5);
  assert.equal(similarityScore(target, listing("a", { property_type: "villa" })), 6);
  assert.equal(similarityScore(target, listing("a", { bedrooms: 2 })), 7);
  assert.equal(similarityScore(target, listing("a", { locality: " kadri " })), 8); // case and spacing ignored
});

test("price is close within 25%, roughly in range within 50%, and ignored beyond", () => {
  const priceOnly = (price) => similarityScore(target, listing("a", { locality: "X", property_type: "plot", bedrooms: null, price }));
  assert.equal(priceOnly(10_000_000), 2); // exactly +25%
  assert.equal(priceOnly(6_000_000), 2); // exactly -25%
  assert.equal(priceOnly(10_000_001), 1);
  assert.equal(priceOnly(12_000_000), 1); // exactly +50%
  assert.equal(priceOnly(12_000_001), 0);
  assert.equal(priceOnly(3_000_000), 0);
});

test("weak matches are left out: same type alone or a rough price alone is not enough", () => {
  const typeOnly = listing("type", { locality: "X", price: 40_000_000, bedrooms: 1 });
  const roughPriceOnly = listing("price", { locality: "X", property_type: "plot", bedrooms: null, price: 11_000_000 });
  const sameLocalityOnly = listing("loc", { property_type: "plot", bedrooms: null, price: 40_000_000 });
  const typeAndPrice = listing("both", { locality: "X", bedrooms: 1 });
  assert.deepEqual(
    rankSimilar(target, [typeOnly, roughPriceOnly, sameLocalityOnly, typeAndPrice]).map((x) => x.id),
    ["both", "loc"],
  );
});

test("best matches come first and the list is capped", () => {
  const items = [
    listing("far", { locality: "Bejai", bedrooms: 2 }), // 4
    listing("twin"), // 8
    listing("villa", { property_type: "villa" }), // 6
    listing("smaller", { bedrooms: 2 }), // 7
  ];
  assert.deepEqual(
    rankSimilar(target, items).map((x) => x.id),
    ["twin", "smaller", "villa"],
  );
  assert.deepEqual(
    rankSimilar(target, items, 1).map((x) => x.id),
    ["twin"],
  );
});

test("ties go to featured listings, then the newest", () => {
  const items = [
    listing("old", { approved_at: "2026-10-01T00:00:00.000Z" }),
    listing("new", { approved_at: "2026-11-01T00:00:00.000Z" }),
    listing("featured", { featured: true, approved_at: "2026-09-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(
    rankSimilar(target, items).map((x) => x.id),
    ["featured", "new", "old"],
  );
});

test("a plot with no bedrooms doesn't score on bedrooms", () => {
  const plot = { ...target, property_type: "plot", bedrooms: null };
  assert.equal(similarityScore(plot, listing("a", { property_type: "plot", bedrooms: null })), 7);
});
