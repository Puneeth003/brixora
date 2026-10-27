import { readStoredFile } from "@/lib/storage";

// Public, watermarked listing photos. Names are random UUIDs and never reused, so they
// can be cached forever.
export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key } = await ctx.params;
  const name = key.join("/");
  if (!/^[0-9a-f-]{36}\.webp$/.test(name)) return new Response("Not found", { status: 404 });

  const data = await readStoredFile("public", name);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
