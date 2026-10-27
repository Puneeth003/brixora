// Flags contact details and identifying info in owner-written text. SPEC.md §6.

export type ScanFlag = { kind: "phone" | "email" | "url" | "house_name" | "address"; match: string };

const PATTERNS: { kind: ScanFlag["kind"]; re: RegExp }[] = [
  // Indian mobiles (with or without +91 / spaces / dashes) and landlines
  { kind: "phone", re: /(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}\b/g },
  { kind: "phone", re: /\b0\d{2,4}[\s-]?\d{6,8}\b/g },
  { kind: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { kind: "url", re: /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|in|net|org|co|io)\b/gi },
  // "Sri Durga Nilaya", "Rose Villa", "Lakshmi Krupa", "Shanthi Sadana" etc.
  {
    kind: "house_name",
    re: /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s(?:Villa|House|Nilaya|Nilayam|Nivas|Nivasa|Sadana|Sadan|Krupa|Kripa|Mane|Bhavan|Bhavana|Manzil|Mansion|Cottage|Residency|Enclave)\b/g,
  },
  { kind: "house_name", re: /\b\w+(?:nilaya|nilayam|nivas|nivasa|sadana|krupa|kripa|bhavan|manzil)\b/gi },
  // House / door / survey numbers and pincodes
  { kind: "address", re: /\b(?:house|door|flat|plot|survey|sy|khata|rtc)\.?\s?(?:no\.?|number|#)\s?[\w/-]+/gi },
  // Karnataka pincodes (Mangalore is 575xxx)
  { kind: "address", re: /\b5[6-9]\d{4}\b/g },
];

export function scanText(...texts: (string | null | undefined)[]): ScanFlag[] {
  const text = texts.filter(Boolean).join("\n");
  const seen = new Set<string>();
  const flags: ScanFlag[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const key = `${kind}:${m[0].toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        flags.push({ kind, match: m[0] });
      }
    }
  }
  return flags;
}
