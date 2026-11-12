// Activity page helpers: filters, periods, diff wording, photo bursts (src/lib/activity-feed.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTION_FILTERS,
  feedRange,
  filterQuery,
  groupBursts,
  isFiltered,
  istDayStart,
  parseFeedFilters,
  periodStart,
  summariseDiff,
  toQueryString,
} from "../src/lib/activity-feed.ts";

const anyone = () => true;
const fmt = { price: (n) => `Rs ${n}`, date: (iso) => `D(${iso.slice(0, 10)})`, dateTime: (iso) => `T(${iso.slice(0, 16)})` };

test("a day starts at midnight in India, not UTC", () => {
  assert.equal(istDayStart("2026-11-12"), "2026-11-11T18:30:00.000Z");
  assert.equal(istDayStart("2026-02-31"), null);
  assert.equal(istDayStart("12-11-2026"), null);
});

test("week, month and quarter start in India time", () => {
  // Thursday 12 Nov 2026, 09:00 IST.
  const now = Date.parse("2026-11-12T03:30:00Z");
  assert.equal(periodStart("week", now), "2026-11-08T18:30:00.000Z"); // Monday 9 Nov
  assert.equal(periodStart("month", now), "2026-10-31T18:30:00.000Z"); // 1 Nov
  assert.equal(periodStart("quarter", now), "2026-09-30T18:30:00.000Z"); // 1 Oct
  // 00:30 IST on Monday 1 Feb is still 31 Jan in UTC.
  const edge = Date.parse("2027-01-31T19:00:00Z");
  assert.equal(periodStart("week", edge), "2027-01-31T18:30:00.000Z");
  assert.equal(periodStart("month", edge), "2027-01-31T18:30:00.000Z");
  assert.equal(periodStart("quarter", edge), "2026-12-31T18:30:00.000Z");
});

test("unknown or malformed filters fall back to no filter", () => {
  const f = parseFeedFilters({ kind: "nope", action: "drop table", from: "yesterday", to: "2026-13-01", period: "year", page: "-4", person: ["a", "b"] }, anyone);
  assert.deepEqual(f, { kind: "all", person: "", action: "", q: "", from: "", to: "", period: "month", page: 1 });
  assert.equal(isFiltered(f), false);
});

test("the person filter only accepts ids the caller recognises", () => {
  assert.equal(parseFeedFilters({ person: "abc" }, () => false).person, "");
  assert.equal(parseFeedFilters({ person: "abc" }, (id) => id === "abc").person, "abc");
});

test("a reversed date range is swapped and covers the whole last day", () => {
  const f = parseFeedFilters({ from: "2026-10-27", to: "2026-10-25" }, anyone);
  assert.equal(f.from, "2026-10-25");
  assert.equal(f.to, "2026-10-27");
  assert.deepEqual(feedRange(f), { since: "2026-10-24T18:30:00.000Z", until: "2026-10-27T18:30:00.000Z" });
  assert.deepEqual(feedRange({ from: "", to: "" }), { since: undefined, until: undefined });
});

test("links keep the filters and drop defaults and the page number", () => {
  const f = parseFeedFilters({ q: " Kadri ", action: "approvals", period: "week", page: "3" }, anyone);
  assert.equal(toQueryString(filterQuery(f)), "?action=approvals&q=Kadri&period=week");
  assert.equal(toQueryString(filterQuery(f, { period: "month" })), "?action=approvals&q=Kadri");
  assert.equal(toQueryString(filterQuery(parseFeedFilters({}, anyone))), "");
});

test("every action filter narrows at least one half of the feed with fixed SQL", () => {
  for (const a of ACTION_FILTERS) {
    assert.ok(a.crm || a.log, a.value);
    for (const sql of [a.crm, a.log]) if (sql) assert.doesNotMatch(sql, /[?;]/, a.value);
  }
});

test("edits show old and new values", () => {
  const diff = {
    price: { from: 8500000, to: 8200000 },
    bedrooms: { from: 2, to: 3 },
    price_negotiable: { from: false, to: true },
    furnishing: { from: null, to: "semi_furnished" },
  };
  assert.equal(summariseDiff("edited", diff, fmt), "Price Rs 8500000 → Rs 8200000 · Bedrooms 2 → 3 · Price negotiable no → yes · Furnishing none → semi furnished");
});

test("long text, lists and extra fields are summarised, not dumped", () => {
  const diff = {
    description: { from: "Short.", to: "A much longer description that would not fit on one line of the feed." },
    amenities: { from: ["lift"], to: ["lift", "parking"] },
    title: { from: "Flat", to: "2 BHK flat" },
    locality: { from: "Kadri", to: "Bejai" },
    floor: { from: 1, to: 2 },
    facing: { from: "east", to: "north" },
  };
  assert.equal(summariseDiff("edited", diff, fmt), "Description updated · Amenities updated · Title Flat → 2 BHK flat · Locality Kadri → Bejai · +2 more");
});

test("other listing entries keep their own wording", () => {
  assert.equal(summariseDiff("rejected", { reason: "Add photos." }, fmt), "Add photos.");
  assert.equal(summariseDiff("change_requested:price", { request_id: "r1", price: 20000 }, fmt), "New price Rs 20000");
  assert.equal(summariseDiff("change_requested:sold", { request_id: "r1", status: { from: "approved", to: "sold_pending" } }, fmt), "Marked as sold");
  assert.equal(summariseDiff("change_requested:details", { request_id: "r1" }, fmt), "");
  assert.equal(summariseDiff("archived", { status: { from: "approved", to: "archived" } }, fmt), "Status approved → archived");
  assert.equal(
    summariseDiff("expiry_extended", { expires_at: { from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" } }, fmt),
    "Expires at D(2026-11-01) → D(2026-12-01)",
  );
  assert.equal(
    summariseDiff("verification_scheduled", { visit_at: "2027-01-11T04:30:00.000Z", assigned_to: "Priya" }, fmt),
    "Visit on T(2027-01-11T04:30) · assigned to Priya",
  );
  assert.equal(summariseDiff("approved", null, fmt), "");
});

test("photo uploads in a row become one entry", () => {
  const at = (min) => new Date(Date.parse("2026-10-27T06:00:00Z") - min * 60_000).toISOString();
  const photo = (min, over = {}) => ({ src: "log", kind: "photo_uploaded", actor_id: "u1", target_id: "p1", created_at: at(min), ...over });
  const rows = [
    photo(0),
    photo(1),
    photo(2),
    photo(3, { target_id: "p2" }), // another listing
    photo(4, { actor_id: "u2" }), // another person
    { src: "log", kind: "approved", actor_id: "u1", target_id: "p1", created_at: at(5) },
    { src: "log", kind: "approved", actor_id: "u1", target_id: "p1", created_at: at(6) }, // not a photo action: never merged
    photo(7),
    photo(30), // more than 10 minutes after the previous upload
  ];
  const grouped = groupBursts(rows);
  assert.deepEqual(
    grouped.map((g) => g.count),
    [3, 1, 1, 1, 1, 1, 1],
  );
  assert.equal(grouped[0].row.created_at, at(0));
});
