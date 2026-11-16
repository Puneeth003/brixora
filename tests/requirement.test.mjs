// Requirements posted from the public site (src/lib/requirement.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_REQUIREMENT_LOCALITIES, parseRequirement, requirementSummary } from "../src/lib/requirement.ts";

const options = {
  types: ["apartment", "villa", "plot", "office", "shop"],
  localities: ["Kadri", "Bejai", "Derebail", "Urwa", "Lalbagh", "Kottara", "Ullal"],
  saleBudgets: ["0-3000000", "6000000-10000000", "20000000-"],
  rentBudgets: ["0-15000", "15000-30000"],
};
const form = (over = {}) => ({ looking: "sale", types: [], localities: [], bhk: "", budget: "", notes: "", ...over });
const label = (t) => t.toUpperCase();
const money = (n) => `Rs ${n}`;
const pick = (v) => [v.budget_min, v.budget_max];

test("a full requirement is read into the CRM's own fields", () => {
  const r = parseRequirement(form({ types: ["villa", "apartment"], localities: ["bejai", " KADRI "], bhk: "3", budget: "6000000-10000000", notes: "  Near a school " }), options);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    listing_type: "sale",
    property_types: ["apartment", "villa"],
    localities: ["Kadri", "Bejai"],
    bedrooms: 3,
    budget_min: 6000000,
    budget_max: 10000000,
    notes: "Near a school",
  });
});

test("open-ended budgets keep only the side that was given", () => {
  assert.deepEqual(pick(parseRequirement(form({ budget: "0-3000000" }), options).value), [null, 3000000]);
  assert.deepEqual(pick(parseRequirement(form({ budget: "20000000-" }), options).value), [20000000, null]);
});

test("anything not on the site's own lists is dropped or refused", () => {
  const r = parseRequirement(form({ types: ["castle", "plot"], localities: ["Atlantis", "Urwa"], bhk: "9" }), options);
  assert.deepEqual(r.value.property_types, ["plot"]);
  assert.deepEqual(r.value.localities, ["Urwa"]);
  assert.equal(r.value.bedrooms, null);
  assert.equal(parseRequirement(form({ looking: "lease", notes: "x" }), options).ok, false);
  // A rent budget on a purchase, or a made-up range, is not accepted.
  assert.equal(parseRequirement(form({ budget: "0-15000" }), options).ok, false);
  assert.equal(parseRequirement(form({ budget: "1-999999999" }), options).ok, false);
  assert.equal(parseRequirement(form({ looking: "rent", budget: "0-15000" }), options).ok, true);
});

test("an empty requirement is refused, and localities are capped", () => {
  assert.match(parseRequirement(form(), options).error, /at least one/);
  assert.equal(parseRequirement(form({ notes: "Anything near the beach" }), options).ok, true);
  assert.equal(parseRequirement(form({ localities: options.localities }), options).value.localities.length, MAX_REQUIREMENT_LOCALITIES);
});

test("the timeline line reads naturally", () => {
  const buy = parseRequirement(form({ types: ["villa"], localities: ["Kadri", "Bejai"], bhk: "3", budget: "6000000-10000000", notes: "Near a school" }), options).value;
  assert.equal(
    requirementSummary(buy, label, money),
    "Requirement posted on the website: To buy · VILLA · 3 BHK · in Kadri, Bejai · budget Rs 6000000 to Rs 10000000.\nNear a school",
  );
  const rent = parseRequirement(form({ looking: "rent", budget: "0-15000", bhk: "5" }), options).value;
  assert.equal(requirementSummary(rent, label, money), "Requirement posted on the website: To rent · 5+ BHK · budget up to Rs 15000 a month.");
});
