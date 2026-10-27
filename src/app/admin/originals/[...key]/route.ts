import { checkStaff } from "@/lib/auth";
import { isValidKey, readStoredFile } from "@/lib/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

// Private original uploads and site-visit photos, for signed-in staff only.
export async function GET(_req: Request, ctx: RouteContext<"/admin/originals/[...key]">) {
  const check = await checkStaff();
  if (check.status !== "ok") return new Response("Unauthorized", { status: 401 });

  const { key } = await ctx.params;
  const name = key.join("/");
  const type = TYPES[name.split(".").pop() ?? ""];
  if (!isValidKey(name) || !name.includes("/") || !type) return new Response("Not found", { status: 404 });

  const data = await readStoredFile("originals", name);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
