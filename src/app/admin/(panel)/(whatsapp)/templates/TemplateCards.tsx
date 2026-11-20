"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTemplate } from "@/app/admin/template-actions";
import { useConfirm } from "@/components/ConfirmDialog";
import type { ActionState } from "@/lib/types";
import type { MetaTemplate } from "@/lib/whatsapp";

// Admin → WhatsApp templates: one card per template (name + language) in Meta, shown the
// way WhatsApp renders it, with what Meta said about it and what to do next.

function Spinner() {
  return <span aria-hidden className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

/** Re-fetches the list from Meta. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
    >
      {pending && <Spinner />}
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: "Approved", tone: "bg-emerald-100 text-emerald-800" },
  PENDING: { label: "In review", tone: "bg-amber-100 text-amber-800" },
  IN_APPEAL: { label: "In appeal", tone: "bg-amber-100 text-amber-800" },
  REJECTED: { label: "Rejected", tone: "bg-red-100 text-red-700" },
  PAUSED: { label: "Paused", tone: "bg-zinc-100 text-zinc-700" },
  DISABLED: { label: "Disabled", tone: "bg-zinc-100 text-zinc-700" },
  LIMIT_EXCEEDED: { label: "Limit exceeded", tone: "bg-zinc-100 text-zinc-700" },
  ARCHIVED: { label: "Archived", tone: "bg-zinc-100 text-zinc-700" },
};

const humanise = (code: string) => {
  const s = code.toLowerCase().replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: humanise(status), tone: "bg-zinc-100 text-zinc-700" };
  return (
    <span className={`badge gap-1.5 whitespace-nowrap ${s.tone}`}>
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full bg-current ${status === "PENDING" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

const QUALITY: Record<string, { color: string; label: string }> = {
  GREEN: { color: "#16a34a", label: "High quality" },
  YELLOW: { color: "#eab308", label: "Medium quality" },
  RED: { color: "#dc2626", label: "Low quality" },
};

function QualityDot({ quality }: { quality: string | null }) {
  const q = quality ? QUALITY[quality] : undefined;
  if (!q) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--s-muted)]" title={`Meta quality rating: ${q.label.toLowerCase()}`}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: q.color }} />
      {q.label}
    </span>
  );
}

const REJECTED_REASONS: Record<string, string> = {
  INVALID_FORMAT: "The template isn't formatted the way Meta expects, for example variables at the very start or end, or next to each other.",
  TAG_CONTENT_MISMATCH: "The category doesn't match the content. Pick the category that fits what the message says.",
  SCAM: "Meta flagged the content as possibly misleading or a scam.",
  PROMOTIONAL: "It has promotional content in a utility template. Remove the offer wording or create it as Marketing.",
  ABUSIVE_CONTENT: "Meta found content that breaks its policies (abusive or threatening wording).",
  INCORRECT_CATEGORY: "The category is wrong for this content. Create it again with the correct category.",
};

const chip = "rounded-md bg-[var(--s-seg)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--s-text-2)]";

/** Body text with each {{n}} shown as a small chip. */
function WithVars({ text }: { text: string }) {
  const parts = text.split(/(\{\{\d+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{\d+\}\}$/.test(p) ? (
          <span key={i} className="mx-px rounded bg-[#d9fdd3] px-1 font-mono text-[12px] font-semibold text-[#0b6b3a]">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

const MEDIA_ICON: Record<string, { label: string; d: string }> = {
  IMAGE: { label: "Image", d: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01" },
  VIDEO: { label: "Video", d: "M3 6h12v12H3zM15 10l6-3v10l-6-3" },
  DOCUMENT: { label: "Document", d: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
  LOCATION: { label: "Location", d: "M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
};

/** The template as WhatsApp shows it, variables left as chips. */
function Preview({ t }: { t: MetaTemplate }) {
  const media = t.headerFormat && t.headerFormat !== "TEXT" ? (MEDIA_ICON[t.headerFormat] ?? { label: humanise(t.headerFormat), d: MEDIA_ICON.DOCUMENT.d }) : null;
  return (
    <div className="rounded-2xl bg-[#e7ddd3] p-3">
      <div className="rounded-xl rounded-tl-none bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm">
        {media && (
          <div className="mb-2 flex h-24 flex-col items-center justify-center gap-1 rounded-lg bg-zinc-100 text-zinc-500">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={media.d} />
            </svg>
            <span className="text-[11px] font-semibold">{media.label} header</span>
          </div>
        )}
        {t.header && (
          <p className="mb-1 font-bold">
            <WithVars text={t.header} />
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">
          <WithVars text={t.body} />
        </p>
        {t.footer && <p className="mt-1 text-xs text-zinc-500">{t.footer}</p>}
      </div>
      {t.buttons.map((b, i) => (
        <div key={`${b}-${i}`} className="mt-1 rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-[#027eb5] shadow-sm">
          {b}
        </div>
      ))}
    </div>
  );
}

function Card({ t, purposes, onDelete, deleting }: { t: MetaTemplate; purposes: string[]; onDelete: () => void; deleting: boolean }) {
  const canBroadcast = t.status === "APPROVED" && t.category !== "AUTHENTICATION";
  return (
    <article className="flex flex-col rounded-3xl bg-white p-5 shadow-[var(--s-shadow)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-sm font-bold text-[var(--s-text)]" title={t.name}>
            {t.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`${chip} font-mono`}>{t.language}</span>
            <span className={chip}>{humanise(t.category)}</span>
            <QualityDot quality={t.quality} />
          </div>
        </div>
        <StatusBadge status={t.status} />
      </div>

      <Preview t={t} />

      {t.status === "REJECTED" && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p className="font-bold">Why Meta rejected it</p>
          <p className="mt-0.5">
            {t.rejectedReason ? (REJECTED_REASONS[t.rejectedReason] ?? `${humanise(t.rejectedReason)}.`) : "Meta didn't give a reason. Check WhatsApp Manager for details."}
          </p>
        </div>
      )}

      {purposes.length > 0 && (
        <p className="mt-3 text-xs text-[var(--s-muted)]">
          Used for: <span className="font-bold text-[var(--s-text)]">{purposes.join(", ")}</span>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {canBroadcast && (
          <Link href="/admin/broadcasts/new" className="btn-primary px-3 py-1.5 text-xs">
            Use in broadcast
          </Link>
        )}
        <Link
          href={`/admin/templates/new?${new URLSearchParams({ from: t.name, lang: t.language })}`}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          Copy as new
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--s-late)] hover:bg-red-50 disabled:opacity-50"
        >
          {deleting && <Spinner />}
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
}

export function TemplateCards({ templates, usedFor }: { templates: MetaTemplate[]; usedFor: Record<string, string[]> }) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [state, setState] = useState<ActionState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove(t: MetaTemplate) {
    const purposes = usedFor[`${t.name}|${t.language}`] ?? [];
    const ok = await confirm({
      title: `Delete ${t.name} (${t.language})?`,
      message: (
        <div className="space-y-2">
          <p>This deletes the template in Meta. If it&apos;s the only language of {t.name}, the whole template name goes with it.</p>
          <p>Meta blocks the name {t.name} for 30 days, so a replacement needs a different name.</p>
          {purposes.length > 0 && (
            <p className="font-semibold text-red-700">
              The website uses it for {purposes.join(", ")}. Those messages will stop sending until another template is added in Settings.
            </p>
          )}
        </div>
      ),
      confirmLabel: "Delete template",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(t.id);
    setState(null);
    const res = await deleteTemplate(t.name, t.id);
    setState(res);
    setDeletingId(null);
    startTransition(() => router.refresh());
  }

  return (
    <>
      {state && (
        <p
          role="status"
          className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-semibold ${state.ok ? "bg-[var(--s-brand-soft)] text-[var(--brand)]" : "bg-red-50 text-[var(--s-late)]"}`}
        >
          {state.ok ? state.message : state.error}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <Card
            key={t.id}
            t={t}
            purposes={usedFor[`${t.name}|${t.language}`] ?? []}
            onDelete={() => remove(t)}
            deleting={deletingId === t.id}
          />
        ))}
      </div>
      {dialog}
    </>
  );
}
