// Creates the admin account, or resets its password / two-factor setup.
//
//   node scripts/create-admin.mjs you@yourdomain.in            create, or reset the password
//   node scripts/create-admin.mjs you@yourdomain.in --reset-2fa  also re-enrol the authenticator
//
// Reads DATABASE_URL from the environment or .env.local. The password is typed at a
// hidden prompt so it never lands in shell history. There is no admin sign-up page.
import { randomBytes, randomUUID, scrypt } from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";
import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (env or .env.local).");
  process.exit(1);
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
const reset2fa = process.argv.includes("--reset-2fa");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: node scripts/create-admin.mjs <email> [--reset-2fa]");
  process.exit(1);
}

// One reader for every prompt, so piped input (one line per answer) works too.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) rl.output.write(s);
};
const lines = rl[Symbol.asyncIterator]();
async function ask(question) {
  process.stdout.write(question);
  muted = true; // hide the typed password
  const { value } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return value ?? "";
}

// Must match hashPassword() in src/lib/crypto.ts.
const N = 32768, r = 8, p = 1;
function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 128 * N * r * 2 }, (err, hash) =>
      err ? reject(err) : resolve(`scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`),
    ),
  );
}

const password = await ask("New admin password (min 12 characters): ");
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}
if ((await ask("Repeat password: ")) !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}

rl.close();

const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: "Z" });
try {
  const hash = await hashPassword(password);
  const [rows] = await db.query("SELECT id, role FROM users WHERE email = ?", [email]);
  if (rows.length) {
    if (rows[0].role !== "admin") throw new Error(`${email} exists but is not an admin account`);
    await db.query(
      `UPDATE users SET password_hash = ?${reset2fa ? ", totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL" : ""} WHERE id = ?`,
      [hash, rows[0].id],
    );
    // Sign out every existing admin session.
    await db.query("DELETE FROM sessions WHERE user_id = ?", [rows[0].id]);
    console.log(`Updated ${email}${reset2fa ? " (two-factor reset; set it up again at the next sign-in)" : ""}.`);
  } else {
    await db.query("INSERT INTO users (id, role, email, password_hash) VALUES (?, 'admin', ?, ?)", [randomUUID(), email, hash]);
    console.log(`Created admin ${email}. Sign in at /admin/login to set up two-factor authentication.`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end();
}
