// The locality map on a listing (src/lib/locality-map.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { NEARBY, mapEmbedUrl, mapLink, mapQuery } from "../src/lib/locality-map.ts";

test("the map is searched for the locality, or for one kind of place near it", () => {
  assert.equal(mapQuery(" Kadri ", "Mangalore"), "Kadri, Mangalore, India");
  assert.equal(mapQuery("Kadri", "Mangalore", "schools"), "schools near Kadri, Mangalore, India");
  assert.equal(mapQuery("Kadri", "Mangalore", "helipads"), "Kadri, Mangalore, India"); // not offered
  assert.equal(mapQuery("Kadri", ""), "Kadri, India");
});

test("the frame and the link carry the search safely encoded", () => {
  const frame = new URL(mapEmbedUrl("St. Mary's & Co", "Mangalore", "hospitals"));
  assert.equal(frame.hostname, "maps.google.com");
  assert.equal(frame.searchParams.get("output"), "embed");
  assert.equal(frame.searchParams.get("q"), "hospitals near St. Mary's & Co, Mangalore, India");
  const link = new URL(mapLink("St. Mary's & Co", "Mangalore"));
  assert.equal(link.hostname, "www.google.com");
  assert.equal(link.searchParams.get("query"), "St. Mary's & Co, Mangalore, India");
});

test("every nearby choice has its own key, label and search words", () => {
  assert.equal(new Set(NEARBY.map((n) => n.key)).size, NEARBY.length);
  for (const n of NEARBY) assert.ok(n.label && n.search);
});
