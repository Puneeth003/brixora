import { formatDateTime } from "@/lib/format";
import type { ActivityLog } from "@/lib/types";

function summarize(diff: Record<string, unknown> | null) {
  if (!diff) return null;
  return Object.entries(diff)
    .map(([k, v]) => {
      if (v && typeof v === "object" && "from" in v && "to" in v) {
        const { from, to } = v as { from: unknown; to: unknown };
        const short = (x: unknown) => {
          const s = typeof x === "string" ? x : JSON.stringify(x);
          return s && s.length > 40 ? `${s.slice(0, 40)}…` : s;
        };
        return `${k}: ${short(from)} → ${short(to)}`;
      }
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}: ${s.length > 60 ? `${s.slice(0, 60)}…` : s}`;
    })
    .join(" · ");
}

export function ActivityList({ entries, names }: { entries: ActivityLog[]; names: Record<string, string> }) {
  if (!entries.length) return <p className="text-sm text-[var(--s-muted)]">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 text-sm before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-[var(--s-border)]">
      {entries.map((e, i) => (
        <li key={e.id} className="relative pl-6">
          <span
            className={`absolute top-1.5 left-0 size-[11px] rounded-full ring-4 ring-white ${i === 0 ? "bg-[var(--brand)]" : "bg-[var(--s-border-strong)]"}`}
            aria-hidden
          />
          <p className="font-semibold capitalize">{e.action.replace(/[_:]/g, " ")}</p>
          <p className="text-xs text-[var(--s-muted)]">
            by {e.actor_type}
            {e.actor_id && names[e.actor_id] ? ` (${names[e.actor_id]})` : ""} · {formatDateTime(e.created_at)}
          </p>
          {e.diff && (
            <p className="mt-1.5 rounded-xl bg-[var(--s-bg)] px-3 py-2 text-xs break-words text-[var(--s-text-2)]">{summarize(e.diff)}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
