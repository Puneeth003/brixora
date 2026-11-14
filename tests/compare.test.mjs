// Comparing listings side by side (src/lib/compare.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPARE_MAX, bestColumns, parseCompare, toggleCompare } from "../src/lib/compare.ts";

test("stored choices become a clean list of at most three", () => {
  assert.deepEqual(parseCompare('["BRX-1","BRX-2"]'), ["BRX-1", "BRX-2"]);
  assert.deepEqual(parseCompare("oops"), []);
  assert.deepEqual(parseCompare(null), []);
  assert.deepEqual(parseCompare(["BRX-1", 5, "bad ref!", "BRX-1", "BRX-2", "BRX-3", "BRX-4"]), ["BRX-1", "BRX-2", "BRX-3"]);
  assert.equal(COMPARE_MAX, 3);
});

test("choosing adds a listing and choosing again removes it", () => {
  assert.deepEqual(toggleCompare([], "BRX-1"), { list: ["BRX-1"], chosen: true, full: false });
  assert.deepEqual(toggleCompare(["BRX-1", "BRX-2"], "BRX-1"), { list: ["BRX-2"], chosen: false, full: false });
  assert.deepEqual(toggleCompare(["BRX-1"], "bad ref!"), { list: ["BRX-1"], chosen: false, full: false });
});

test("a fourth listing is refused, but one already chosen can still be removed", () => {
  const three = ["BRX-1", "BRX-2", "BRX-3"];
  assert.deepEqual(toggleCompare(three, "BRX-4"), { list: three, chosen: false, full: true });
  assert.deepEqual(toggleCompare(three, "BRX-2").list, ["BRX-1", "BRX-3"]);
});

test("the best value in a row is pointed out only when there is one", () => {
  assert.deepEqual(bestColumns([5000, 4200, 6100], "low"), [1]);
  assert.deepEqual(bestColumns([1200, 1800, 1800], "high"), [1, 2]);
  assert.deepEqual(bestColumns([5000, null, 4200], "low"), [2]);
  assert.deepEqual(bestColumns([5000, 5000], "low"), []); // all the same
  assert.deepEqual(bestColumns([5000, null], "low"), []); // only one known
  assert.deepEqual(bestColumns([0, 4200, undefined], "low"), []);
});
