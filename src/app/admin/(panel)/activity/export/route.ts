import { checkAdmin } from "@/lib/auth";
import { feedRange, parseFeedFilters } from "@/lib/activity-feed";
import { describe, feedRows } from "../feed";

// CSV of the activity feed, with the same filters as the page (passed in the query string).

const MAX_ROWS = 10_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ROLE: Record<string, string> = { staff: "Staff", owner: "Owner", client: "Client", system: "System" };

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const check = await checkAdmin();
  if (check.status !== "ok") return new Response("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const filters = parseFeedFilters(sp, (id) => /^[0-9a-f-]{36}$/i.test(id));
  const rows = await feedRows(
    { kind: filters.kind, person: filters.person || undefined, action: filters.action || undefined, q: filters.q || undefined, ...feedRange(filters) },
    MAX_ROWS,
  );

  const header = ["Date (IST)", "Time (IST)", "Who", "Role", "Action", "Client / listing", "Listing title", "Details"];
  const lines = rows.map((r) => {
    const e = describe(r, 1, true);
    const ist = new Date(new Date(r.created_at).getTime() + IST_OFFSET_MS).toISOString();
    return [ist.slice(0, 10), ist.slice(11, 16), e.actor, ROLE[e.actorKind], e.verb, e.target, e.sub, e.excerpt].map(csvCell).join(",");
  });
  const csv = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
