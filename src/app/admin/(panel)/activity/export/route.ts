import { checkAdmin } from "@/lib/auth";
import { ACTION_FILTERS, ADMIN_ENTITIES, KINDS, feedRange, parseFeedFilters, type FeedFilters } from "@/lib/activity-feed";
import { configValue, db } from "@/lib/db";
import { site } from "@/lib/site";
import { excelDateTime, reportWorkbook, type ReportColumn } from "@/lib/xlsx";
import { describe, feedRows, istDateTime, type FeedRow } from "../feed";

// The activity feed as a download, with the same filters as the page (passed in the
// query string): a formatted Excel report by default, plain CSV with ?format=csv.

const MAX_ROWS = 10_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ROLE: Record<string, string> = { staff: "Staff", owner: "Owner", client: "Client", system: "System" };

const COLUMNS: ReportColumn[] = [
  { header: "Date", width: 13, type: "date" },
  { header: "Time", width: 11, type: "time" },
  { header: "Area", width: 20 },
  { header: "Person", width: 22 },
  { header: "Role", width: 10 },
  { header: "Activity", width: 44, type: "wrap" },
  { header: "Client / listing", width: 24 },
  { header: "Listing title", width: 34, type: "wrap" },
  { header: "Details", width: 60, type: "wrap" },
];

type ExportRow = { at: string; area: string; person: string; role: string; activity: string; subject: string; title: string; details: string };

function area(r: FeedRow) {
  if (r.src === "crm") return "Clients";
  return (ADMIN_ENTITIES as readonly string[]).includes(r.target_type) ? "Accounts & settings" : "Listings";
}

function toExportRow(r: FeedRow): ExportRow {
  const e = describe(r, 1, true);
  // "logged a call with" + "Prakash Rao" → "Logged a call with Prakash Rao"
  const sentence = `${e.verb} ${e.target}`.trim();
  return {
    at: r.created_at,
    area: area(r),
    person: e.actor,
    role: ROLE[e.actorKind],
    activity: sentence.charAt(0).toUpperCase() + sentence.slice(1),
    // An enquiry has no target: the client is the one acting.
    subject: e.target || (e.actorKind === "client" ? e.actor : ""),
    title: e.sub ?? "",
    details: e.excerpt,
  };
}

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function csv(rows: ExportRow[]) {
  const lines = rows.map((x) => {
    const ist = new Date(new Date(x.at).getTime() + IST_OFFSET_MS).toISOString();
    return [ist.slice(0, 10), ist.slice(11, 16), x.area, x.person, x.role, x.activity, x.subject, x.title, x.details].map(csvCell).join(",");
  });
  const header = ["Date (IST)", "Time (IST)", ...COLUMNS.slice(2).map((c) => c.header)];
  return "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
}

const ymdLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** "30 entries · Person: Priya Shenoy · 25 Oct 2026 to 26 Oct 2026 · Generated 12 Nov, 4:10 pm IST" */
async function subtitle(filters: FeedFilters, count: number) {
  const parts = [`${count} ${count === 1 ? "entry" : "entries"}${count === MAX_ROWS ? " (newest only)" : ""}`];
  if (filters.person) {
    const u = await db.one<{ name: string | null; email: string | null }>("SELECT name, email FROM users WHERE id = ?", [filters.person]);
    parts.push(`Person: ${u?.name ?? u?.email ?? "unknown"}`);
  }
  if (filters.kind !== "all") parts.push(`Area: ${KINDS.find((k) => k.value === filters.kind)?.label}`);
  if (filters.action) parts.push(`Action: ${ACTION_FILTERS.find((a) => a.value === filters.action)?.label}`);
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  if (filters.from && filters.to) parts.push(`${ymdLabel(filters.from)} to ${ymdLabel(filters.to)}`);
  else if (filters.from) parts.push(`From ${ymdLabel(filters.from)}`);
  else if (filters.to) parts.push(`Up to ${ymdLabel(filters.to)}`);
  parts.push(`Generated ${istDateTime(new Date().toISOString())} IST`);
  return parts.join("  ·  ");
}

export async function GET(request: Request) {
  const check = await checkAdmin();
  if (check.status !== "ok") return new Response("Unauthorized", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const filters = parseFeedFilters(Object.fromEntries(sp), (id) => /^[0-9a-f-]{36}$/i.test(id));
  const feed = await feedRows(
    { kind: filters.kind, person: filters.person || undefined, action: filters.action || undefined, q: filters.q || undefined, ...feedRange(filters) },
    MAX_ROWS,
  );
  const rows = feed.map(toExportRow);
  const stamp = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

  if (sp.get("format") === "csv") {
    return new Response(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="activity-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const workbook = reportWorkbook({
    sheetName: "Activity",
    title: `${site.name} · Activity report`,
    subtitle: await subtitle(filters, rows.length),
    brandHex: await configValue("brand_color"),
    columns: COLUMNS,
    rows: rows.map((x) => {
      const when = excelDateTime(x.at, IST_OFFSET_MS);
      return [when.date, when.time, x.area, x.person, x.role, x.activity, x.subject, x.title, x.details];
    }),
  });
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="activity-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
