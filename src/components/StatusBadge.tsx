import { STATUS_LABELS } from "@/lib/constants";
import type { MessageStatus, PropertyStatus, RequestStatus } from "@/lib/types";

const PROPERTY_COLORS: Record<PropertyStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-sky-100 text-sky-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  sold_pending: "bg-violet-100 text-violet-800",
  sold: "bg-zinc-800 text-white",
  archived: "bg-zinc-200 text-zinc-700",
  expired: "bg-orange-100 text-orange-800",
};

/** Small status pill with a coloured dot before the label. */
function Dot() {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />;
}

export function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  return (
    <span className={`badge gap-1.5 whitespace-nowrap ${PROPERTY_COLORS[status]}`}>
      <Dot />
      {STATUS_LABELS[status]}
    </span>
  );
}

const REQUEST_COLORS: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`badge gap-1.5 whitespace-nowrap capitalize ${REQUEST_COLORS[status]}`}>
      <Dot />
      {status}
    </span>
  );
}

const MESSAGE_COLORS: Record<MessageStatus, string> = {
  queued: "bg-zinc-100 text-zinc-700",
  sent: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  read: "bg-emerald-200 text-emerald-900",
  failed: "bg-red-100 text-red-700",
};

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  return (
    <span className={`badge gap-1.5 whitespace-nowrap capitalize ${MESSAGE_COLORS[status]}`}>
      <Dot />
      {status}
    </span>
  );
}
