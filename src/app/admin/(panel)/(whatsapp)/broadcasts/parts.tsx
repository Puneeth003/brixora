import type { BroadcastCounts, BroadcastStatus } from "@/lib/broadcast";

// Small pieces shared by the broadcast list and report pages.

const STATUS_STYLE: Record<BroadcastStatus, string> = {
  scheduled: "bg-zinc-100 text-zinc-700",
  sending: "bg-[var(--s-brand-soft)] text-[var(--brand)]",
  paused: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
};

export function BroadcastStatusBadge({ status }: { status: BroadcastStatus }) {
  return (
    <span className={`badge gap-1.5 whitespace-nowrap capitalize ${STATUS_STYLE[status] ?? STATUS_STYLE.scheduled}`}>
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full bg-current ${status === "sending" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

/** Messages Meta accepted (sent, then delivered, then read). */
export const accepted = (c: BroadcastCounts) => c.sent + c.delivered + c.read;

/** "42%" of a part over a whole, or "—" when there is nothing to divide by. */
export function pct(part: number, whole: number) {
  if (!whole) return "—";
  const v = (part / whole) * 100;
  return `${v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)}%`;
}

const SEGMENTS: { key: "read" | "delivered" | "sent" | "failed"; label: string; color: string }[] = [
  { key: "read", label: "Read", color: "var(--brand)" },
  { key: "delivered", label: "Delivered", color: "color-mix(in srgb, var(--brand) 55%, #fff)" },
  { key: "sent", label: "Sent", color: "#7cc4e8" },
  { key: "failed", label: "Failed", color: "var(--s-late)" },
];

/** Stacked bar: read / delivered / sent / failed, out of every recipient. */
export function ProgressBar({ counts, size = "sm" }: { counts: BroadcastCounts; size?: "sm" | "lg" }) {
  const total = counts.total || 1;
  const title = SEGMENTS.map((s) => `${s.label} ${counts[s.key]}`).join(" · ");
  return (
    <div>
      <div
        className={`flex w-full overflow-hidden rounded-full bg-[var(--s-seg)] ${size === "lg" ? "h-3" : "h-1.5 min-w-24"}`}
        title={title}
        role="img"
        aria-label={title}
      >
        {SEGMENTS.map((s) =>
          counts[s.key] ? <span key={s.key} style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }} /> : null,
        )}
      </div>
      {size === "lg" && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--s-muted)]">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label} <span className="text-[var(--s-text)] tabular-nums">{counts[s.key]}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-[var(--s-seg)] ring-1 ring-[var(--s-border-strong)]" />
            Waiting <span className="text-[var(--s-text)] tabular-nums">{counts.pending + counts.sending}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** JSON columns are parsed by the driver on MySQL, but arrive as text on MariaDB. */
export function parsed<T>(v: unknown): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return {} as T;
    }
  }
  return (v ?? {}) as T;
}
