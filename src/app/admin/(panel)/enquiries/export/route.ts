import { checkAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  const check = await checkAdmin();
  if (check.status !== "ok") return new Response("Unauthorized", { status: 401 });

  const data = await db.all<{
    created_at: string;
    name: string;
    phone: string;
    message: string | null;
    forwarded: boolean;
    forward_error: string | null;
    reference_no: string | null;
    title: string | null;
    locality: string | null;
  }>(
    `SELECT e.created_at, e.name, e.phone, e.message, e.forwarded, e.forward_error, p.reference_no, p.title, p.locality
       FROM enquiries e LEFT JOIN properties p ON p.id = e.property_id
      ORDER BY e.created_at DESC LIMIT 10000`,
  );

  const header = ["Date", "Reference", "Property", "Locality", "Name", "Phone", "Message", "Forwarded", "Forward error"];
  const lines = data.map((e) => {
    return [e.created_at, e.reference_no, e.title, e.locality, e.name, `+${e.phone}`, e.message, e.forwarded ? "yes" : "no", e.forward_error]
      .map(csvCell)
      .join(",");
  });
  const csv = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="enquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
