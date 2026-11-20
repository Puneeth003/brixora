"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createBroadcastAction, estimateAudience, sendBroadcastTest, type AudienceEstimate } from "@/app/admin/broadcast-actions";
import { useConfirm } from "@/components/ConfirmDialog";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import type { AudienceSpec, BroadcastInput, Contact, VariableSource } from "@/lib/broadcast";
import { displayPhone, formatNumber, normalizeIndianPhone } from "@/lib/format";
import type { ActionState } from "@/lib/types";
import type { MetaTemplate } from "@/lib/whatsapp";

// Admin → Broadcasts → New: a four-step wizard (template, audience, personalise, review).
// The audience is counted on the server as it changes; the work in progress is kept in
// localStorage so a refresh doesn't lose it (large uploaded lists aren't kept).

type Option = { value: string; label: string };

/** One template variable: `source` is "text" or "field:<name | phone | column>"; `text` is the fixed text or the fallback. */
type Var = { source: string; text: string };

type Draft = {
  v: 1;
  step: number;
  name: string;
  tpl: string;
  clients: boolean;
  types: string[];
  statuses: string[];
  sources: string[];
  members: boolean;
  enquiries: boolean;
  days: string;
  upload: boolean;
  text: string;
  fileName: string | null;
  /** Chosen columns; null = detected automatically. nameCol -1 = no name column. */
  phoneCol: number | null;
  nameCol: number | null;
  /** The uploaded list was too large to keep in the draft and must be uploaded again. */
  uploadDropped: boolean;
  body: Var[];
  header: Var[];
  mediaUrl: string;
  mediaFilename: string;
  timing: "now" | "schedule";
  at: string;
  testPhone: string;
};

const DRAFT_KEY = "admin:broadcast-draft";
const DRAFT_MAX_ROWS = 2000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const EMPTY: Draft = {
  v: 1,
  step: 0,
  name: "",
  tpl: "",
  clients: false,
  types: [],
  statuses: [],
  sources: [],
  members: false,
  enquiries: false,
  days: "30",
  upload: false,
  text: "",
  fileName: null,
  phoneCol: null,
  nameCol: null,
  uploadDropped: false,
  body: [],
  header: [],
  mediaUrl: "",
  mediaFilename: "",
  timing: "now",
  at: "",
  testPhone: "",
};

const STEPS = [
  { label: "Template", hint: "What to send" },
  { label: "Audience", hint: "Who gets it" },
  { label: "Personalise", hint: "Fill the variables" },
  { label: "Review & send", hint: "Test, then send" },
] as const;

const DAY_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const MEDIA_FORMATS = ["IMAGE", "VIDEO", "DOCUMENT"];

const tKey = (t: MetaTemplate) => `${t.name}|${t.language}`;
const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const maxVar = (text: string | null) => Math.max(0, ...[...(text ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
const freshVars = (n: number): Var[] => Array.from({ length: n }, (_, i) => (i === 0 ? { source: "field:name", text: "there" } : { source: "text", text: "" }));
const hasTextHeader = (t: MetaTemplate | null) => Boolean(t?.header && (t.headerFormat === "TEXT" || !t.headerFormat));

/** A datetime-local value ("2026-11-20T18:30") for a Date, in the browser's time zone. */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** How far in the future a time is (negative when past). Called from event handlers only. */
const msFromNow = (d: Date) => d.getTime() - Date.now();

// ---------------------------------------------------------------------------
// CSV / pasted list parsing
// ---------------------------------------------------------------------------

/** Like the server's cleanPhone(): a 10-digit Indian mobile, or 10–15 digits with a country code. */
function looksLikePhone(s: string) {
  if (!/^[\d\s+()\-.]{8,}$/.test(s.trim())) return false;
  if (normalizeIndianPhone(s)) return true;
  const digits = s.replace(/\D/g, "");
  return /^[1-9]\d{9,14}$/.test(digits) && !/^91/.test(digits);
}

/** The delimiter used in the first line (outside quotes): comma, semicolon or tab. */
function detectDelimiter(text: string) {
  const line = (text.split(/\r\n|\n|\r/).find((l) => l.trim()) ?? "").replace(/"[^"]*"/g, "");
  const best = [",", ";", "\t"].map((d) => ({ d, n: line.split(d).length - 1 })).sort((a, b) => b.n - a.n)[0];
  return best.n > 0 ? best.d : ",";
}

/** RFC 4180-ish: quoted fields, "" escapes, delimiters and line breaks inside quotes, CRLF / LF / CR. */
function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

type ParsedList = { headers: string[]; rows: string[][]; hasHeader: boolean; autoPhone: number; autoName: number };

function analyseList(text: string): ParsedList | null {
  if (!text.trim()) return null;
  let rows = parseCsv(text);
  if (!rows.length) return null;
  // "98…, 97…, 96…" on one line is a list of numbers, not columns.
  if (rows.length === 1 && rows[0].length > 1 && rows[0].every((c) => !c || looksLikePhone(c))) rows = rows[0].filter(Boolean).map((c) => [c]);

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const first = rows[0];
  const hasHeader = rows.length > 1 && !first.some(looksLikePhone) && first.some((c) => /\p{L}/u.test(c));
  const body = hasHeader ? rows.slice(1) : rows;

  const seen = new Set<string>();
  const headers = Array.from({ length: width }, (_, i) => {
    const base = (hasHeader ? (first[i] ?? "") : "").replace(/\s+/g, " ").trim().slice(0, 60) || `Column ${i + 1}`;
    let h = base;
    for (let n = 2; seen.has(h.toLowerCase()); n++) h = `${base} ${n}`;
    seen.add(h.toLowerCase());
    return h;
  });

  const sample = body.slice(0, 300);
  const share = (col: number, test: (s: string) => boolean) => {
    const cells = sample.map((r) => r[col] ?? "").filter(Boolean);
    return cells.length ? cells.filter(test).length / cells.length : 0;
  };
  const byHeader = (re: RegExp, not = -1) => (hasHeader ? headers.findIndex((h, i) => i !== not && re.test(h)) : -1);

  let autoPhone = byHeader(/phone|mobile|whats\s*app|cell/i);
  if (autoPhone < 0) autoPhone = byHeader(/^(?!.*name).*(number|contact|\bno\b)/i);
  if (autoPhone < 0) autoPhone = Math.max(0, headers.findIndex((_, i) => share(i, looksLikePhone) >= 0.5));

  let autoName = byHeader(/^(full |first |customer |client |contact )?name$/i, autoPhone);
  if (autoName < 0) autoName = byHeader(/name/i, autoPhone);
  if (autoName < 0 && !hasHeader) autoName = headers.findIndex((_, i) => i !== autoPhone && share(i, (s) => /\p{L}/u.test(s) && !s.includes("@")) >= 0.6);
  return { headers, rows: body, hasHeader, autoPhone, autoName };
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

const toSource = (v: Var): VariableSource => (v.source === "text" ? { kind: "text", value: v.text } : { kind: "field", field: v.source.slice(6), fallback: v.text });

/** Same rules as the server's resolveVariables(), for the preview. Empty when there's nothing to show. */
function resolveVar(v: Var, c: Contact | null) {
  if (v.source === "text") return v.text.trim();
  const field = v.source.slice(6);
  let value = "";
  if (c) value = field === "name" ? (c.name ?? "") : field === "phone" ? `+${c.phone}` : (c.fields[field] ?? "");
  return value.replace(/\s*\n\s*/g, " ").trim() || v.text.trim();
}

/** Template text with {{n}} replaced; filled values are highlighted, missing ones stay as {{n}}. */
function Filled({ text, values }: { text: string; values: string[] }) {
  const parts = text.split(/(\{\{\d+\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{(\d+)\}\}$/);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        const value = values[Number(m[1]) - 1];
        return (
          <mark key={i} className={`rounded px-0.5 ${value ? "bg-[#d9fdd3] text-inherit" : "bg-amber-100 text-amber-800"}`}>
            {value || part}
          </mark>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Card({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-[var(--s-shadow)] sm:p-7">
      <h2 className="text-lg font-extrabold tracking-tight text-[var(--s-text)]">{title}</h2>
      {description && <div className="mt-1 text-sm text-[var(--s-muted)]">{description}</div>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-[var(--s-muted)]">
        {label} <span className="font-medium">{value.length ? `· ${value.length} chosen` : "· any"}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                on
                  ? "border-[var(--brand)] bg-[var(--s-brand-soft)] text-[var(--brand)]"
                  : "border-[var(--s-border-strong)] bg-white text-[var(--s-text-2)] hover:border-[#c3c9c5] hover:bg-[var(--s-hover)]"
              }`}
            >
              {on && (
                <svg viewBox="0 0 20 20" className="size-3" fill="currentColor" aria-hidden>
                  <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                </svg>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SourceCard({
  id,
  title,
  description,
  checked,
  onChange,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border transition-colors ${
        checked ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_3%,#fff)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_10%,transparent)]" : "border-[var(--s-border)] hover:border-[var(--s-border-strong)]"
      }`}
    >
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 p-4">
        <span
          aria-hidden
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${checked ? "bg-[var(--brand)] text-white" : "bg-[var(--s-seg)] text-[var(--s-text-2)]"}`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-[var(--s-text)]">{title}</span>
          <span className="block text-xs text-[var(--s-muted)]">{description}</span>
        </span>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 shrink-0" />
      </label>
      {checked && children && <div className="space-y-4 border-t border-[var(--s-border)] px-4 pt-4 pb-4">{children}</div>}
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function StatusLine({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-2xl bg-[var(--s-seg)] p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-xl px-4 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${
              on ? "bg-white text-[var(--s-text)] shadow-[0_1px_3px_rgba(10,16,12,0.1)]" : "text-[var(--s-muted)] hover:text-[var(--s-text)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The template as WhatsApp shows it, filled in for one contact. */
function Preview({
  t,
  body,
  header,
  mediaUrl,
  mediaFilename,
  contact,
}: {
  t: MetaTemplate | null;
  body: string[];
  header: string[];
  mediaUrl: string;
  mediaFilename: string;
  contact: Contact | null;
}) {
  const validMedia = /^https:\/\/\S+$/.test(mediaUrl.trim());
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[var(--s-shadow)]">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-white/20 text-sm font-extrabold">
          {(contact?.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{contact ? contact.name || displayPhone(contact.phone) : "Live preview"}</p>
          <p className="truncate text-[11px] text-white/75">{contact ? `Preview for ${displayPhone(contact.phone)}` : "Values fill in once the audience is chosen"}</p>
        </div>
      </div>
      <div className="min-h-64 bg-[#efe7de] bg-[radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:14px_14px] p-4">
        {t ? (
          <div className="max-w-[19rem]">
            <div className="rounded-xl rounded-tl-none bg-white p-1 text-sm text-zinc-900 shadow-sm">
              {t.headerFormat && MEDIA_FORMATS.includes(t.headerFormat) && (
                <div className="mb-1 overflow-hidden rounded-lg bg-zinc-100">
                  {t.headerFormat === "IMAGE" && validMedia ? (
                    // eslint-disable-next-line @next/next/no-img-element -- any public https URL the admin types; not a site image
                    <img src={mediaUrl.trim()} alt="Header image" className="aspect-[1.91/1] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[1.91/1] flex-col items-center justify-center gap-1 text-zinc-400">
                      <Icon
                        d={
                          t.headerFormat === "VIDEO"
                            ? "M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z"
                            : t.headerFormat === "DOCUMENT"
                              ? "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5"
                              : "M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"
                        }
                      />
                      <span className="max-w-[90%] truncate text-[11px] font-semibold">
                        {t.headerFormat === "DOCUMENT" && mediaFilename.trim() ? mediaFilename.trim() : `${t.headerFormat.toLowerCase()} header`}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="px-2 pt-1 pb-1.5">
                {hasTextHeader(t) && (
                  <p className="mb-1 font-bold">
                    <Filled text={t.header!} values={header} />
                  </p>
                )}
                <p className="break-words whitespace-pre-wrap">
                  <Filled text={t.body} values={body} />
                </p>
                {t.footer && <p className="mt-1 text-xs text-zinc-500">{t.footer}</p>}
                <p className="mt-0.5 text-right text-[10px] text-zinc-400">now</p>
              </div>
            </div>
            {t.buttons.map((b, i) => (
              <div key={`${b}-${i}`} className="mt-1 rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-[#027eb5] shadow-sm">
                {b}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-56 place-items-center text-center text-sm text-zinc-500">Choose a template to see the message here.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function NewBroadcast({
  templates,
  disabled,
  maxRecipients,
  clientTypes,
  clientStatuses,
  clientSources,
}: {
  templates: MetaTemplate[];
  disabled: boolean;
  maxRecipients: number;
  clientTypes: Option[];
  clientStatuses: Option[];
  clientSources: Option[];
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [d, setD] = useState<Draft>(EMPTY);
  const update = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [estimate, setEstimate] = useState<{ key: string; res: AudienceEstimate } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [testState, setTestState] = useState<ActionState>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [minAt, setMinAt] = useState("");
  const [testing, startTest] = useTransition();
  const [sending, startSend] = useTransition();
  const restored = useRef(false);
  const finished = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const tpl = templates.find((t) => tKey(t) === d.tpl) ?? null;
  const needMedia = Boolean(tpl?.headerFormat && MEDIA_FORMATS.includes(tpl.headerFormat));

  // Restore the draft once, after hydration (the server can't see localStorage).
  useEffect(() => {
    if (restored.current) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Draft>) : null;
      if (saved?.v === 1) {
        const known = templates.some((t) => tKey(t) === saved.tpl);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after hydration
        setD({ ...EMPTY, ...saved, ...(known ? {} : { tpl: "", body: [], header: [], step: 0 }) });
        setRestoredDraft(Boolean(saved.name || saved.tpl));
      }
    } catch {
      // Storage blocked or a corrupt draft: start fresh.
    }
    restored.current = true;
  }, [templates]);

  // ----- Audience -----
  const list = useMemo(() => (d.upload ? analyseList(d.text) : null), [d.upload, d.text]);
  const phoneCol = list ? (d.phoneCol !== null && d.phoneCol < list.headers.length ? d.phoneCol : list.autoPhone) : 0;
  const nameColRaw = list ? (d.nameCol !== null && d.nameCol < list.headers.length ? d.nameCol : list.autoName) : -1;
  const nameCol = nameColRaw === phoneCol ? -1 : nameColRaw;
  const fieldColumns = useMemo(() => (list ? list.headers.filter((_, i) => i !== phoneCol && i !== nameCol) : []), [list, phoneCol, nameCol]);
  const contacts = useMemo(() => {
    if (!list) return [];
    return list.rows.map((r) => {
      const fields: Record<string, string> = {};
      list.headers.forEach((h, i) => {
        if (i !== phoneCol && i !== nameCol && r[i]) fields[h] = r[i];
      });
      return { phone: r[phoneCol] ?? "", name: nameCol >= 0 ? r[nameCol] || undefined : undefined, fields };
    });
  }, [list, phoneCol, nameCol]);
  const badRows = useMemo(() => contacts.filter((c) => !looksLikePhone(c.phone)).length, [contacts]);

  const spec: AudienceSpec = useMemo(
    () => ({
      clients: d.clients ? { types: d.types, statuses: d.statuses, sources: d.sources } : null,
      members: d.members,
      enquiries: d.enquiries ? { days: d.days === "all" ? null : Number(d.days) } : null,
      contacts: d.upload ? contacts : [],
    }),
    [d.clients, d.types, d.statuses, d.sources, d.members, d.enquiries, d.days, d.upload, contacts],
  );
  const specKey = useMemo(() => JSON.stringify(spec), [spec]);
  const hasSource = d.clients || d.members || d.enquiries || (d.upload && contacts.length > 0);
  const tooManyRows = contacts.length > maxRecipients;

  // Count the audience on the server, 500 ms after the last change.
  useEffect(() => {
    if (!hasSource || tooManyRows) return;
    let live = true;
    const timer = setTimeout(async () => {
      let res: AudienceEstimate;
      try {
        res = await estimateAudience(spec);
      } catch {
        res = { ok: false, error: "Couldn't count the audience. Check your connection." };
      }
      if (live) setEstimate({ key: specKey, res });
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [spec, specKey, hasSource, tooManyRows]);

  const current = hasSource && !tooManyRows && estimate?.key === specKey ? estimate.res : null;
  const counting = hasSource && !tooManyRows && !current;
  const count = current?.ok ? current.count : 0;
  // The last good sample stays in the preview while the count refreshes.
  const sample = estimate?.res.ok ? estimate.res.sample : [];
  const previewContact = hasSource ? (sample[0] ?? null) : null;

  // Save the draft (debounced). Big uploaded lists are left out.
  useEffect(() => {
    if (!restored.current || finished.current) return;
    const timer = setTimeout(() => {
      try {
        const big = contacts.length > DRAFT_MAX_ROWS || d.text.length > 1_000_000;
        const save: Draft = big ? { ...d, text: "", fileName: null, phoneCol: null, nameCol: null, uploadDropped: true } : d;
        localStorage.setItem(DRAFT_KEY, JSON.stringify(save));
      } catch {
        // Storage full or blocked: the draft just isn't kept.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [d, contacts.length]);

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  // ----- Variables -----
  const fieldOptions = useMemo(() => {
    const opts: DropdownOption[] = [
      { value: "text", label: "Fixed text" },
      { value: "field:name", label: "Name", group: "From each contact" },
      { value: "field:phone", label: "Phone", group: "From each contact" },
    ];
    if (d.clients || d.members) opts.push({ value: "field:email", label: "Email", hint: "CRM clients, members", group: "From each contact" });
    if (d.clients) opts.push({ value: "field:localities", label: "Localities", hint: "CRM clients", group: "From each contact" });
    for (const col of fieldColumns) opts.push({ value: `field:${col}`, label: col, hint: "CSV column", group: "Uploaded list" });
    const seen = new Set<string>();
    return opts.filter((o) => !seen.has(o.value) && Boolean(seen.add(o.value)));
  }, [d.clients, d.members, fieldColumns]);

  const bodyValues = d.body.map((v) => resolveVar(v, previewContact));
  const headerValues = d.header.map((v) => resolveVar(v, previewContact));

  function chooseTemplate(key: string) {
    const t = templates.find((x) => tKey(x) === key);
    if (!t) return;
    setD((prev) => ({
      ...prev,
      tpl: key,
      body: freshVars(maxVar(t.body)),
      header: hasTextHeader(t) && maxVar(t.header) > 0 ? freshVars(1) : [],
      mediaUrl: prev.tpl === key ? prev.mediaUrl : "",
      mediaFilename: prev.tpl === key ? prev.mediaFilename : "",
    }));
    setTestState(null);
  }

  function setVar(kind: "body" | "header", i: number, patch: Partial<Var>) {
    setD((prev) => ({ ...prev, [kind]: prev[kind].map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  }

  // ----- Upload -----
  async function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setFileError(`${file.name} is larger than 2 MB. Split it into smaller files or remove unused columns.`);
    if (!/\.(csv|txt)$/i.test(file.name) && !/^text\//.test(file.type)) {
      return setFileError("Upload a .csv or .txt file. From Excel or Google Sheets, download or save the sheet as CSV.");
    }
    try {
      const text = await file.text();
      if (!text.trim()) return setFileError(`${file.name} is empty.`);
      update({ upload: true, text, fileName: file.name, phoneCol: null, nameCol: null, uploadDropped: false });
    } catch {
      setFileError("Couldn't read that file.");
    }
  }

  // ----- Validation -----
  const audienceError = !hasSource
    ? d.upload && !d.clients && !d.members && !d.enquiries
      ? "Upload a file or paste numbers."
      : "Choose who should get the broadcast."
    : tooManyRows
      ? `The list has ${formatNumber(contacts.length)} rows. A broadcast can go to at most ${formatNumber(maxRecipients)} people.`
      : counting
        ? "Counting the audience…"
        : current && !current.ok
          ? current.error
          : count === 0
            ? "No one to send to: every number is invalid or opted out."
            : count > maxRecipients
              ? `That's ${formatNumber(count)} people. A broadcast can go to at most ${formatNumber(maxRecipients)}: narrow the audience or split it into several broadcasts.`
              : null;

  const fieldKnown = (v: Var) => v.source === "text" || fieldOptions.some((o) => o.value === v.source);
  const personaliseError = !tpl
    ? "Choose a template first."
    : [...d.header, ...d.body].some((v) => !fieldKnown(v))
      ? "One of the variables uses a column that isn't in the audience any more. Choose another source."
      : [...d.header, ...d.body].some((v) => v.source === "text" && !v.text.trim())
        ? "Fill in the fixed text for every variable."
        : needMedia && !/^https:\/\/\S+$/.test(d.mediaUrl.trim())
          ? `Add a public https link to the ${tpl.headerFormat!.toLowerCase()}.`
          : null;

  const stepErrors = [
    disabled ? "WhatsApp isn't ready for broadcasts." : !tpl ? "Choose a template." : d.name.trim().length < 2 ? "Give the broadcast a name." : null,
    audienceError,
    personaliseError,
    null,
  ];
  const canReach = (i: number) => i <= d.step || stepErrors.slice(0, i).every((e) => !e);
  const step = Math.min(d.step, 3);

  function go(i: number) {
    if (!canReach(i)) return;
    if (i === 3) setMinAt(toLocalInput(new Date()));
    update({ step: i });
    setSendError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildInput(scheduledAt: string | null): BroadcastInput | null {
    if (!tpl) return null;
    const mediaType = tpl.headerFormat?.toLowerCase() as "image" | "video" | "document" | undefined;
    return {
      name: d.name.trim(),
      template: { name: tpl.name, lang: tpl.language, category: tpl.category },
      config: {
        body: tpl.body,
        header: tpl.header,
        headerFormat: tpl.headerFormat,
        footer: tpl.footer,
        buttons: tpl.buttons,
        headerMedia:
          needMedia && mediaType
            ? { type: mediaType, link: d.mediaUrl.trim(), filename: mediaType === "document" ? d.mediaFilename.trim() || undefined : undefined }
            : null,
        variables: d.body.map(toSource),
        headerVariables: d.header.map(toSource),
      },
      audience: spec,
      scheduledAt,
    };
  }

  function sendTest() {
    setTestState(null);
    const input = buildInput(null);
    if (!input) return;
    if (!d.testPhone.trim()) return setTestState({ ok: false, error: "Enter a phone number for the test." });
    startTest(async () => {
      try {
        setTestState(await sendBroadcastTest(input, d.testPhone));
      } catch {
        setTestState({ ok: false, error: "Couldn't send the test. Check your connection." });
      }
    });
  }

  async function submit() {
    setSendError(null);
    const firstError = stepErrors.findIndex(Boolean);
    if (firstError >= 0) return setSendError(stepErrors[firstError]);
    let scheduledAt: string | null = null;
    let when = "right away";
    if (d.timing === "schedule") {
      const at = d.at ? new Date(d.at) : null;
      if (!at || Number.isNaN(at.getTime())) return setSendError("Choose the date and time to send.");
      if (msFromNow(at) < 2 * 60_000) return setSendError("Choose a time at least a few minutes from now, or send it now.");
      if (msFromNow(at) > 90 * 86_400_000) return setSendError("Schedule within the next 90 days.");
      scheduledAt = at.toISOString();
      when = at.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    }
    const input = buildInput(scheduledAt);
    if (!input) return;
    const ok = await confirm({
      title: scheduledAt ? `Schedule for ${plural(count, "person", "people")}?` : `Send to ${plural(count, "person", "people")}?`,
      message: (
        <>
          <strong className="text-zinc-900">{tpl?.name}</strong> ({tpl?.language}) goes out {scheduledAt ? `on ${when}` : "right away"}.{" "}
          {tpl?.category === "MARKETING" ? "Marketing messages are billed by Meta per delivered message. " : ""}
          Messages can&apos;t be recalled once sent.
        </>
      ),
      confirmLabel: scheduledAt ? "Schedule" : "Send now",
    });
    if (!ok) return;
    startSend(async () => {
      try {
        const res = await createBroadcastAction(input);
        if (res.ok) {
          finished.current = true;
          clearDraft();
          router.push(`/admin/broadcasts/${res.id}`);
        } else setSendError(res.error);
      } catch {
        setSendError("Couldn't create the broadcast. Check your connection and try again.");
      }
    });
  }

  async function startOver() {
    const ok = await confirm({ title: "Start over?", message: "This clears everything you've entered for this broadcast.", confirmLabel: "Start over", danger: true });
    if (!ok) return;
    clearDraft();
    setD(EMPTY);
    setRestoredDraft(false);
    setTestState(null);
    setSendError(null);
    setFileError(null);
  }

  // ----- Template options -----
  const templateOptions: DropdownOption[] = templates.map((t) => ({
    value: tKey(t),
    label: t.name,
    hint: t.language,
    group: t.category === "MARKETING" ? "Marketing" : t.category === "UTILITY" ? "Utility" : t.category.charAt(0) + t.category.slice(1).toLowerCase(),
  }));

  const varLabel = (v: Var) => {
    if (v.source === "text") return `“${v.text}”`;
    const opt = fieldOptions.find((o) => o.value === v.source);
    return `${opt?.label ?? v.source.slice(6)}${v.text.trim() ? `, or “${v.text.trim()}” if empty` : ""}`;
  };

  const sendLabel = d.timing === "schedule" ? `Schedule for ${plural(count, "person", "people")}` : `Send to ${plural(count, "person", "people")}`;

  // ---------------------------------------------------------------------------

  function varRow(kind: "body" | "header", i: number, v: Var) {
    const id = `var-${kind}-${i}`;
    return (
      <div key={id} className="grid gap-2 rounded-2xl border border-[var(--s-border)] p-3 sm:grid-cols-[4.5rem_minmax(0,13rem)_minmax(0,1fr)] sm:items-center">
        <span className="font-mono text-sm font-bold text-[var(--brand)]">
          {kind === "header" ? "Header " : ""}
          {`{{${i + 1}}}`}
        </span>
        <Dropdown
          id={id}
          variant="field"
          label={`Value for ${kind === "header" ? "header " : ""}{{${i + 1}}}`}
          value={v.source}
          placeholder="Choose…"
          onChange={(source) => setVar(kind, i, { source, text: source === "text" ? "" : source === "field:name" ? "there" : v.source === "text" ? "" : v.text })}
          options={fieldOptions}
        />
        <input
          aria-label={v.source === "text" ? `Fixed text for {{${i + 1}}}` : `Fallback for {{${i + 1}}}`}
          value={v.text}
          onChange={(e) => setVar(kind, i, { text: e.target.value })}
          maxLength={1000}
          placeholder={v.source === "text" ? "Text sent to everyone" : "If empty, use… (optional)"}
          className="input"
        />
      </div>
    );
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-90">
      {/* Step indicator */}
      <nav aria-label="Broadcast steps" className="mb-6 rounded-3xl bg-white p-2 shadow-[var(--s-shadow)]">
        <ol className="grid grid-cols-4 gap-1">
          {STEPS.map((s, i) => {
            const on = i === step;
            const done = i < step && !stepErrors[i];
            const reachable = canReach(i);
            return (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  disabled={!reachable}
                  aria-current={on ? "step" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors sm:px-3 ${
                    on ? "bg-[var(--s-brand-soft)]" : reachable ? "hover:bg-[var(--s-hover)]" : "cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
                      on ? "bg-[var(--brand)] text-white" : done ? "bg-[var(--s-brand-soft)] text-[var(--brand)]" : "bg-[var(--s-seg)] text-[var(--s-muted)]"
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
                        <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="hidden min-w-0 md:block">
                    <span className={`block truncate text-sm font-extrabold ${on ? "text-[var(--brand)]" : "text-[var(--s-text)]"}`}>{s.label}</span>
                    <span className="block truncate text-xs text-[var(--s-muted)]">{s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="px-3 pt-1 pb-1 text-sm font-extrabold text-[var(--s-text)] md:hidden">
          Step {step + 1} of 4 · {STEPS[step].label}
        </p>
      </nav>

      {restoredDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--s-brand-soft)] px-4 py-3 text-sm text-[var(--s-text-2)]">
          <span>
            <strong className="text-[var(--brand)]">Draft restored.</strong> Carry on where you left off.
          </span>
          <button type="button" onClick={startOver} className="text-sm font-bold text-[var(--s-text-2)] underline underline-offset-2 hover:text-[var(--s-text)]">
            Start over
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* Step 1: template */}
          {step === 0 && (
            <Card
              title="Choose a template"
              description={
                <>
                  WhatsApp only lets businesses start a conversation with a template that Meta has <strong>approved</strong>. Marketing templates may only go to people
                  who agreed to get WhatsApp messages from you; sending them to people who didn&apos;t can get the number blocked or limited.
                </>
              }
            >
              <div>
                <label htmlFor="bc-name" className="label">
                  Broadcast name
                </label>
                <input
                  id="bc-name"
                  value={d.name}
                  onChange={(e) => update({ name: e.target.value })}
                  maxLength={120}
                  placeholder="e.g. Diwali offer · Whitefield buyers"
                  className="input"
                />
                <p className="mt-1 text-xs text-[var(--s-muted)]">Only you see this, in the broadcasts list and reports.</p>
              </div>
              <div>
                <label htmlFor="bc-template" className="label">
                  Template
                </label>
                <Dropdown
                  id="bc-template"
                  variant="field"
                  label="Template"
                  value={d.tpl}
                  onChange={chooseTemplate}
                  placeholder={templates.length ? "Choose an approved template…" : "No approved templates"}
                  disabled={!templates.length}
                  searchable
                  searchPlaceholder="Search templates…"
                  options={templateOptions}
                />
                <p className="mt-1 text-xs text-[var(--s-muted)]">
                  {formatNumber(templates.length)} approved template{templates.length === 1 ? "" : "s"}. Login-code (authentication) templates can&apos;t be broadcast.
                </p>
              </div>
              {tpl && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-lg px-2 py-0.5 font-bold ${tpl.category === "MARKETING" ? "bg-amber-100 text-amber-800" : "bg-[var(--s-brand-soft)] text-[var(--brand)]"}`}
                  >
                    {tpl.category.toLowerCase()}
                  </span>
                  <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 font-bold text-[var(--s-text-2)]">{tpl.language}</span>
                  {d.body.length + d.header.length > 0 && (
                    <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 font-bold text-[var(--s-text-2)]">{plural(d.body.length + d.header.length, "variable")}</span>
                  )}
                  {needMedia && <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 font-bold text-[var(--s-text-2)]">{tpl.headerFormat!.toLowerCase()} header</span>}
                </div>
              )}
            </Card>
          )}

          {/* Step 2: audience */}
          {step === 1 && (
            <Card title="Choose the audience" description="Tick one or more sources. Everyone is combined, duplicate numbers are sent once, and people who opted out are left out.">
              <div className="space-y-3">
                <SourceCard
                  id="src-clients"
                  title="CRM clients"
                  description="People in Clients, filtered by type, status and source."
                  checked={d.clients}
                  onChange={(on) => update({ clients: on })}
                  icon={<Icon d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm13 9v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />}
                >
                  <Chips label="Type" options={clientTypes} value={d.types} onChange={(types) => update({ types })} />
                  <Chips label="Status" options={clientStatuses} value={d.statuses} onChange={(statuses) => update({ statuses })} />
                  <Chips label="Source" options={clientSources} value={d.sources} onChange={(sources) => update({ sources })} />
                  <p className="text-xs text-[var(--s-muted)]">Nothing chosen in a row means any.</p>
                </SourceCard>

                <SourceCard
                  id="src-members"
                  title="Website members"
                  description="Owners with an account and a phone number."
                  checked={d.members}
                  onChange={(on) => update({ members: on })}
                  icon={<Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />}
                />

                <SourceCard
                  id="src-enquiries"
                  title="Website enquiries"
                  description="People who sent an enquiry from the website."
                  checked={d.enquiries}
                  onChange={(on) => update({ enquiries: on })}
                  icon={<Icon d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />}
                >
                  <div className="max-w-xs">
                    <label htmlFor="src-days" className="label">
                      Enquired in
                    </label>
                    <Dropdown id="src-days" variant="field" label="Enquired in" value={d.days} onChange={(days) => update({ days })} options={DAY_OPTIONS} />
                  </div>
                </SourceCard>

                <SourceCard
                  id="src-upload"
                  title="Upload or paste a list"
                  description="A CSV or TXT file (up to 2 MB), or numbers pasted from anywhere."
                  checked={d.upload}
                  onChange={(on) => update({ upload: on })}
                  icon={<Icon d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12m0-12 4 4m-4-4-4 4" />}
                >
                  {d.uploadDropped && !d.text && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      Your list had more than {formatNumber(DRAFT_MAX_ROWS)} rows, so it wasn&apos;t kept in the draft. Upload it again.
                    </p>
                  )}
                  {d.fileName ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--s-seg)] px-4 py-3">
                      <Icon d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5" />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--s-text)]">{d.fileName}</span>
                      <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary px-3 py-1.5 text-xs">
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ text: "", fileName: null, phoneCol: null, nameCol: null })}
                        className="btn-secondary px-3 py-1.5 text-xs text-[var(--s-late)]"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          void onFile(e.dataTransfer.files[0]);
                        }}
                        className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                          dragging ? "border-[var(--brand)] bg-[var(--s-brand-soft)]" : "border-[var(--s-border-strong)]"
                        }`}
                      >
                        <p className="text-sm font-bold text-[var(--s-text)]">Drop a CSV or TXT file here</p>
                        <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary px-3 py-1.5 text-xs">
                          Choose file…
                        </button>
                        <p className="text-xs text-[var(--s-muted)]">From Excel or Google Sheets: File → Download / Save as → CSV</p>
                      </div>
                      <div>
                        <label htmlFor="src-paste" className="label">
                          Or paste numbers
                        </label>
                        <textarea
                          id="src-paste"
                          value={d.text}
                          onChange={(e) => update({ text: e.target.value, phoneCol: null, nameCol: null, uploadDropped: false })}
                          rows={6}
                          spellCheck={false}
                          placeholder={"9876543210\n9123456789, Priya Sharma\n\nor a CSV with a header row:\nphone,name,locality\n9876543210,Ravi,Whitefield"}
                          className="input font-mono text-xs"
                        />
                      </div>
                    </>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {fileError && <p className="text-xs font-bold text-[var(--s-late)]">{fileError}</p>}

                  {list && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-[var(--s-text-2)]">
                        {plural(list.rows.length, "row")} parsed
                        {list.hasHeader ? " (first row used as column names)" : ""}
                        {badRows > 0 && <span className="text-[var(--s-late)]">, {formatNumber(badRows)} without a valid-looking number</span>}
                      </p>
                      {list.headers.length > 1 && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor="src-phone-col" className="label">
                              Phone column
                            </label>
                            <Dropdown
                              id="src-phone-col"
                              variant="field"
                              label="Phone column"
                              value={String(phoneCol)}
                              onChange={(v) => update({ phoneCol: Number(v), nameCol: Number(v) === nameCol ? -1 : d.nameCol })}
                              options={list.headers.map((h, i) => ({ value: String(i), label: h, hint: list.rows[0]?.[i] ?? "" }))}
                            />
                          </div>
                          <div>
                            <label htmlFor="src-name-col" className="label">
                              Name column
                            </label>
                            <Dropdown
                              id="src-name-col"
                              variant="field"
                              label="Name column"
                              value={String(nameCol)}
                              onChange={(v) => update({ nameCol: Number(v) })}
                              options={[
                                { value: "-1", label: "No name column" },
                                ...list.headers.map((h, i) => ({ value: String(i), label: h, hint: list.rows[0]?.[i] ?? "", disabled: i === phoneCol })),
                              ]}
                            />
                          </div>
                        </div>
                      )}
                      {list.headers.length > 1 && (
                        <div className="overflow-x-auto rounded-xl border border-[var(--s-border)]">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[var(--s-hover)] text-[var(--s-muted)]">
                              <tr>
                                {list.headers.slice(0, 8).map((h, i) => (
                                  <th key={h} className="px-3 py-2 font-bold whitespace-nowrap">
                                    {h}
                                    {i === phoneCol && <span className="ml-1 rounded bg-[var(--s-brand-soft)] px-1 text-[10px] text-[var(--brand)]">phone</span>}
                                    {i === nameCol && <span className="ml-1 rounded bg-[var(--s-brand-soft)] px-1 text-[10px] text-[var(--brand)]">name</span>}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {list.rows.slice(0, 3).map((r, ri) => (
                                <tr key={ri} className="border-t border-[var(--s-border)]">
                                  {list.headers.slice(0, 8).map((h, i) => (
                                    <td key={h} className={`max-w-48 truncate px-3 py-1.5 ${i === phoneCol && !looksLikePhone(r[i] ?? "") ? "text-[var(--s-late)]" : "text-[var(--s-text-2)]"}`}>
                                      {r[i] || "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </SourceCard>
              </div>

              {/* Count */}
              {(hasSource || tooManyRows) && (
                <div
                  aria-live="polite"
                  className={`rounded-2xl p-4 ${
                    audienceError && !counting ? "bg-[color-mix(in_srgb,var(--s-late)_7%,#fff)]" : "bg-[var(--s-hover)]"
                  }`}
                >
                  {counting ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-[var(--s-muted)]">
                      <span className="size-3 animate-spin rounded-full border-2 border-[var(--s-border-strong)] border-t-[var(--brand)]" aria-hidden />
                      Counting the audience…
                    </p>
                  ) : current?.ok ? (
                    <>
                      <p className="text-sm text-[var(--s-text-2)]">
                        Will send to <strong className={`text-lg tabular-nums ${count > maxRecipients ? "text-[var(--s-late)]" : "text-[var(--s-text)]"}`}>{plural(count, "person", "people")}</strong>
                        <span className="text-[var(--s-muted)]">
                          {" "}
                          · {formatNumber(current.optedOut)} opted out · {formatNumber(current.invalid)} invalid · {formatNumber(current.duplicates)} duplicate
                          {current.duplicates === 1 ? "" : "s"} removed
                        </span>
                      </p>
                      {audienceError && <p className="mt-1 text-xs font-bold text-[var(--s-late)]">{audienceError}</p>}
                      {current.sample.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                          {current.sample.map((c) => (
                            <li key={c.phone} className="rounded-full bg-white px-3 py-1 text-xs shadow-[var(--s-field-shadow)]">
                              <span className="font-bold text-[var(--s-text)]">{c.name || "No name"}</span>{" "}
                              <span className="text-[var(--s-muted)] tabular-nums">{displayPhone(c.phone)}</span>
                            </li>
                          ))}
                          {count > current.sample.length && (
                            <li className="px-1 py-1 text-xs text-[var(--s-muted)]">and {formatNumber(count - current.sample.length)} more</li>
                          )}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-sm font-bold text-[var(--s-late)]">{audienceError}</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Step 3: personalise */}
          {step === 2 && tpl && (
            <Card
              title="Personalise"
              description="Choose what goes into each variable. A contact field falls back to the text on the right when it's empty for someone."
            >
              {d.header.length + d.body.length === 0 && !needMedia && (
                <p className="rounded-2xl bg-[var(--s-hover)] p-4 text-sm text-[var(--s-muted)]">This template has no variables: everyone gets the same message.</p>
              )}
              {d.header.length + d.body.length > 0 && (
                <div className="space-y-2">
                  {d.header.map((v, i) => (
                    varRow("header", i, v)
                  ))}
                  {d.body.map((v, i) => (
                    varRow("body", i, v)
                  ))}
                </div>
              )}
              {needMedia && (
                <div className="space-y-3 rounded-2xl border border-[var(--s-border)] p-4">
                  <p className="text-sm font-extrabold text-[var(--s-text)]">Header {tpl.headerFormat!.toLowerCase()}</p>
                  <div className={`grid gap-3 ${tpl.headerFormat === "DOCUMENT" ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
                    <div>
                      <label htmlFor="bc-media" className="label">
                        Public link (https)
                      </label>
                      <input
                        id="bc-media"
                        type="url"
                        inputMode="url"
                        value={d.mediaUrl}
                        onChange={(e) => update({ mediaUrl: e.target.value })}
                        placeholder={tpl.headerFormat === "IMAGE" ? "https://…/offer.jpg" : tpl.headerFormat === "VIDEO" ? "https://…/tour.mp4" : "https://…/brochure.pdf"}
                        spellCheck={false}
                        className="input"
                        aria-invalid={Boolean(d.mediaUrl.trim()) && !/^https:\/\/\S+$/.test(d.mediaUrl.trim())}
                      />
                    </div>
                    {tpl.headerFormat === "DOCUMENT" && (
                      <div>
                        <label htmlFor="bc-filename" className="label">
                          File name
                        </label>
                        <input
                          id="bc-filename"
                          value={d.mediaFilename}
                          onChange={(e) => update({ mediaFilename: e.target.value })}
                          maxLength={200}
                          placeholder="Brochure.pdf"
                          className="input"
                        />
                      </div>
                    )}
                  </div>
                  {tpl.headerFormat === "IMAGE" && /^https:\/\/\S+$/.test(d.mediaUrl.trim()) && (
                    // eslint-disable-next-line @next/next/no-img-element -- any public https URL the admin types; not a site image
                    <img src={d.mediaUrl.trim()} alt="Header image preview" className="h-28 w-auto max-w-full rounded-xl border border-[var(--s-border)] object-cover" />
                  )}
                  <p className="text-xs text-[var(--s-muted)]">
                    Meta downloads the file from this link for every message, so it must open without a login.
                    {tpl.headerFormat === "IMAGE" ? " JPG or PNG, up to 5 MB." : tpl.headerFormat === "VIDEO" ? " MP4, up to 16 MB." : " PDF, up to 100 MB."}
                  </p>
                </div>
              )}
              {personaliseError && <p className="text-xs font-bold text-[var(--s-late)]">{personaliseError}</p>}
            </Card>
          )}

          {/* Step 4: review */}
          {step === 3 && tpl && (
            <>
              <Card title="Review">
                <dl className="divide-y divide-[var(--s-border)] text-sm">
                  {[
                    ["Name", d.name.trim()],
                    ["Template", `${tpl.name} · ${tpl.language} · ${tpl.category.toLowerCase()}`],
                    [
                      "Audience",
                      <>
                        <strong>{plural(count, "person", "people")}</strong>
                        <span className="text-[var(--s-muted)]">
                          {" "}
                          from{" "}
                          {[
                            d.clients && "CRM clients",
                            d.members && "website members",
                            d.enquiries && `enquiries (${DAY_OPTIONS.find((o) => o.value === d.days)?.label.toLowerCase()})`,
                            d.upload && contacts.length > 0 && (d.fileName ?? "a pasted list"),
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </>,
                    ],
                    ...d.header.map((v, i) => [`Header {{${i + 1}}}`, varLabel(v)]),
                    ...d.body.map((v, i) => [`{{${i + 1}}}`, varLabel(v)]),
                    ...(needMedia ? [[`Header ${tpl.headerFormat!.toLowerCase()}`, <span key="m" className="break-all">{d.mediaUrl.trim()}</span>]] : []),
                  ].map(([k, v]) => (
                    <div key={String(k)} className="grid gap-1 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <dt className={`font-bold text-[var(--s-muted)] ${String(k).includes("{{") ? "font-mono" : ""}`}>{k}</dt>
                      <dd className="min-w-0 text-[var(--s-text)]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {STEPS.slice(0, 3).map((s, i) => (
                    <button key={s.label} type="button" onClick={() => go(i)} className="font-bold text-[var(--brand)] hover:underline">
                      Edit {s.label.toLowerCase()}
                    </button>
                  ))}
                </div>
              </Card>

              <Card title="Send a test" description="Sends this message to one number, filled in as for the first person in the audience. Check it on your phone before sending to everyone.">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="bc-test" className="sr-only">
                    Send a test to
                  </label>
                  <input
                    id="bc-test"
                    value={d.testPhone}
                    onChange={(e) => update({ testPhone: e.target.value })}
                    inputMode="tel"
                    placeholder="Send a test to, e.g. 9876543210"
                    className="input sm:max-w-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendTest();
                      }
                    }}
                  />
                  <button type="button" onClick={sendTest} disabled={testing} className="btn-secondary px-4 py-2 text-sm">
                    {testing ? "Sending…" : "Send test"}
                  </button>
                </div>
                <StatusLine state={testState} />
              </Card>

              <Card title="When to send">
                <Segmented
                  label="When to send"
                  value={d.timing}
                  onChange={(timing) => {
                    const now = new Date();
                    setMinAt(toLocalInput(now));
                    // Default to the next full hour, at least 30 minutes away.
                    const next = new Date(now.getTime() + 30 * 60_000);
                    next.setMinutes(0, 0, 0);
                    next.setHours(next.getHours() + 1);
                    update({ timing, at: timing === "schedule" && !d.at ? toLocalInput(next) : d.at });
                    setSendError(null);
                  }}
                  options={[
                    { value: "now", label: "Send now" },
                    { value: "schedule", label: "Schedule" },
                  ]}
                />
                {d.timing === "schedule" ? (
                  <div className="max-w-xs">
                    <label htmlFor="bc-at" className="label">
                      Date and time
                    </label>
                    <input id="bc-at" type="datetime-local" value={d.at} min={minAt} onChange={(e) => update({ at: e.target.value })} className="input" />
                    <p className="mt-1 text-xs text-[var(--s-muted)]">Your local time. You can still pause, cancel or send it early from the broadcast page.</p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--s-muted)]">Messages start going out as soon as you confirm, a few at a time. You can pause or cancel from the broadcast page.</p>
                )}
              </Card>
            </>
          )}

          {/* Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-[var(--s-shadow)]">
            <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className="btn-secondary px-4 py-2 text-sm">
              ← Back
            </button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
              {step < 3 && stepErrors[step] && <p className="min-w-0 text-right text-xs font-semibold text-[var(--s-muted)]">{stepErrors[step]}</p>}
              {step === 3 && sendError && (
                <p role="alert" className="min-w-0 text-right text-xs font-bold text-[var(--s-late)]">
                  {sendError}
                </p>
              )}
              {step < 3 ? (
                <button type="button" onClick={() => go(step + 1)} disabled={Boolean(stepErrors[step])} className="btn-primary px-5 py-2 text-sm">
                  Next →
                </button>
              ) : (
                <button type="button" onClick={submit} disabled={sending || stepErrors.some(Boolean)} className="btn-primary px-5 py-2 text-sm">
                  {sending ? (d.timing === "schedule" ? "Scheduling…" : "Starting…") : sendLabel}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live preview */}
        <aside aria-label="Message preview" className="space-y-3 lg:sticky lg:top-6">
          <Preview t={tpl} body={bodyValues} header={headerValues} mediaUrl={d.mediaUrl} mediaFilename={d.mediaFilename} contact={previewContact} />
          {tpl && hasSource && current?.ok && (
            <p className="px-2 text-xs text-[var(--s-muted)]">
              Going to <strong className="text-[var(--s-text)]">{plural(count, "person", "people")}</strong>
              {tpl.category === "MARKETING" ? " · marketing rates apply per delivered message" : ""}
            </p>
          )}
          {(d.name || d.tpl) && !restoredDraft && (
            <button type="button" onClick={startOver} className="px-2 text-xs font-bold text-[var(--s-muted)] hover:text-[var(--s-text)]">
              Start over
            </button>
          )}
        </aside>
      </div>
      {confirmDialog}
    </fieldset>
  );
}
