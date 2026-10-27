import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

// Password hashing, TOTP (RFC 6238), secret encryption and token helpers, all on
// node:crypto. AUTH_SECRET (32+ random chars) keys the HMACs and encryption.

function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (at least 32 characters)");
  return s;
}

function key(purpose: string) {
  return Buffer.from(hkdfSync("sha256", authSecret(), "brixora", purpose, 32));
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const randomToken = () => randomBytes(32).toString("base64url");

export function hmac(purpose: string, data: string) {
  return createHmac("sha256", key(purpose)).update(data).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomDigits(n: number) {
  return Array.from({ length: n }, () => randomInt(10)).join("");
}

// ---------------------------------------------------------------------------
// Passwords: scrypt$N$r$p$salt$hash
// ---------------------------------------------------------------------------

const SCRYPT = { N: 32768, r: 8, p: 1 };

function scryptAsync(password: string, salt: Buffer, len: number, opts: typeof SCRYPT) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, len, { ...opts, maxmem: 128 * opts.N * opts.r * 2 }, (err, out) =>
      err ? reject(err) : resolve(out),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  // Always do the work, so a missing account takes as long as a wrong password.
  const parts = (stored ?? "").split("$");
  const ok = parts.length === 6 && parts[0] === "scrypt";
  const opts = ok ? { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) } : SCRYPT;
  const salt = ok ? Buffer.from(parts[4], "base64") : randomBytes(16);
  const expected = ok ? Buffer.from(parts[5], "base64") : randomBytes(64);
  const actual = await scryptAsync(password, salt, expected.length, opts);
  return ok && timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Encryption at rest (TOTP secrets): AES-256-GCM, v1.iv.tag.ciphertext
// ---------------------------------------------------------------------------

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("encrypt"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1") throw new Error("unknown ciphertext version");
  const decipher = createDecipheriv("aes-256-gcm", key("encrypt"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238): SHA-1, 6 digits, 30 s steps, ±1 step tolerance
// ---------------------------------------------------------------------------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string) {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

function hotp(secret: Buffer, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

/** Returns the matched time step, or null. Callers reject steps ≤ the last one used. */
export function verifyTotp(secretB32: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const step = Math.floor(now / 30_000);
  for (const s of [step, step - 1, step + 1]) {
    if (safeEqual(hotp(secret, s), code)) return s;
  }
  return null;
}

export function totpUri(secretB32: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
