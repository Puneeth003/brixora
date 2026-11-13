// A buyer's preferred time for a site visit, asked for with an enquiry. It is a request:
// the team confirms by phone. Pure, so the form, the server action and tests share it.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Visits can be asked for from tomorrow up to this many days ahead. */
export const VISIT_MAX_DAYS_AHEAD = 30;

/** Hourly start times offered, India time. */
export const VISIT_SLOTS: { value: string; label: string }[] = [
  { value: "09:00", label: "9:00 am" },
  { value: "10:00", label: "10:00 am" },
  { value: "11:00", label: "11:00 am" },
  { value: "12:00", label: "12:00 pm" },
  { value: "13:00", label: "1:00 pm" },
  { value: "14:00", label: "2:00 pm" },
  { value: "15:00", label: "3:00 pm" },
  { value: "16:00", label: "4:00 pm" },
  { value: "17:00", label: "5:00 pm" },
  { value: "18:00", label: "6:00 pm" },
];

const istDayKey = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

/** First and last day ("YYYY-MM-DD", India time) a visit can be asked for. */
export function visitDateRange(nowMs: number) {
  return { min: istDayKey(nowMs + DAY_MS), max: istDayKey(nowMs + VISIT_MAX_DAYS_AHEAD * DAY_MS) };
}

export type VisitRequest = { at: Date; label: string };

/**
 * Checks a date and slot from the form. `null` when no visit was asked for (both empty);
 * an error message when what was sent can't be a real request.
 */
export function parseVisitRequest(date: string, slot: string, nowMs: number): { ok: true; visit: VisitRequest | null } | { ok: false; error: string } {
  if (!date && !slot) return { ok: true, visit: null };
  if (!date) return { ok: false, error: "Please choose a date for the visit." };
  if (!slot) return { ok: false, error: "Please choose a time for the visit." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !VISIT_SLOTS.some((s) => s.value === slot)) {
    return { ok: false, error: "Please choose the visit date and time again." };
  }
  const at = new Date(`${date}T${slot}:00+05:30`);
  if (Number.isNaN(at.getTime()) || istDayKey(at.getTime()) !== date) return { ok: false, error: "Please choose the visit date and time again." };
  const { min, max } = visitDateRange(nowMs);
  if (date < min) return { ok: false, error: "Please choose a visit date from tomorrow onwards." };
  if (date > max) return { ok: false, error: `Please choose a visit date within the next ${VISIT_MAX_DAYS_AHEAD} days.` };
  return { ok: true, visit: { at, label: visitLabel(at) } };
}

/** "Sat, 15 Nov at 11:00 am" in India time. */
export function visitLabel(at: Date) {
  const day = at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
  const time = at.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

/** The enquiry text as stored and forwarded: the visit request first, then what the visitor wrote. */
export function withVisitRequest(message: string | null | undefined, visit: VisitRequest | null) {
  const text = message?.trim() || null;
  if (!visit) return text;
  const line = `Requested site visit: ${visit.label}.`;
  return text ? `${line}\n${text}` : line;
}
