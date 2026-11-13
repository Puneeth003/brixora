// Recently viewed listings (src/lib/recently-viewed.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { RECENT_MAX, addRecent, inRecentOrder, parseRecent } from "../src/lib/recently-viewed.ts";

test("stored text becomes a clean list, whatever it holds", () => {
  assert.deepEqual(parseRecent('["BRX-2026-0001","BRX-2026-0002"]'), ["BRX-2026-0001", "BRX-2026-0002"]);
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent("not json"), []);
  assert.deepEqual(parseRecent('{"a":1}'), []);
  // Wrong types, unsafe text and repeats are dropped.
  assert.deepEqual(parseRecent(["BRX-1", 7, null, "x' OR 1=1", "../etc", "BRX-1", "BRX-2"]), ["BRX-1", "BRX-2"]);
});

test("the list never grows past the limit", () => {
  const many = Array.from({ length: 30 }, (_, i) => `BRX-${i}`);
  assert.equal(parseRecent(many).length, RECENT_MAX);
  assert.equal(addRecent(many, "BRX-NEW").length, RECENT_MAX);
});

test("viewing a listing puts it first without repeating it", () => {
  assert.deepEqual(addRecent([], "BRX-1"), ["BRX-1"]);
  assert.deepEqual(addRecent(["BRX-1", "BRX-2"], "BRX-3"), ["BRX-3", "BRX-1", "BRX-2"]);
  assert.deepEqual(addRecent(["BRX-1", "BRX-2", "BRX-3"], "BRX-3"), ["BRX-3", "BRX-1", "BRX-2"]);
  assert.deepEqual(addRecent(["BRX-1"], "bad ref!"), ["BRX-1"]);
});

test("cards come back in the visitor's order, minus listings that are gone", () => {
  const rows = [{ reference_no: "BRX-1" }, { reference_no: "BRX-3" }];
  assert.deepEqual(inRecentOrder(["BRX-3", "BRX-2", "BRX-1"], rows), [{ reference_no: "BRX-3" }, { reference_no: "BRX-1" }]);
  assert.deepEqual(inRecentOrder([], rows), []);
});
