// Site-visit requests sent with an enquiry (src/lib/visit-request.ts).
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { VISIT_SLOTS, parseVisitRequest, visitDateRange, visitLabel, withVisitRequest } from "../src/lib/visit-request.ts";

// Friday 13 Nov 2026, 2:30 pm in India.
const now = Date.parse("2026-11-13T09:00:00Z");

test("visits can be asked for from tomorrow to 30 days ahead, by India's calendar", () => {
  assert.deepEqual(visitDateRange(now), { min: "2026-11-14", max: "2026-12-13" });
  // 11:30 pm IST on the 13th is still the 13th in India (18:00 UTC).
  assert.equal(visitDateRange(Date.parse("2026-11-13T18:00:00Z")).min, "2026-11-14");
  // 12:30 am IST on the 14th is the 13th in UTC (19:00), but tomorrow is the 15th.
  assert.equal(visitDateRange(Date.parse("2026-11-13T19:00:00Z")).min, "2026-11-15");
});

test("no date and no time means no visit was asked for", () => {
  assert.deepEqual(parseVisitRequest("", "", now), { ok: true, visit: null });
});

test("a valid request becomes the right instant and a readable label", () => {
  const r = parseVisitRequest("2026-11-15", "11:00", now);
  assert.equal(r.ok, true);
  assert.equal(r.visit.at.toISOString(), "2026-11-15T05:30:00.000Z"); // 11:00 IST
  assert.match(r.visit.label, /^Sun, 15 Nov at 11:00\s?am$/i);
});

test("half-filled, malformed and out-of-range requests are refused with a reason", () => {
  const error = (date, slot) => {
    const r = parseVisitRequest(date, slot, now);
    assert.equal(r.ok, false, `${date} ${slot}`);
    return r.error;
  };
  assert.match(error("2026-11-15", ""), /time/);
  assert.match(error("", "11:00"), /date/);
  assert.match(error("2026-11-13", "11:00"), /tomorrow/); // today
  assert.match(error("2026-11-01", "11:00"), /tomorrow/); // past
  assert.match(error("2026-12-14", "11:00"), /30 days/);
  assert.match(error("2026-11-15", "07:00"), /again/); // not an offered slot
  assert.match(error("2026-11-15", "11:00; DROP"), /again/);
  assert.match(error("15-11-2026", "11:00"), /again/);
  assert.match(error("2026-11-31", "11:00"), /again/); // no such day
});

test("the first and last allowed days are accepted", () => {
  assert.equal(parseVisitRequest("2026-11-14", "09:00", now).ok, true);
  assert.equal(parseVisitRequest("2026-12-13", "18:00", now).ok, true);
});

test("every offered slot is a real time with a label", () => {
  for (const s of VISIT_SLOTS) {
    const r = parseVisitRequest("2026-11-20", s.value, now);
    assert.equal(r.ok, true, s.value);
    assert.ok(s.label.length > 0);
  }
  assert.equal(new Set(VISIT_SLOTS.map((s) => s.value)).size, VISIT_SLOTS.length);
});

test("the visit request leads the stored enquiry text", () => {
  const visit = { at: new Date("2026-11-15T05:30:00.000Z"), label: visitLabel(new Date("2026-11-15T05:30:00.000Z")) };
  assert.equal(withVisitRequest("  Is parking covered?  ", null), "Is parking covered?");
  assert.equal(withVisitRequest("", null), null);
  assert.equal(withVisitRequest(undefined, visit), `Requested site visit: ${visit.label}.`);
  assert.equal(withVisitRequest("Is parking covered?", visit), `Requested site visit: ${visit.label}.\nIs parking covered?`);
});
