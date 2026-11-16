import { checkStaff } from "@/lib/auth";
import { canSeePropertyFiles } from "@/lib/staff-access";
import { isValidKey, readStoredFile } from "@/lib/storage";

const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg" };

// Owners' ownership documents. Keys start with the property id.
export async function GET(_req: Request, ctx: RouteContext<"/admin/documents/[...key]">) {
  const check = await checkStaff();
  if (check.status !== "ok") return new Response("Unauthorized", { status: 401 });

  const { key } = await ctx.params;
  const name = key.join("/");
  const type = TYPES[name.split(".").pop() ?? ""];
  if (!isValidKey(name) || !name.includes("/") || !type) return new Response("Not found", { status: 404 });
  if (!(await canSeePropertyFiles(check, name.split("/")[0]))) return new Response("Not found", { status: 404 });

  const data = await readStoredFile("documents", name);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      // A PDF can carry scripts; the browser viewer runs it sandboxed.
      "Content-Security-Policy": "sandbox",
    },
  });
}
