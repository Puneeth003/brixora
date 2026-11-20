import { checkAdmin } from "@/lib/auth";
import { getBroadcast, type RecipientRow } from "@/lib/broadcast";
import { db } from "@/lib/db";

// A broadcast's recipient report as CSV (Excel-friendly, IST times), optionally filtered
// with ?status= like the report page's tabs.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const FILTERS: Record<string, string> = {
  failed: "AND status = 'failed'",
  pending: "AND status IN ('pending', 'sending')",
  sent: "AND status = 'sent'",
  delivered: "AND status = 'delivered'",
  read: "AND status = 'read'",
  replied: "AND replied_at IS NOT NULL",
};

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const ist = (v: string | null) => (v ? new Date(new Date(v).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") : "");

function params(v: unknown): { body?: string[]; header?: string[] } {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return {};
    }
  }
  return (v ?? {}) as { body?: string[]; header?: string[] };
}

export async function GET(request: Request, ctx: RouteContext<"/admin/broadcasts/[id]/export">) {
  const check = await checkAdmin();
  if (check.status === "signed_out" || check.status === "needs_mfa") return new Response("Unauthorized", { status: 401 });
  if (check.status !== "ok") return new Response("Forbidden", { status: 403 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const b = await getBroadcast(id);
  if (!b) return new Response("Not found", { status: 404 });

  const status = new URL(request.url).searchParams.get("status") ?? "";
  const rows = await db.all<RecipientRow>(
    `SELECT id, phone, name, params, status, error, sent_at, replied_at, updated_at FROM broadcast_recipients
      WHERE broadcast_id = ? ${FILTERS[status] ?? ""} ORDER BY id`,
    [id],
  );

  const header = ["Phone (with country code)","Name", "Variables", "Status", "Error", "Sent (IST)", "Replied (IST)", "Last update (IST)"];
  const lines = rows.map((r) => {
    const p = params(r.params);
    return [r.phone, r.name, [...(p.header ?? []), ...(p.body ?? [])].join(" | "), r.status, r.error, ist(r.sent_at), ist(r.replied_at), ist(r.updated_at)]
      .map(csvCell)
      .join(",");
  });
  const body = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");

  const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "broadcast";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}${FILTERS[status] ? `-${status}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
