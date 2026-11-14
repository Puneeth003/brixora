// Typical asking prices by locality (src/lib/price-stats.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPriceStats, checkPrice, median, priceGroup } from "../src/lib/price-stats.ts";

const sale = (locality, type, price, area) => ({ listing_type: "sale", property_type: type, locality, price, area_sqft: area });
const rent = (locality, type, price) => ({ listing_type: "rent", property_type: type, locality, price, area_sqft: 1000 });

test("the median is the middle value, or the mean of the middle two", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("listings are grouped with their own kind", () => {
  assert.equal(priceGroup("apartment"), "homes");
  assert.equal(priceGroup("villa"), "homes");
  assert.equal(priceGroup("plot"), "plots");
  assert.equal(priceGroup("office"), "commercial");
});

const rows = [
  sale("Kadri", "apartment", 5_000_000, 1000), // 5,000
  sale(" kadri ", "apartment", 6_000_000, 1000), // 6,000
  sale("Kadri", "villa", 14_000_000, 2000), // 7,000
  sale("Kadri", "plot", 3_000_000, 3000), // 1,000: must not pull the homes figure down
  sale("Bejai", "apartment", 8_000_000, 1000), // 8,000
  sale("Bejai", "apartment", 4_000_000, null), // no area: left out
  rent("Kadri", "apartment", 20_000),
  rent("Kadri", "apartment", 30_000),
  rent("Kadri", "office", 90_000), // not a home: left out of rents
];
const stats = buildPriceStats(rows);

test("a locality's rate covers its own kind of listing only, whatever the spelling", () => {
  assert.deepEqual(stats.saleRate.kadri.homes, { count: 3, typical: 6000, low: 5000, high: 7000 });
  assert.deepEqual(stats.saleRate.kadri.plots, { count: 1, typical: 1000, low: 1000, high: 1000 });
  assert.deepEqual(stats.saleRate.bejai.homes, { count: 1, typical: 8000, low: 8000, high: 8000 });
  assert.equal(stats.saleRate["*"].homes.count, 4);
  assert.equal(stats.saleRate["*"].homes.typical, 6500);
});

test("rents are summarised for homes", () => {
  assert.deepEqual(stats.homeRent.kadri, { count: 2, typical: 25000, low: 20000, high: 30000 });
  assert.equal(stats.homeRent["*"].count, 2);
});

test("a listing is checked against its locality when there are enough listings there", () => {
  const cheap = checkPrice(stats, sale("Kadri", "apartment", 5_000_000, 1000));
  assert.equal(cheap.scope, "locality");
  assert.equal(cheap.verdict, "below");
  assert.equal(cheap.percent, -17);
  assert.equal(checkPrice(stats, sale("Kadri", "apartment", 6_100_000, 1000)).verdict, "in_line");
  assert.equal(checkPrice(stats, sale("Kadri", "villa", 14_000_000, 2000)).verdict, "above");
});

test("with too few local listings the whole city is used, and with too few anywhere, nothing", () => {
  const bejai = checkPrice(stats, sale("Bejai", "apartment", 8_000_000, 1000));
  assert.equal(bejai.scope, "city");
  assert.equal(bejai.percent, 23);
  assert.equal(checkPrice(stats, sale("Kadri", "plot", 3_000_000, 3000)), null); // one plot in the city
  assert.equal(checkPrice(stats, rent("Kadri", "apartment", 20_000)), null);
  assert.equal(checkPrice(stats, sale("Kadri", "apartment", 5_000_000, null)), null);
});
