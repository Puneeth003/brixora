import "server-only";

export const PASSWORD_MIN = 12;

/** Staff password rules. Returns an error message, or null when acceptable. */
export function passwordProblem(password: string, ctx: { email?: string | null; name?: string | null } = {}) {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  const lower = password.toLowerCase();
  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Password can't contain your email address.";
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|password|qwerty)/i.test(password)) {
    return "That password is too easy to guess.";
  }
  return null;
}
