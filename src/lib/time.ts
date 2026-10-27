// Server-side time helpers. Kept out of components so renders stay pure.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function daysFromNowIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Midnight today in India, as an ISO timestamp (servers usually run in UTC). */
export function startOfTodayIstIso() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS).toISOString();
}

/** ISO timestamp → value for <input type="datetime-local">, in India time. */
export function istInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (India time) → Date, or null when empty/invalid. */
export function parseIstInput(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Current time in ms (kept here so components stay pure for the linter). */
export function nowMs() {
  return Date.now();
}

/** A Date `ms` milliseconds from now. */
export function fromNow(ms: number) {
  return new Date(Date.now() + ms);
}

/** Midnight on the 1st of this month in India, as a Date. */
export function startOfMonthIst() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  ist.setUTCDate(1);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** Hour of the day (0–23) in India. */
export function istHour() {
  return new Date(Date.now() + IST_OFFSET_MS).getUTCHours();
}
