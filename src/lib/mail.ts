import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { envs } from "./env";
import { site } from "./site";

// Outgoing email over SMTP (Hostinger: smtp.hostinger.com, port 465, SMTP_SECURE=ssl).
// Without SMTP_HOST, development prints messages to the server console instead;
// production refuses to send.
//
// SMTP_SECURE: "ssl" = TLS from the start (465), "tls" = STARTTLS required (587),
// "none" = plain, only for a local relay. Mail carries password-reset codes, so an
// unset or unknown value never falls back to plain text to a remote host.

const MAIL_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "MAIL_FROM_NAME"] as const;
type MailEnv = Awaited<ReturnType<typeof mailEnv>>;

/** SMTP settings: Settings → Environment variables, else the server's. */
const mailEnv = () => envs(...MAIL_VARS);

function tlsMode(e: MailEnv) {
  const v = (e.SMTP_SECURE ?? "").trim().toLowerCase();
  if (v === "ssl") return "ssl";
  if (v === "tls" || v === "starttls") return "tls";
  const local = /^(localhost|127\.0\.0\.1|::1)$/i.test(e.SMTP_HOST ?? "");
  if (v === "none" && local) return "none";
  return Number(e.SMTP_PORT) === 465 ? "ssl" : "tls";
}

// One transport per distinct SMTP setup, so a change in Settings takes effect without a restart.
const globalForMail = globalThis as unknown as { __brixoraMail?: { key: string; transport: Transporter } };

function transport(e: MailEnv) {
  const key = JSON.stringify([e.SMTP_HOST, e.SMTP_PORT, e.SMTP_SECURE, e.SMTP_USER, e.SMTP_PASS]);
  if (globalForMail.__brixoraMail?.key !== key) {
    const mode = tlsMode(e);
    globalForMail.__brixoraMail = {
      key,
      transport: nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: Number(e.SMTP_PORT) || (mode === "ssl" ? 465 : 587),
        secure: mode === "ssl",
        requireTLS: mode === "tls",
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
        // Bounded waits, so an unreachable mail server can't hold a request open.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return globalForMail.__brixoraMail.transport;
}

export const mailConfigured = async () => Boolean((await mailEnv()).SMTP_HOST);

/** SMTP host and sender address shown on the settings page. */
export async function mailSummary() {
  const e = await mailEnv();
  return { host: e.SMTP_HOST ?? "", from: e.MAIL_FROM || e.SMTP_USER || "" };
}

/** Sends, or (development without SMTP_HOST) prints to the console. Says which. */
export async function sendMail(msg: { to: string; subject: string; text: string; html: string }): Promise<"sent" | "printed"> {
  const e = await mailEnv();
  if (!e.SMTP_HOST) {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not configured (SMTP_HOST)");
    console.log(`[mail:dev] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}\n`);
    return "printed";
  }
  const from = e.MAIL_FROM || e.SMTP_USER;
  await transport(e).sendMail({ from: `"${e.MAIL_FROM_NAME || site.name}" <${from}>`, ...msg });
  return "sent";
}

/** Plain-language reason a send failed, for the admin (never shown to the public). */
export function mailErrorReason(e: unknown) {
  const err = e as { code?: string; responseCode?: number; message?: string };
  if (err.message === "Email is not configured (SMTP_HOST)") return "email isn't set up on the server (SMTP_HOST is empty)";
  if (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534) {
    return "the email server rejected the login: check SMTP_USER and SMTP_PASS (for Gmail, a 16-letter app password with no spaces)";
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(err.code ?? "")) {
    return "couldn't reach the email server: check SMTP_HOST, SMTP_PORT and SMTP_SECURE";
  }
  if (err.code === "EENVELOPE") return "the recipient address was refused";
  return err.message ? `the email server said: ${err.message.slice(0, 160)}` : "unknown email error";
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7">
<tr><td style="padding:22px 28px;border-bottom:1px solid #f4f4f5;font-size:18px;font-weight:700;letter-spacing:.04em">${esc(site.name.toUpperCase())}</td></tr>
<tr><td style="padding:24px 28px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">${esc(site.name)} · ${esc(site.tagline)}</p>
</td></tr></table></body></html>`;
}

export function passwordResetEmail({ name, code, minutes }: { name: string | null; code: string; minutes: number }) {
  const hi = name || "there";
  const boxes = code
    .split("")
    .map((d) => `<td style="width:44px;height:52px;border:1.5px solid #d4d4d8;border-radius:10px;font-size:26px;font-weight:800;text-align:center">${esc(d)}</td>`)
    .join('<td style="width:8px"></td>');
  return {
    subject: `Your ${site.name} password reset code`,
    text: `Hi ${hi},\n\nYour ${site.name} password reset code is: ${code}\nIt expires in ${minutes} minutes.\n\nIf you didn't request this, you can ignore this email; your password stays the same.\n\n— ${site.name}`,
    html: layout(
      `<p style="margin:0 0 12px">Hi <strong>${esc(hi)}</strong>,</p>
<p style="margin:0 0 20px">We received a request to reset your ${esc(site.name)} password. Use this code to continue. It expires in <strong>${minutes} minutes</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px"><tr>${boxes}</tr></table>
<p style="margin:0;color:#71717a;font-size:13px">If you didn't request this, you can ignore this email; your password stays the same.</p>`,
    ),
  };
}

export function testEmail({ name }: { name: string | null }) {
  const hi = name || "there";
  return {
    subject: `${site.name} test email`,
    text: `Hi ${hi},\n\nThis is a test email from ${site.name}. If you can read this, outgoing email (password resets, welcome emails) is working.\n\n— ${site.name}`,
    html: layout(
      `<p style="margin:0 0 12px">Hi <strong>${esc(hi)}</strong>,</p>
<p style="margin:0">This is a test email from ${esc(site.name)}. If you can read this, outgoing email (password resets, welcome emails) is working.</p>`,
    ),
  };
}

export function passwordChangedEmail({ name }: { name: string | null }) {
  const hi = name || "there";
  return {
    subject: `Your ${site.name} password was changed`,
    text: `Hi ${hi},\n\nThe password for your ${site.name} account was just changed, and every other session was signed out.\nIf this wasn't you, reset your password straight away and tell your administrator.\n\n— ${site.name}`,
    html: layout(
      `<p style="margin:0 0 12px">Hi <strong>${esc(hi)}</strong>,</p>
<p style="margin:0 0 12px">The password for your ${esc(site.name)} account was just changed, and every other session was signed out.</p>
<p style="margin:0;color:#71717a;font-size:13px">If this wasn't you, reset your password straight away and tell your administrator.</p>`,
    ),
  };
}

export function welcomeEmail({ name, email, link }: { name: string | null; email: string; link: string }) {
  const hi = name || "there";
  return {
    subject: `Your ${site.name} account is ready`,
    text: `Hi ${hi},\n\nAn account has been created for you on ${site.name} (${email}).\nSet your password here: ${link}\n\n— ${site.name}`,
    html: layout(
      `<p style="margin:0 0 12px">Hi <strong>${esc(hi)}</strong>,</p>
<p style="margin:0 0 20px">An account has been created for you on ${esc(site.name)} (<strong>${esc(email)}</strong>). Choose your password to sign in.</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#2f7d5f;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:9px">Set my password</a></p>
<p style="margin:0;color:#71717a;font-size:13px">You'll get a 6-digit code by email to confirm it's you.</p>`,
    ),
  };
}
