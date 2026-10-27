import { CLIENT_STATUSES, CLIENT_TYPES, label } from "@/lib/crm-constants";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { Client, ClientStatus } from "@/lib/types";

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const s = CLIENT_STATUSES.find((x) => x.value === status);
  return (
    <span className={`badge gap-1.5 whitespace-nowrap ${s?.color ?? "bg-zinc-100 text-zinc-700"}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {s?.label ?? status}
    </span>
  );
}

/** "Buyer · 3+ BHK · ₹50 L – ₹80 L · Kadri, Bejai" */
export function requirementSummary(c: Pick<Client, "type" | "listing_type" | "bedrooms" | "budget_min" | "budget_max" | "localities">) {
  const parts: string[] = [label(CLIENT_TYPES, c.type)];
  if (c.bedrooms) parts.push(`${c.bedrooms}+ BHK`);
  if (c.budget_min || c.budget_max) {
    const lt = c.listing_type ?? undefined;
    const lo = c.budget_min ? formatPrice(c.budget_min, lt) : null;
    const hi = c.budget_max ? formatPrice(c.budget_max, lt) : null;
    parts.push(lo && hi ? `${lo} – ${hi}` : hi ? `up to ${hi}` : `from ${lo}`);
  }
  if (c.localities) parts.push(c.localities);
  return parts.join(" · ");
}

/** Follow-up time, red when overdue. `now` comes from the server render. */
export function FollowUp({ at, now }: { at: string | null; now: number }) {
  if (!at) return <span className="text-[var(--s-muted)]">—</span>;
  const overdue = new Date(at).getTime() < now;
  return <span className={overdue ? "font-bold text-[var(--s-late)]" : "text-[var(--s-text-2)]"}>{formatDateTime(at)}</span>;
}
