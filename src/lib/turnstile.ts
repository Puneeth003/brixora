import "server-only";

// Cloudflare's documented always-pass test secret, used only outside production.
const TEST_SECRET = "1x0000000000000000000000000000000AA";

export async function verifyTurnstile(token: string | null | undefined, ip?: string | null) {
  const secret =
    process.env.TURNSTILE_SECRET_KEY || (process.env.NODE_ENV !== "production" ? TEST_SECRET : undefined);
  if (!secret) return false;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      cache: "no-store",
    });
    const json = (await res.json()) as { success: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
