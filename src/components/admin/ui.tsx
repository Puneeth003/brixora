import Link from "next/link";

export function PageHeader({
  title,
  description,
  actions,
  count,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optional total shown as a small pill next to the title. */
  count?: number;
  /** Optional small line above the title (e.g. today's date). */
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] font-bold text-[var(--s-muted)]">{eyebrow}</p>}
        <h1 className="flex items-center gap-2.5 text-[28px] leading-tight font-extrabold tracking-tight text-[var(--s-text)]">
          {title}
          {count !== undefined && (
            <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold tracking-normal text-[var(--s-text-2)] tabular-nums">
              {count}
            </span>
          )}
        </h1>
        {description && <p className="mt-1 text-sm text-[var(--s-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ children, count, className = "" }: { children: React.ReactNode; count?: number; className?: string }) {
  return (
    <h2 className={`mb-4 flex items-center gap-2 text-xl font-extrabold tracking-tight text-[var(--s-text)] ${className}`}>
      {children}
      {count !== undefined && (
        <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold tracking-normal text-[var(--s-text-2)] tabular-nums">{count}</span>
      )}
    </h2>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-5 max-w-full overflow-x-auto">
      <div className="inline-flex gap-0.5 rounded-2xl bg-[var(--s-seg)] p-1">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${
                on ? "bg-white text-[var(--s-text)] shadow-[0_1px_3px_rgba(10,16,12,0.1)]" : "text-[var(--s-muted)] hover:text-[var(--s-text)]"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`rounded-md px-1.5 py-px text-[11px] font-bold tabular-nums ${
                    on ? "bg-[var(--s-brand-soft)] text-[var(--brand)]" : "bg-white/70 text-[var(--s-muted)]"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--s-border-strong)] bg-white p-10 text-center text-sm font-semibold text-[var(--s-muted)]">
      {children}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-3xl bg-white shadow-[var(--s-shadow)]">
      <table className="w-full text-left text-sm [&_td]:px-5 [&_td]:py-3.5 [&_th]:bg-white [&_th]:px-5 [&_th]:py-3.5 [&_th]:text-[13px] [&_th]:font-bold [&_th]:whitespace-nowrap [&_th]:text-[var(--s-muted)] [&_thead]:border-b [&_thead]:border-[var(--s-border)] [&_tbody_tr]:border-b [&_tbody_tr]:border-[var(--s-border)] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[var(--s-hover)] [&_tbody_tr:last-child]:border-0">
        {children}
      </table>
    </div>
  );
}

// Small icon per stat tile, picked from the label so pages don't have to pass one.
const STAT_ICONS: [RegExp, string][] = [
  [/overdue|failed/i, "M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"],
  [/follow-up|today|week/i, "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
  [/message|enquir|inbox/i, "M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12z"],
  [/submission|request/i, "M12 3v12m-5-5 5 5 5-5M5 21h14"],
  [/won|conversion/i, "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"],
  [/listing|expir/i, "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6"],
  [/lead|new/i, "M12 3l2.2 5.6L20 9.3l-4.5 3.8 1.4 5.9L12 15.9 7.1 19l1.4-5.9L4 9.3l5.8-.7z"],
  [/client|member|agent|team|active|unassigned|people/i, "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6"],
];

function statIcon(label: string) {
  const d = STAT_ICONS.find(([re]) => re.test(label))?.[1] ?? "M4 20V10M10 20V4M16 20v-7M22 20H2";
  return (
    <span className="s-stat-ico" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

/** A stat tile with a small tinted icon; wrap several in `<div className="s-stats">`. */
export function StatCard({ label, value, href, tone = "default" }: { label: string; value: number | string; href?: string; tone?: "default" | "warn" | "bad" }) {
  const dataTone = tone === "default" ? undefined : tone;
  const body = (
    <>
      {statIcon(label)}
      <div className="s-stat-lbl">{label}</div>
      <div className="s-stat-val">{value}</div>
    </>
  );
  return href ? (
    <Link href={href} className="s-stat" data-tone={dataTone}>
      {body}
    </Link>
  ) : (
    <div className="s-stat" data-tone={dataTone}>
      {body}
    </div>
  );
}
