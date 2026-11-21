"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createTemplate, uploadTemplateSample } from "@/app/admin/template-actions";
import { useConfirm } from "@/components/ConfirmDialog";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import {
  LANGUAGES,
  LIMITS,
  templateProblems,
  variablesIn,
  type MediaFormat,
  type TemplateButton,
  type TemplateCategory,
  type TemplateDraft,
} from "@/lib/wa-template-types";

// Admin → WhatsApp → Templates → New: a template builder with a live WhatsApp preview.
// The same rules as the server (templateProblems) run on every keystroke, so the admin
// sees what Meta would reject before submitting. The draft is kept in localStorage
// (without the uploaded media handle, which is tied to this session's upload).

type HeaderFormat = "NONE" | "TEXT" | MediaFormat;
type ButtonType = TemplateButton["type"];

export type BuilderPrefill = {
  /** e.g. "new_listing (en)", shown in the "copied from" note. */
  source: string;
  name: string;
  language: string;
  category: TemplateCategory;
  headerFormat: HeaderFormat;
  headerText: string;
  body: string;
  footer: string;
  /** Button texts only: the type, link and number aren't known. */
  buttons: string[];
};

/** "?for=<website message key>": the suggested template for one website message. */
export type BuilderSuggestion = { key: string; purpose: string; draft: TemplateDraft };

type State = {
  name: string;
  language: string;
  category: TemplateCategory;
  headerFormat: HeaderFormat;
  headerText: string;
  headerExample: string;
  body: string;
  bodyExamples: string[];
  footer: string;
  buttons: TemplateButton[];
  auth: { securityRecommendation: boolean; expiry: string; buttonText: string };
};

type Media = { format: MediaFormat; handle: string; fileName: string; size: number; previewUrl: string | null };

const DRAFT_KEY = "brixora:wa-template-draft";
const DRAFT_VERSION = 1;

const EMPTY: State = {
  name: "",
  language: "en",
  category: "MARKETING",
  headerFormat: "NONE",
  headerText: "",
  headerExample: "",
  body: "",
  bodyExamples: [],
  footer: "",
  buttons: [],
  auth: { securityRecommendation: true, expiry: "10", buttonText: "Copy code" },
};

const MEDIA_RULES: Record<MediaFormat, { types: string[]; max: number; accept: string; hint: string; noun: string }> = {
  IMAGE: { types: ["image/jpeg", "image/png"], max: 5 * 1024 * 1024, accept: "image/jpeg,image/png,.jpg,.jpeg,.png", hint: "JPG or PNG, up to 5 MB", noun: "image" },
  VIDEO: { types: ["video/mp4"], max: 8 * 1024 * 1024, accept: "video/mp4,.mp4", hint: "MP4, up to 8 MB", noun: "video" },
  DOCUMENT: { types: ["application/pdf"], max: 8 * 1024 * 1024, accept: "application/pdf,.pdf", hint: "PDF, up to 8 MB", noun: "PDF" },
};

const CATEGORIES: { value: TemplateCategory; title: string; text: string; icon: string }[] = [
  {
    value: "MARKETING",
    title: "Marketing",
    text: "Offers, new listings, announcements.",
    icon: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm13.5-3.5a5 5 0 0 1 0 9M19 5a8.5 8.5 0 0 1 0 14",
  },
  {
    value: "UTILITY",
    title: "Utility",
    text: "Updates about something the person did or asked for: enquiry replies, visit reminders.",
    icon: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Zm-4.3 13a2 2 0 0 1-3.4 0",
  },
  {
    value: "AUTHENTICATION",
    title: "Authentication",
    text: "Login codes. Meta writes the text.",
    icon: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm7 4v2",
  },
];

const HEADER_OPTIONS: { value: HeaderFormat; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "TEXT", label: "Text" },
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "DOCUMENT", label: "Document" },
];

const BUTTON_KINDS: { type: ButtonType; label: string; hint: string; icon: string }[] = [
  { type: "QUICK_REPLY", label: "Quick reply", hint: "A tap sends this text back to you", icon: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" },
  { type: "URL", label: "Visit website", hint: `Opens a link · up to ${LIMITS.urlButtons}`, icon: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" },
  {
    type: "PHONE_NUMBER",
    label: "Call phone",
    hint: `Calls a number · up to ${LIMITS.phoneButtons}`,
    icon: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  },
];

const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fromPrefill(p: BuilderPrefill): State {
  return {
    ...EMPTY,
    name: p.name,
    language: p.language,
    category: p.category,
    headerFormat: p.headerFormat,
    headerText: p.headerFormat === "TEXT" ? p.headerText : "",
    body: p.body,
    footer: p.footer,
    buttons: p.buttons.slice(0, LIMITS.buttons).map((text) => ({ type: "QUICK_REPLY", text })),
  };
}

function fromDraft(d: TemplateDraft): State {
  return {
    ...EMPTY,
    name: d.name,
    language: d.language,
    category: d.category,
    headerFormat: d.header.format === "TEXT" ? "TEXT" : "NONE",
    headerText: d.header.format === "TEXT" ? d.header.text : "",
    headerExample: d.header.format === "TEXT" ? d.header.example : "",
    body: d.body,
    bodyExamples: [...d.bodyExamples],
    footer: d.footer,
    buttons: d.buttons.map((b) => ({ ...b })),
    auth: d.auth
      ? { securityRecommendation: d.auth.securityRecommendation, expiry: d.auth.expiryMinutes == null ? "" : String(d.auth.expiryMinutes), buttonText: d.auth.buttonText }
      : EMPTY.auth,
  };
}

/** Reads a saved draft defensively: anything odd falls back to the empty value. */
function fromSaved(raw: unknown): State | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (v.v !== DRAFT_VERSION) return null;
  const str = (x: unknown, fallback = "") => (typeof x === "string" ? x : fallback);
  const a = (v.auth ?? {}) as Record<string, unknown>;
  return {
    name: str(v.name),
    language: str(v.language, "en") || "en",
    category: CATEGORIES.find((c) => c.value === v.category)?.value ?? "MARKETING",
    headerFormat: HEADER_OPTIONS.find((h) => h.value === v.headerFormat)?.value ?? "NONE",
    headerText: str(v.headerText),
    headerExample: str(v.headerExample),
    body: str(v.body),
    bodyExamples: Array.isArray(v.bodyExamples) ? v.bodyExamples.map((x) => str(x)) : [],
    footer: str(v.footer),
    buttons: (Array.isArray(v.buttons) ? v.buttons : []).slice(0, LIMITS.buttons).flatMap((b): TemplateButton[] => {
      const x = (b ?? {}) as Record<string, unknown>;
      if (x.type === "QUICK_REPLY") return [{ type: "QUICK_REPLY", text: str(x.text) }];
      if (x.type === "URL") return [{ type: "URL", text: str(x.text), url: str(x.url) }];
      if (x.type === "PHONE_NUMBER") return [{ type: "PHONE_NUMBER", text: str(x.text), phone: str(x.phone) }];
      return [];
    }),
    auth: {
      securityRecommendation: a.securityRecommendation !== false,
      expiry: str(a.expiry, EMPTY.auth.expiry),
      buttonText: str(a.buttonText, EMPTY.auth.buttonText),
    },
  };
}

/** Renumbers {{n}} in order of first appearance; `map` is old number → new number. */
function renumber(text: string) {
  const map = new Map<number, number>();
  for (const n of variablesIn(text)) if (!map.has(n)) map.set(n, map.size + 1);
  return { text: text.replace(VAR_RE, (_, n: string) => `{{${map.get(Number(n))}}}`), map };
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function makeButton(type: ButtonType, text = ""): TemplateButton {
  if (type === "URL") return { type, text: text || "Visit website", url: "" };
  if (type === "PHONE_NUMBER") return { type, text: text || "Call us", phone: "" };
  return { type, text };
}

// ---------------------------------------------------------------------------
// WhatsApp formatting → React nodes (no innerHTML)
// ---------------------------------------------------------------------------

/** Text with {{n}} replaced by the sample values; filled ones are highlighted, missing ones stay as {{n}}. */
function withVars(text: string, values: string[], key: string): React.ReactNode[] {
  return text.split(/(\{\{\s*\d+\s*\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{\s*(\d+)\s*\}\}$/);
    if (!m) return part ? <Fragment key={`${key}-${i}`}>{part}</Fragment> : null;
    const value = values[Number(m[1]) - 1]?.trim();
    return (
      <mark key={`${key}-${i}`} className={`rounded px-0.5 ${value ? "bg-[#d9fdd3] text-inherit" : "bg-amber-100 text-amber-800"}`}>
        {value || part}
      </mark>
    );
  });
}

const isWordChar = (c: string | undefined) => Boolean(c && /[A-Za-z0-9]/.test(c));
const isSpace = (c: string | undefined) => Boolean(c && /\s/.test(c));

/** *bold*, _italic_ and ~strike~, nested, the way WhatsApp reads them (markers hug the text, not inside words). */
function inlineMarkup(text: string, values: string[], key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buf = "";
  let k = 0;
  const flush = () => {
    if (buf) out.push(...withVars(buf, values, `${key}-t${k++}`));
    buf = "";
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if ((c === "*" || c === "_" || c === "~") && !isWordChar(text[i - 1]) && text[i + 1] && !isSpace(text[i + 1]) && text[i + 1] !== c) {
      let close = -1;
      for (let j = i + 1; j < text.length && text[j] !== "\n"; j++) {
        if (text[j] === c && !isSpace(text[j - 1]) && !isWordChar(text[j + 1])) {
          close = j;
          break;
        }
      }
      if (close > i + 1) {
        flush();
        const inner = inlineMarkup(text.slice(i + 1, close), values, `${key}-${k}`);
        const nodeKey = `${key}-m${k++}`;
        out.push(c === "*" ? <strong key={nodeKey}>{inner}</strong> : c === "_" ? <em key={nodeKey}>{inner}</em> : <s key={nodeKey}>{inner}</s>);
        i = close + 1;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Full WhatsApp markup: ```monospace``` blocks first, then the inline markers. */
function Rich({ text, values = [] }: { text: string; values?: string[] }) {
  const out: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  for (;;) {
    const start = rest.indexOf("```");
    const end = start >= 0 ? rest.indexOf("```", start + 3) : -1;
    if (start < 0 || end < 0 || end === start + 3) break;
    out.push(...inlineMarkup(rest.slice(0, start), values, `r${k}`));
    out.push(
      <code key={`c${k}`} className="font-mono text-[12.5px]">
        {withVars(rest.slice(start + 3, end), values, `c${k}`)}
      </code>,
    );
    k++;
    rest = rest.slice(end + 3);
  }
  out.push(...inlineMarkup(rest, values, `r${k}`));
  return <>{out}</>;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Icon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Card({ title, description, aside, children }: { title: string; description?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-[var(--s-shadow)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-extrabold tracking-tight text-[var(--s-text)]">{title}</h2>
        {aside}
      </div>
      {description && <div className="mt-1 text-sm text-[var(--s-muted)]">{description}</div>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <span className={`text-xs font-semibold tabular-nums ${over ? "text-[var(--s-late)]" : value > max * 0.9 ? "text-amber-600" : "text-[var(--s-muted)]"}`}>
      {value}/{max}
    </span>
  );
}

function Optional() {
  return <span className="ml-1 font-medium text-[var(--s-muted)] opacity-80">(optional)</span>;
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-2xl bg-[var(--s-seg)] p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition-colors sm:px-4 ${
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

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-2xl border border-[var(--s-border)] p-4 text-left transition-colors hover:border-[var(--s-border-strong)]"
    >
      <span className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-[var(--brand)]" : "bg-[var(--s-border-strong)]"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold text-[var(--s-text)]">{label}</span>
        <span className="block text-xs text-[var(--s-muted)]">{description}</span>
      </span>
    </button>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-lg text-sm text-[var(--s-text-2)] transition-colors hover:bg-[var(--s-hover)] hover:text-[var(--s-text)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function AddVariableButton({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--brand)] transition-colors hover:bg-[var(--s-brand-soft)] disabled:cursor-not-allowed disabled:text-[var(--s-muted)] disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <span aria-hidden className="text-sm leading-none">+</span> Add variable
    </button>
  );
}

/** "+ Add button" with a small menu; options turn off once Meta's limit for that kind is reached. */
function AddButtonMenu({ canAdd, onAdd, disabled }: { canAdd: Record<ButtonType, boolean>; onAdd: (t: ButtonType) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const any = Object.values(canAdd).some(Boolean);
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || !any}
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary px-4 py-2 text-sm"
      >
        <span aria-hidden>+</span> Add button
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-[var(--s-border)] bg-white p-1.5 shadow-[0_12px_32px_rgba(10,16,12,0.14)]">
          {BUTTON_KINDS.map((k) => (
            <button
              key={k.type}
              type="button"
              role="menuitem"
              disabled={!canAdd[k.type]}
              onClick={() => {
                onAdd(k.type);
                setOpen(false);
              }}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--s-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--s-seg)] text-[var(--s-text-2)]">
                <Icon d={k.icon} className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-[var(--s-text)]">{k.label}</span>
                <span className="block text-xs text-[var(--s-muted)]">{canAdd[k.type] ? k.hint : "Limit reached"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

const PREVIEW_ICONS: Record<string, string> = {
  QUICK_REPLY: BUTTON_KINDS[0].icon,
  URL: BUTTON_KINDS[1].icon,
  PHONE_NUMBER: BUTTON_KINDS[2].icon,
  COPY: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  LIST: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
};
const MEDIA_ICONS: Record<MediaFormat, string> = {
  IMAGE: "M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z",
  VIDEO: "M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z",
  DOCUMENT: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5",
};

function PreviewButton({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-t border-zinc-100 px-3 py-2 text-center text-[13.5px] font-semibold text-[#027eb5]">
      <Icon d={PREVIEW_ICONS[icon]} className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}

function Preview({ s, media, businessName }: { s: State; media: Media | null; businessName: string }) {
  const auth = s.category === "AUTHENTICATION";
  const expiry = Number(s.auth.expiry);
  const mediaFormat = s.headerFormat !== "NONE" && s.headerFormat !== "TEXT" ? s.headerFormat : null;
  const shownMedia = mediaFormat && media?.format === mediaFormat ? media : null;

  type Btn = { icon: string; text: string };
  const buttons: Btn[] = auth
    ? [{ icon: "COPY", text: s.auth.buttonText.trim() || "Copy code" }]
    : s.buttons.map((b) => ({ icon: b.type, text: b.text.trim() || (b.type === "QUICK_REPLY" ? "Quick reply" : b.type === "URL" ? "Visit website" : "Call us") }));
  // WhatsApp shows up to three buttons; with more, two and "See all options".
  const shownButtons = buttons.length > 3 ? [...buttons.slice(0, 2), { icon: "LIST", text: "See all options" }] : buttons;

  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2.75rem] bg-zinc-900 p-2.5 shadow-[0_20px_50px_rgba(10,16,12,0.22)]">
      <div className="overflow-hidden rounded-[2.25rem] bg-[#efe7de]">
        {/* Status bar + chat header */}
        <div className="bg-[#075e54] text-white">
          <div className="relative flex items-center justify-between px-6 pt-2.5 pb-1 text-[11px] font-semibold text-white/90">
            <span>9:41</span>
            <span aria-hidden className="absolute top-2 left-1/2 h-4 w-20 -translate-x-1/2 rounded-full bg-zinc-900" />
            <span aria-hidden className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-[2px] border border-white/80" />
            </span>
          </div>
          <div className="flex items-center gap-2.5 px-3 pt-1 pb-2.5">
            <Icon d="M15 18l-6-6 6-6" className="size-5 shrink-0 text-white/90" />
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-extrabold">
              {businessName.trim().charAt(0).toUpperCase() || "B"}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate text-sm font-bold">
                <span className="truncate">{businessName}</span>
                <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-[#25d366]" fill="currentColor" aria-label="Verified business">
                  <path d="M10 1.5 12.2 3l2.7-.1.8 2.6 2.2 1.6-.9 2.5.9 2.6-2.2 1.5-.8 2.6-2.7-.1L10 18.5 7.8 17l-2.7.1-.8-2.6L2.1 13l.9-2.6L2.1 8l2.2-1.6.8-2.6 2.7.1L10 1.5Z" />
                  <path d="m6.8 10.2 2.1 2.1 4.3-4.4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </p>
              <p className="truncate text-[11px] text-white/75">Business account</p>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="min-h-[26rem] bg-[radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:14px_14px] px-3 py-4">
          <p className="mx-auto mb-3 w-fit rounded-lg bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-500 shadow-sm">Today</p>
          <div className="relative max-w-[17.5rem]">
            <svg viewBox="0 0 8 13" className="absolute top-0 -left-[7px] h-[13px] w-2 text-white" aria-hidden>
              <path d="M8 0H1.5C.4 0-.3 1.3.4 2.2L8 13V0Z" fill="currentColor" />
            </svg>
            <div className="overflow-hidden rounded-xl rounded-tl-none bg-white text-[14px] leading-snug text-zinc-900 shadow-sm">
              <div className="p-1">
                {!auth && mediaFormat && (
                  <div className="mb-1 overflow-hidden rounded-lg bg-zinc-100">
                    {shownMedia?.previewUrl && mediaFormat === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview of the sample the admin just picked
                      <img src={shownMedia.previewUrl} alt="Header sample" className="aspect-[1.91/1] w-full object-cover" />
                    ) : shownMedia?.previewUrl && mediaFormat === "VIDEO" ? (
                      <div className="relative">
                        <video src={shownMedia.previewUrl} muted playsInline preload="metadata" className="aspect-[1.91/1] w-full bg-black object-cover" />
                        <span aria-hidden className="absolute inset-0 grid place-items-center">
                          <span className="grid size-11 place-items-center rounded-full bg-black/45 text-white">
                            <svg viewBox="0 0 20 20" className="ml-0.5 size-5" fill="currentColor">
                              <path d="M6 4.5v11l9-5.5-9-5.5Z" />
                            </svg>
                          </span>
                        </span>
                      </div>
                    ) : mediaFormat === "DOCUMENT" ? (
                      <div className="flex items-center gap-2.5 bg-zinc-50 px-3 py-3">
                        <span className="grid h-10 w-8 shrink-0 place-items-center rounded bg-red-500 text-[9px] font-extrabold text-white">PDF</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{shownMedia?.fileName || "document.pdf"}</span>
                          <span className="block text-[11px] text-zinc-500">{shownMedia ? `PDF · ${formatSize(shownMedia.size)}` : "PDF"}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="flex aspect-[1.91/1] flex-col items-center justify-center gap-1 text-zinc-400">
                        <Icon d={MEDIA_ICONS[mediaFormat]} />
                        <span className="text-[11px] font-semibold">{mediaFormat.toLowerCase()} header</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="px-2 pt-1 pb-1">
                  {auth ? (
                    <p className="break-words whitespace-pre-wrap">
                      <Rich text={`*123456* is your verification code.${s.auth.securityRecommendation ? " For your security, do not share this code." : ""}`} />
                    </p>
                  ) : (
                    <>
                      {s.headerFormat === "TEXT" && s.headerText.trim() && (
                        <p className="mb-1 font-bold break-words">{withVars(s.headerText, [s.headerExample], "h")}</p>
                      )}
                      {s.body.trim() ? (
                        <p className="break-words whitespace-pre-wrap">
                          <Rich text={s.body} values={s.bodyExamples} />
                        </p>
                      ) : (
                        <p className="text-zinc-400 italic">Your message text appears here.</p>
                      )}
                    </>
                  )}
                  {auth
                    ? Number.isFinite(expiry) &&
                      expiry > 0 &&
                      s.auth.expiry.trim() && <p className="mt-1 text-[12px] text-zinc-500">This code expires in {expiry} minutes.</p>
                    : s.footer.trim() && <p className="mt-1 text-[12px] break-words text-zinc-500">{s.footer}</p>}
                  <p className="mt-0.5 text-right text-[10px] text-zinc-400">9:41</p>
                </div>
              </div>
              {shownButtons.map((b, i) => (
                <PreviewButton key={i} icon={b.icon} text={b.text} />
              ))}
            </div>
          </div>
        </div>

        {/* Message bar */}
        <div aria-hidden className="flex items-center gap-2 bg-[#efe7de] px-2.5 pb-4">
          <div className="flex h-10 flex-1 items-center rounded-full bg-white px-4 text-sm text-zinc-400 shadow-sm">Message</div>
          <span className="grid size-10 place-items-center rounded-full bg-[#00a884] text-white">
            <Icon d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v2" className="size-[18px]" />
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function TemplateBuilder({
  disabled,
  prefill,
  suggestion = null,
  existing,
  businessName,
}: {
  disabled: boolean;
  prefill: BuilderPrefill | null;
  suggestion?: BuilderSuggestion | null;
  existing: { name: string; language: string }[];
  businessName: string;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const [s, setS] = useState<State>(() => (suggestion ? fromDraft(suggestion.draft) : prefill ? fromPrefill(prefill) : EMPTY));
  const update = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const [media, setMedia] = useState<Media | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [copied, setCopied] = useState(Boolean(prefill || suggestion));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; status: string; name: string; linked: boolean } | null>(null);
  const [submitting, startSubmit] = useTransition();
  const restored = useRef(false);
  const finished = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore the draft once, after hydration. A "Copy as new" or "?for" prefill wins over it.
  const prefilled = Boolean(prefill || suggestion);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (prefilled) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const saved = raw ? fromSaved(JSON.parse(raw)) : null;
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after hydration
        setS(saved);
        setRestoredDraft(JSON.stringify(saved) !== JSON.stringify(EMPTY));
      }
    } catch {
      // Storage blocked or a corrupt draft: start fresh.
    }
  }, [prefilled]);

  // Save the draft (debounced). The media handle isn't kept: it needs a fresh upload.
  useEffect(() => {
    if (!restored.current || finished.current) return;
    const timer = setTimeout(() => {
      try {
        if (JSON.stringify(s) === JSON.stringify(EMPTY)) localStorage.removeItem(DRAFT_KEY);
        else localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: DRAFT_VERSION, ...s }));
      } catch {
        // Storage full or blocked: the draft just isn't kept.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [s]);

  // Free the local preview of a replaced or removed sample file.
  useEffect(() => {
    const url = media?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [media]);

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  // ----- Derived -----
  const auth = s.category === "AUTHENTICATION";
  const mediaFormat = s.headerFormat !== "NONE" && s.headerFormat !== "TEXT" ? s.headerFormat : null;
  const currentMedia = mediaFormat && media?.format === mediaFormat ? media : null;

  const draft: TemplateDraft = useMemo(() => {
    const expiry = s.auth.expiry.trim();
    const n = Number(expiry);
    return {
      name: s.name,
      language: s.language,
      category: s.category,
      header:
        s.headerFormat === "NONE"
          ? { format: "NONE" }
          : s.headerFormat === "TEXT"
            ? { format: "TEXT", text: s.headerText, example: s.headerExample }
            : { format: s.headerFormat, handle: media?.format === s.headerFormat ? media.handle : "", fileName: media?.fileName },
      body: s.body,
      bodyExamples: s.bodyExamples,
      footer: s.footer,
      buttons: s.buttons,
      auth: s.category === "AUTHENTICATION" ? { securityRecommendation: s.auth.securityRecommendation, expiryMinutes: expiry ? (Number.isFinite(n) ? n : -1) : null, buttonText: s.auth.buttonText } : undefined,
    };
  }, [s, media]);

  const duplicate = existing.some((t) => t.name === s.name && t.language === s.language);
  const problems = useMemo(() => {
    const p = templateProblems(draft);
    if (duplicate) p.unshift("A template with this name and language already exists. Choose another name or language.");
    if (uploading) p.push("Wait for the sample file to finish uploading.");
    return p;
  }, [draft, duplicate, uploading]);

  const nameValid = /^[a-z0-9_]*$/.test(s.name);
  const bodyVars = useMemo(() => [...new Set(variablesIn(s.body))].sort((a, b) => a - b), [s.body]);
  const needsRenumber = useMemo(() => s.body !== renumber(s.body).text, [s.body]);
  const headerHasVar = variablesIn(s.headerText).length > 0;
  const dirty = JSON.stringify(s) !== JSON.stringify(EMPTY) || Boolean(media);

  const languageOptions: DropdownOption[] = useMemo(() => {
    const opts = LANGUAGES.map((l) => ({ value: l.value, label: l.label, hint: l.value }));
    if (!opts.some((o) => o.value === s.language) && s.language) opts.push({ value: s.language, label: s.language, hint: "from the copied template" });
    return opts;
  }, [s.language]);

  const counts = {
    total: s.buttons.length,
    url: s.buttons.filter((b) => b.type === "URL").length,
    phone: s.buttons.filter((b) => b.type === "PHONE_NUMBER").length,
  };
  const canAdd: Record<ButtonType, boolean> = {
    QUICK_REPLY: counts.total < LIMITS.buttons,
    URL: counts.total < LIMITS.buttons && counts.url < LIMITS.urlButtons,
    PHONE_NUMBER: counts.total < LIMITS.buttons && counts.phone < LIMITS.phoneButtons,
  };

  // ----- Text editing -----
  function editBody(fn: (text: string, start: number, end: number) => { text: string; selStart: number; selEnd: number }) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? s.body.length;
    const end = el?.selectionEnd ?? start;
    const r = fn(s.body, start, end);
    update({ body: r.text });
    requestAnimationFrame(() => {
      const t = bodyRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(r.selStart, r.selEnd);
    });
  }

  function wrap(marker: string) {
    editBody((text, a, b) => {
      // Keep spaces outside the markers: WhatsApp ignores "* bold *".
      while (a < b && isSpace(text[a])) a++;
      while (b > a && isSpace(text[b - 1])) b--;
      const next = text.slice(0, a) + marker + text.slice(a, b) + marker + text.slice(b);
      return { text: next, selStart: a + marker.length, selEnd: b + marker.length };
    });
  }

  function addBodyVariable() {
    const n = Math.max(0, ...variablesIn(s.body)) + 1;
    editBody((text, a, b) => {
      const before = a > 0 && !isSpace(text[a - 1]) ? " " : "";
      const after = b < text.length && !isSpace(text[b]) ? " " : "";
      const token = `${before}{{${n}}}${after}`;
      const pos = a + token.length - after.length;
      return { text: text.slice(0, a) + token + text.slice(b), selStart: pos, selEnd: pos };
    });
  }

  function fixNumbering() {
    const { text, map } = renumber(s.body);
    const examples: string[] = [];
    map.forEach((to, from) => {
      examples[to - 1] = s.bodyExamples[from - 1] ?? "";
    });
    update({ body: text, bodyExamples: Array.from(examples, (x) => x ?? "") });
  }

  function setExample(n: number, value: string) {
    setS((prev) => {
      const next = [...prev.bodyExamples];
      while (next.length < n) next.push("");
      next[n - 1] = value;
      return { ...prev, bodyExamples: next };
    });
  }

  function addHeaderVariable() {
    if (headerHasVar) return;
    const el = headerRef.current;
    const text = s.headerText;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? a;
    const before = a > 0 && !isSpace(text[a - 1]) ? " " : "";
    const token = `${before}{{1}}`;
    update({ headerText: text.slice(0, a) + token + text.slice(b) });
    requestAnimationFrame(() => {
      const t = headerRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(a + token.length, a + token.length);
    });
  }

  // ----- Media -----
  async function onFile(file: File | undefined) {
    if (!file || !mediaFormat || disabled) return;
    const rule = MEDIA_RULES[mediaFormat];
    setUploadError(null);
    if (!rule.types.includes(file.type)) return setUploadError(`Choose a ${rule.hint.split(",")[0]} file for an ${mediaFormat.toLowerCase()} header.`);
    if (file.size > rule.max) return setUploadError(`That file is ${formatSize(file.size)}. The limit is ${formatSize(rule.max)}.`);
    const format = mediaFormat;
    setUploading(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadTemplateSample(fd);
      if (res.ok) {
        setMedia({ format, handle: res.handle, fileName: file.name, size: file.size, previewUrl: format === "DOCUMENT" ? null : URL.createObjectURL(file) });
      } else setUploadError(res.error);
    } catch {
      setUploadError("The upload failed. Check your connection and try again (very large files can also fail).");
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ----- Buttons -----
  function addButton(type: ButtonType) {
    if (!canAdd[type]) return;
    setS((prev) => {
      const list = [...prev.buttons];
      // Keep quick replies together (Meta rejects them mixed between other buttons).
      const isQuick = type === "QUICK_REPLY";
      let at = -1;
      list.forEach((b, i) => {
        if ((b.type === "QUICK_REPLY") === isQuick) at = i;
      });
      list.splice(at >= 0 ? at + 1 : list.length, 0, makeButton(type));
      return { ...prev, buttons: list };
    });
  }

  function setButton(i: number, b: TemplateButton) {
    setS((prev) => ({ ...prev, buttons: prev.buttons.map((x, j) => (j === i ? b : x)) }));
  }

  function moveButton(i: number, dir: -1 | 1) {
    setS((prev) => {
      const list = [...prev.buttons];
      const j = i + dir;
      if (j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...prev, buttons: list };
    });
  }

  function removeButton(i: number) {
    setS((prev) => ({ ...prev, buttons: prev.buttons.filter((_, j) => j !== i) }));
  }

  // ----- Submit / reset -----
  function reset() {
    clearDraft();
    setS(EMPTY);
    setMedia(null);
    setUploadError(null);
    setSubmitError(null);
    setRestoredDraft(false);
    setCopied(false);
  }

  async function startOver() {
    const ok = await confirm({ title: "Start over?", message: "This clears everything you've entered for this template.", confirmLabel: "Start over", danger: true });
    if (ok) reset();
  }

  function createAnother() {
    finished.current = false;
    setDone(null);
    reset();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit() {
    if (problems.length || disabled) return;
    const lang = LANGUAGES.find((l) => l.value === s.language)?.label ?? s.language;
    const ok = await confirm({
      title: "Submit to Meta for review?",
      message: (
        <>
          <strong className="font-mono">{s.name}</strong> ({lang}, {s.category.toLowerCase()}) goes to Meta for review, usually within minutes and at most 24 hours. Once
          submitted it can&apos;t be edited here: to change it, create a new template.
          {s.category === "MARKETING" && " Marketing messages are charged at a higher rate per delivered message."}
        </>
      ),
      confirmLabel: "Submit",
    });
    if (!ok) return;
    setSubmitError(null);
    startSubmit(async () => {
      try {
        // Link it to the website message only while it's still the suggested one (not after "Start over").
        const res = await createTemplate(draft, suggestion && copied ? suggestion.key : undefined);
        if (res?.ok) {
          finished.current = true;
          clearDraft();
          setDone({ message: res.message ?? "Sent to Meta for review.", status: res.status ?? "PENDING", name: draft.name, linked: Boolean(res.linked) });
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else setSubmitError(res?.error ?? "Meta didn't accept the template.");
      } catch {
        setSubmitError("Couldn't submit the template. Check your connection and try again.");
      }
    });
  }

  // ---------------------------------------------------------------------------

  const fieldsetDisabled = disabled || submitting;

  return (
    <div ref={topRef} className="scroll-mt-6">
      {restoredDraft && !done && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--s-brand-soft)] px-4 py-3 text-sm text-[var(--s-text-2)]">
          <span>
            <strong className="text-[var(--brand)]">Draft restored.</strong> Carry on where you left off
            {s.headerFormat !== "NONE" && s.headerFormat !== "TEXT" ? "; upload the header sample again." : "."}
          </span>
          <button type="button" onClick={startOver} className="text-sm font-bold text-[var(--s-text-2)] underline underline-offset-2 hover:text-[var(--s-text)]">
            Start over
          </button>
        </div>
      )}
      {suggestion && copied && !done && (
        <div className="mb-6 rounded-2xl bg-[var(--s-brand-soft)] px-4 py-3 text-sm text-[var(--s-text-2)]">
          Creating the template for: <strong className="text-[var(--s-text)]">{suggestion.purpose}</strong>.{" "}
          {suggestion.key === "otp_login" ? "Link it in Settings once Meta approves it." : "It will be linked automatically once submitted."}
        </div>
      )}
      {!suggestion && prefill && copied && !done && (
        <div className="mb-6 rounded-2xl bg-[var(--s-seg)] px-4 py-3 text-sm text-[var(--s-text-2)]">
          Copied from <strong className="font-mono text-[var(--s-text)]">{prefill.source}</strong>.
          {prefill.buttons.length > 0 && " Buttons came over as quick replies: change the type and add links or numbers where needed."}
          {mediaFormat && " Upload a new header sample."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        {done ? (
          <section className="rounded-3xl bg-white p-8 text-center shadow-[var(--s-shadow)]">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--s-brand-soft)] text-[var(--brand)]">
              <svg viewBox="0 0 20 20" className="size-7" fill="currentColor" aria-hidden>
                <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
              </svg>
            </span>
            <h2 className="mt-4 text-xl font-extrabold tracking-tight text-[var(--s-text)]">{done.status === "APPROVED" ? "Template approved" : "Sent to Meta for review"}</h2>
            <p role="status" className="mx-auto mt-2 max-w-md text-sm text-[var(--s-muted)]">
              {done.message}
            </p>
            <p className="mt-3">
              <span className="inline-flex rounded-lg bg-[var(--s-seg)] px-2 py-1 font-mono text-xs font-semibold text-[var(--s-text-2)]">{done.name}</span>
              <span className="ml-2 rounded-lg bg-[var(--s-brand-soft)] px-2 py-1 text-[11px] font-bold text-[var(--brand)]">{done.status.toLowerCase().replace(/_/g, " ")}</span>
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/admin/templates" className="btn-primary px-5 py-2 text-sm">
                Back to templates
              </Link>
              {done.linked && (
                <Link href="/admin/settings?section=templates" className="btn-secondary px-5 py-2 text-sm">
                  WhatsApp templates settings
                </Link>
              )}
              <button type="button" onClick={createAnother} className="btn-secondary px-5 py-2 text-sm">
                Create another
              </button>
            </div>
          </section>
        ) : (
          <fieldset disabled={fieldsetDisabled} className="min-w-0 space-y-6 disabled:opacity-90">
            {/* Category */}
            <Card
              title="Category"
              description={
                <>
                  Meta may change the category if the content doesn&apos;t fit it. Marketing messages cost more per message than utility or authentication ones.
                </>
              }
            >
              <div role="radiogroup" aria-label="Category" className="grid gap-3 sm:grid-cols-3">
                {CATEGORIES.map((c) => {
                  const on = c.value === s.category;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => update({ category: c.value })}
                      className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors ${
                        on
                          ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_3%,#fff)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_10%,transparent)]"
                          : "border-[var(--s-border)] hover:border-[var(--s-border-strong)] hover:bg-[var(--s-hover)]"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className={`grid size-9 place-items-center rounded-xl ${on ? "bg-[var(--brand)] text-white" : "bg-[var(--s-seg)] text-[var(--s-text-2)]"}`}>
                          <Icon d={c.icon} className="size-[18px]" />
                        </span>
                        <span aria-hidden className={`grid size-5 place-items-center rounded-full border-2 ${on ? "border-[var(--brand)]" : "border-[var(--s-border-strong)]"}`}>
                          {on && <span className="size-2.5 rounded-full bg-[var(--brand)]" />}
                        </span>
                      </span>
                      <span className="block text-sm font-extrabold text-[var(--s-text)]">{c.title}</span>
                      <span className="block text-xs leading-relaxed text-[var(--s-muted)]">{c.text}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Name & language */}
            <Card title="Name and language" description="The name is how broadcasts and website messages refer to this template. It can't be changed later.">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="tpl-name" className="label">
                      Template name
                    </label>
                    <Counter value={s.name.length} max={LIMITS.name} />
                  </div>
                  <input
                    id="tpl-name"
                    value={s.name}
                    onChange={(e) => update({ name: e.target.value.toLowerCase().replace(/[\s-]+/g, "_") })}
                    placeholder="e.g. new_listing_alert"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!nameValid || duplicate}
                    aria-describedby="tpl-name-hint"
                    className="input font-mono"
                  />
                  <p id="tpl-name-hint" className={`mt-1.5 text-xs font-semibold ${!nameValid || duplicate ? "text-[var(--s-late)]" : "text-[var(--s-muted)]"}`}>
                    {duplicate
                      ? "A template with this name and language already exists."
                      : nameValid
                        ? "Only a-z, 0-9 and _ (spaces become _)."
                        : "Only a-z, 0-9 and _ are allowed. Remove the other characters."}
                  </p>
                </div>
                <div>
                  <label htmlFor="tpl-lang" className="label">
                    Language
                  </label>
                  <Dropdown
                    id="tpl-lang"
                    variant="field"
                    label="Language"
                    options={languageOptions}
                    value={s.language}
                    onChange={(language) => update({ language })}
                    searchable
                    searchPlaceholder="Search languages…"
                    disabled={fieldsetDisabled}
                  />
                </div>
              </div>
            </Card>

            {auth ? (
              <Card title="Login code" description="Meta writes the text of authentication templates. You choose the extras below, and each message fills in the code.">
                <Toggle
                  checked={s.auth.securityRecommendation}
                  onChange={(securityRecommendation) => update({ auth: { ...s.auth, securityRecommendation } })}
                  label="Add security recommendation"
                  description="Adds “For your security, do not share this code.”"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tpl-expiry" className="label">
                      Code expires after (minutes)
                      <Optional />
                    </label>
                    <input
                      id="tpl-expiry"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={90}
                      value={s.auth.expiry}
                      onChange={(e) => update({ auth: { ...s.auth, expiry: e.target.value } })}
                      placeholder="e.g. 10"
                      className="input"
                    />
                    <p className="mt-1.5 text-xs text-[var(--s-muted)]">1 to 90. Leave empty to not mention an expiry.</p>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor="tpl-copy" className="label">
                        Copy-code button text
                      </label>
                      <Counter value={s.auth.buttonText.length} max={LIMITS.buttonText} />
                    </div>
                    <input
                      id="tpl-copy"
                      value={s.auth.buttonText}
                      onChange={(e) => update({ auth: { ...s.auth, buttonText: e.target.value } })}
                      maxLength={LIMITS.buttonText}
                      placeholder="Copy code"
                      className="input"
                    />
                  </div>
                </div>
              </Card>
            ) : (
              <>
                {/* Header */}
                <Card title="Header" description="An optional title line or a picture, video or PDF above the message.">
                  <Segmented
                    label="Header type"
                    value={s.headerFormat}
                    options={HEADER_OPTIONS}
                    onChange={(headerFormat) => {
                      update({ headerFormat });
                      setUploadError(null);
                    }}
                  />
                  {s.headerFormat === "TEXT" && (
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <label htmlFor="tpl-header" className="label">
                            Header text
                          </label>
                          <span className="flex items-center gap-2">
                            <AddVariableButton onClick={addHeaderVariable} disabled={headerHasVar} title={headerHasVar ? "The header can have only one variable" : undefined} />
                            <Counter value={s.headerText.length} max={LIMITS.headerText} />
                          </span>
                        </div>
                        <input
                          id="tpl-header"
                          ref={headerRef}
                          value={s.headerText}
                          onChange={(e) => update({ headerText: e.target.value })}
                          placeholder="e.g. New listing in {{1}}"
                          className="input"
                        />
                      </div>
                      {headerHasVar && (
                        <div>
                          <label htmlFor="tpl-header-ex" className="label">
                            Sample for header {"{{1}}"}
                          </label>
                          <input
                            id="tpl-header-ex"
                            value={s.headerExample}
                            onChange={(e) => update({ headerExample: e.target.value })}
                            placeholder="e.g. Whitefield"
                            className="input"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {mediaFormat && (
                    <div className="space-y-3">
                      <div
                        role="button"
                        tabIndex={fieldsetDisabled ? -1 : 0}
                        aria-disabled={fieldsetDisabled}
                        aria-label={`Upload a sample ${MEDIA_RULES[mediaFormat].noun}`}
                        onClick={() => !fieldsetDisabled && !uploading && fileRef.current?.click()}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !fieldsetDisabled && !uploading) {
                            e.preventDefault();
                            fileRef.current?.click();
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!fieldsetDisabled) setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          if (!uploading) void onFile(e.dataTransfer.files?.[0]);
                        }}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                          dragging
                            ? "border-[var(--brand)] bg-[var(--s-brand-soft)]"
                            : "border-[var(--s-border-strong)] hover:border-[#c3c9c5] hover:bg-[var(--s-hover)]"
                        } ${fieldsetDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {uploading ? (
                          <>
                            <span className="size-8 animate-spin rounded-full border-[3px] border-[var(--s-seg)] border-t-[var(--brand)]" aria-hidden />
                            <p className="text-sm font-bold text-[var(--s-text)]">Uploading {uploading}…</p>
                            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--s-seg)]">
                              <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--brand)]" />
                            </div>
                          </>
                        ) : currentMedia ? (
                          <div className="flex w-full items-center gap-3 text-left">
                            {currentMedia.previewUrl && currentMedia.format === "IMAGE" ? (
                              // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview of the chosen sample
                              <img src={currentMedia.previewUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                            ) : (
                              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-[var(--s-seg)] text-[var(--s-text-2)]">
                                <Icon d={MEDIA_ICONS[currentMedia.format]} />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold text-[var(--s-text)]">{currentMedia.fileName}</span>
                              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--brand)]">
                                <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden>
                                  <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                                </svg>
                                Uploaded · {formatSize(currentMedia.size)}
                              </span>
                            </span>
                            <span className="text-xs font-bold text-[var(--s-text-2)] underline underline-offset-2">Replace</span>
                          </div>
                        ) : (
                          <>
                            <span className="grid size-11 place-items-center rounded-2xl bg-[var(--s-seg)] text-[var(--s-text-2)]">
                              <Icon d={MEDIA_ICONS[mediaFormat]} />
                            </span>
                            <p className="text-sm font-bold text-[var(--s-text)]">
                              Drop a sample {MEDIA_RULES[mediaFormat].noun} here, or <span className="text-[var(--brand)] underline underline-offset-2">choose a file</span>
                            </p>
                            <p className="text-xs text-[var(--s-muted)]">{MEDIA_RULES[mediaFormat].hint}</p>
                          </>
                        )}
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept={MEDIA_RULES[mediaFormat].accept}
                        className="hidden"
                        onChange={(e) => void onFile(e.target.files?.[0])}
                        tabIndex={-1}
                      />
                      {uploadError && (
                        <p role="alert" className="text-xs font-bold text-[var(--s-late)]">
                          {uploadError}
                        </p>
                      )}
                      <p className="text-xs text-[var(--s-muted)]">
                        This file is only a sample for Meta&apos;s review. Each broadcast picks its own {MEDIA_RULES[mediaFormat].noun} when it&apos;s sent.
                      </p>
                    </div>
                  )}
                </Card>

                {/* Body */}
                <Card title="Body" description="The message itself. Use variables for the parts that change per person, like their name or a locality.">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor="tpl-body" className="label">
                        Message text
                      </label>
                      <Counter value={s.body.length} max={LIMITS.body} />
                    </div>
                    <div className="overflow-hidden rounded-[14px] border border-[var(--s-border-strong)] bg-white shadow-[var(--s-field-shadow)] transition-[border-color,box-shadow] focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_16%,transparent)]">
                      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-[var(--s-border)] bg-[color-mix(in_srgb,var(--s-seg)_50%,#fff)] px-1.5 py-1">
                        <ToolButton label="Bold (*text*)" onClick={() => wrap("*")}>
                          <span className="font-extrabold">B</span>
                        </ToolButton>
                        <ToolButton label="Italic (_text_)" onClick={() => wrap("_")}>
                          <span className="font-serif italic">I</span>
                        </ToolButton>
                        <ToolButton label="Strikethrough (~text~)" onClick={() => wrap("~")}>
                          <span className="line-through">S</span>
                        </ToolButton>
                        <ToolButton label="Monospace (```text```)" onClick={() => wrap("```")}>
                          <span className="font-mono text-xs">{"</>"}</span>
                        </ToolButton>
                        <span aria-hidden className="mx-1 h-5 w-px bg-[var(--s-border)]" />
                        <AddVariableButton onClick={addBodyVariable} />
                      </div>
                      <textarea
                        id="tpl-body"
                        ref={bodyRef}
                        value={s.body}
                        onChange={(e) => update({ body: e.target.value })}
                        rows={8}
                        placeholder={"e.g. Hi {{1}}, a new {{2}} just came up in your area. Reply to this message and we'll set up a visit."}
                        className="block w-full resize-y border-0 bg-transparent px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {needsRenumber && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <span>Variables should be numbered {"{{1}}, {{2}}, …"} in the order they appear.</span>
                      <button type="button" onClick={fixNumbering} className="btn-secondary px-3 py-1.5 text-xs">
                        Fix numbering
                      </button>
                    </div>
                  )}

                  {bodyVars.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-[var(--s-muted)]">Sample values (Meta reviews the message with these)</p>
                      {bodyVars.map((n) => (
                        <div key={n} className="grid items-center gap-2 sm:grid-cols-[4rem_minmax(0,1fr)]">
                          <label htmlFor={`tpl-ex-${n}`} className="font-mono text-sm font-bold text-[var(--brand)]">
                            {`{{${n}}}`}
                          </label>
                          <input
                            id={`tpl-ex-${n}`}
                            value={s.bodyExamples[n - 1] ?? ""}
                            onChange={(e) => setExample(n, e.target.value)}
                            placeholder={`Sample for {{${n}}}, e.g. ${n === 1 ? "Ravi" : n === 2 ? "3 BHK apartment" : "Whitefield"}`}
                            className="input"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Footer */}
                <Card title="Footer" description="A short grey line under the message, e.g. “Reply STOP to opt out”.">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor="tpl-footer" className="label">
                        Footer text
                        <Optional />
                      </label>
                      <Counter value={s.footer.length} max={LIMITS.footer} />
                    </div>
                    <input id="tpl-footer" value={s.footer} onChange={(e) => update({ footer: e.target.value })} placeholder="e.g. Brixora · Reply STOP to opt out" className="input" />
                  </div>
                </Card>

                {/* Buttons */}
                <Card
                  title="Buttons"
                  description={`Optional. Up to ${LIMITS.buttons} buttons: at most ${LIMITS.urlButtons} website and ${LIMITS.phoneButtons} call button. WhatsApp shows three; with more, the rest go under “See all options”.`}
                  aside={<span className="text-xs font-semibold text-[var(--s-muted)] tabular-nums">{counts.total}/{LIMITS.buttons}</span>}
                >
                  {s.buttons.length > 0 && (
                    <ol className="space-y-3">
                      {s.buttons.map((b, i) => {
                        const kind = BUTTON_KINDS.find((k) => k.type === b.type)!;
                        const typeOptions: DropdownOption[] = BUTTON_KINDS.map((k) => ({
                          value: k.type,
                          label: k.label,
                          disabled: k.type !== b.type && !(k.type === "QUICK_REPLY" || (k.type === "URL" ? counts.url < LIMITS.urlButtons : counts.phone < LIMITS.phoneButtons)),
                        }));
                        return (
                          <li key={i} className="rounded-2xl border border-[var(--s-border)] p-3 sm:p-4">
                            <div className="flex items-center gap-2">
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--s-seg)] text-[var(--s-text-2)]">
                                <Icon d={kind.icon} className="size-4" />
                              </span>
                              <div className="w-44 min-w-0">
                                <Dropdown
                                  variant="field"
                                  label={`Button ${i + 1} type`}
                                  options={typeOptions}
                                  value={b.type}
                                  disabled={fieldsetDisabled}
                                  onChange={(t) => setButton(i, makeButton(t as ButtonType, b.text))}
                                />
                              </div>
                              <span className="ml-auto flex items-center gap-0.5">
                                <ToolButton label="Move up" onClick={() => moveButton(i, -1)} disabled={i === 0}>
                                  <Icon d="M18 15l-6-6-6 6" className="size-4" />
                                </ToolButton>
                                <ToolButton label="Move down" onClick={() => moveButton(i, 1)} disabled={i === s.buttons.length - 1}>
                                  <Icon d="M6 9l6 6 6-6" className="size-4" />
                                </ToolButton>
                                <ToolButton label="Remove button" onClick={() => removeButton(i)}>
                                  <Icon d="M6 6l12 12M18 6 6 18" className="size-4" />
                                </ToolButton>
                              </span>
                            </div>
                            <div className={`mt-3 grid gap-3 ${b.type === "QUICK_REPLY" ? "" : "sm:grid-cols-2"}`}>
                              <div>
                                <div className="flex items-baseline justify-between gap-2">
                                  <label htmlFor={`tpl-btn-${i}`} className="label">
                                    Button text
                                  </label>
                                  <Counter value={b.text.length} max={LIMITS.buttonText} />
                                </div>
                                <input
                                  id={`tpl-btn-${i}`}
                                  value={b.text}
                                  onChange={(e) => setButton(i, { ...b, text: e.target.value })}
                                  maxLength={LIMITS.buttonText}
                                  placeholder={b.type === "QUICK_REPLY" ? "e.g. I'm interested" : b.type === "URL" ? "e.g. View listing" : "e.g. Call us"}
                                  className="input"
                                />
                              </div>
                              {b.type === "URL" && (
                                <div>
                                  <label htmlFor={`tpl-btn-url-${i}`} className="label">
                                    Link
                                  </label>
                                  <input
                                    id={`tpl-btn-url-${i}`}
                                    type="url"
                                    inputMode="url"
                                    value={b.url}
                                    onChange={(e) => setButton(i, { ...b, url: e.target.value })}
                                    maxLength={LIMITS.url}
                                    placeholder="https://brixora.in/properties"
                                    className="input"
                                  />
                                </div>
                              )}
                              {b.type === "PHONE_NUMBER" && (
                                <div>
                                  <label htmlFor={`tpl-btn-phone-${i}`} className="label">
                                    Phone number
                                  </label>
                                  <input
                                    id={`tpl-btn-phone-${i}`}
                                    type="tel"
                                    inputMode="tel"
                                    value={b.phone}
                                    onChange={(e) => setButton(i, { ...b, phone: e.target.value })}
                                    placeholder="+91 98450 12345"
                                    className="input"
                                  />
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  <AddButtonMenu canAdd={canAdd} onAdd={addButton} disabled={fieldsetDisabled} />
                </Card>
              </>
            )}

            {/* Submit */}
            <section className="rounded-3xl bg-white p-6 shadow-[var(--s-shadow)] sm:p-7">
              {problems.length ? (
                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--s-late)_20%,transparent)] bg-[color-mix(in_srgb,var(--s-late)_5%,#fff)] p-4">
                  <p className="text-sm font-extrabold text-[var(--s-late)]">
                    {problems.length === 1 ? "1 thing to fix before submitting" : `${problems.length} things to fix before submitting`}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {problems.map((p) => (
                      <li key={p} className="flex gap-2 text-sm text-[var(--s-text-2)]">
                        <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--s-late)]" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl bg-[var(--s-brand-soft)] px-4 py-3 text-sm font-bold text-[var(--brand)]">
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="currentColor" aria-hidden>
                    <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                  </svg>
                  Looks good. Ready to submit to Meta.
                </div>
              )}
              {submitError && (
                <p role="alert" className="mt-3 text-sm font-bold text-[var(--s-late)]">
                  {submitError}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {dirty ? (
                  <button type="button" onClick={startOver} className="text-sm font-bold text-[var(--s-muted)] hover:text-[var(--s-text)]">
                    Start over
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" onClick={submit} disabled={fieldsetDisabled || problems.length > 0} className="btn-primary px-5 py-2 text-sm">
                  {submitting ? "Submitting…" : "Submit to Meta for review"}
                </button>
              </div>
            </section>
          </fieldset>
        )}

        {/* Live preview */}
        <aside aria-label="Message preview" className="space-y-3 lg:sticky lg:top-6">
          <Preview s={s} media={media} businessName={businessName} />
          <p className="px-2 text-center text-xs text-[var(--s-muted)]">
            Live preview · sample values are <mark className="rounded bg-[#d9fdd3] px-1 text-inherit">highlighted</mark>
            {auth ? " · the code is filled in per message" : ""}
          </p>
        </aside>
      </div>
      {confirmDialog}
    </div>
  );
}
