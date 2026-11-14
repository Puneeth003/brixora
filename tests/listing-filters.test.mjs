// The extra filters on the listings page (src/lib/listing-filters.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_AMENITY_FILTERS, countMoreFilters, parseAmenities, parseListedDays, parseMinArea, parseMinBaths } from "../src/lib/listing-filters.ts";

const AMENITIES = ["Car parking", "Lift", "Power backup", "Security", "CCTV", "Swimming pool", "Gym", "Garden"];

test("only the offered sizes, bathroom counts and periods are accepted", () => {
  assert.equal(parseMinArea("1000"), 1000);
  assert.equal(parseMinArea("1234"), null);
  assert.equal(parseMinArea("1000 OR 1=1"), null);
  assert.equal(parseMinArea(undefined), null);
  assert.equal(parseMinBaths("2"), 2);
  assert.equal(parseMinBaths("0"), null);
  assert.equal(parseMinBaths("99"), null);
  assert.equal(parseListedDays("7"), 7);
  assert.equal(parseListedDays("30"), 30);
  assert.equal(parseListedDays("365"), null);
});

test("amenities are matched to the real list, whatever the case or order", () => {
  assert.deepEqual(parseAmenities("gym,Lift", AMENITIES), ["Lift", "Gym"]);
  assert.deepEqual(parseAmenities(" Lift , lift ,Helipad,'; DROP", AMENITIES), ["Lift"]);
  assert.deepEqual(parseAmenities("", AMENITIES), []);
  assert.deepEqual(parseAmenities(undefined, AMENITIES), []);
  assert.equal(parseAmenities(AMENITIES.join(","), AMENITIES).length, MAX_AMENITY_FILTERS);
});

test("the count on the More filters label covers only filters really in use", () => {
  assert.equal(countMoreFilters({}, AMENITIES), 0);
  assert.equal(countMoreFilters({ area: "1000", bath: "2", listed: "7", verified: "1", amenity: "Lift,Gym" }, AMENITIES), 6);
  assert.equal(countMoreFilters({ area: "17", verified: "yes", amenity: "Helipad" }, AMENITIES), 0);
});
