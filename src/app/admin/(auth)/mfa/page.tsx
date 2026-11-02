import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import QRCode from "qrcode";
import { checkStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { authSecretConfigured, encrypt, newTotpSecret, totpUri, tryDecrypt } from "@/lib/crypto";
import { site } from "@/lib/site";
import { adminSignOut } from "../../actions";
import { MfaForm } from "./MfaForm";

export default function MfaPage() {
  return (
    <Suspense fallback={<div className="card h-80 animate-pulse" aria-busy="true" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const check = await checkStaff();
  if (check.status === "signed_out") redirect("/admin/login");
  if (check.status === "ok") redirect("/admin");
  if (check.status === "not_admin") {
    return (
      <div className="card space-y-5 p-8">
        <div className="space-y-1.5">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">No admin access</h1>
          <p className="text-sm text-[var(--s-muted)]">This account doesn&apos;t have admin access.</p>
        </div>
        <div className="flex gap-2">
          <form action={adminSignOut} className="flex-1">
            <button className="btn-secondary w-full py-3">Sign out</button>
          </form>
          <Link href="/" className="btn-ghost flex-1 py-3">
            Go to website
          </Link>
        </div>
      </div>
    );
  }
  if (!authSecretConfigured()) {
    return (
      <Problem title="Server setup needed">
        <code>AUTH_SECRET</code> isn&apos;t set on the server, so two-factor sign-in can&apos;t work. Add it in Hostinger → Node.js app →
        Environment variables (48+ random characters) and redeploy, or set <code>ADMIN_2FA=off</code> for password-only sign-in.
      </Problem>
    );
  }

  const user = await db.one<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = ?", [check.userId]);
  const stored = user?.totp_secret ? tryDecrypt(user.totp_secret) : null;

  if (check.enrolled) {
    if (stored) return <MfaForm setup={null} />;
    // Enrolled, but the secret was encrypted with a different AUTH_SECRET (e.g. data copied
    // from another server). It can't be recovered; the admin must reset it.
    return (
      <Problem title="Two-factor needs resetting">
        Your authenticator setup can&apos;t be read on this server (its <code>AUTH_SECRET</code> is different from where it was set up). Reset it
        with <code>npm run admin:create -- {check.email} --reset-2fa</code>, then sign in again to scan a new QR code.
      </Problem>
    );
  }

  // First sign-in: show the secret as a QR code. If the stored one can't be read (or is
  // missing), start a fresh one; nothing is enrolled yet, so nothing is lost.
  let secret = stored;
  if (!secret) {
    secret = newTotpSecret();
    await db.update("users", { totp_secret: encrypt(secret), totp_enabled: false }, "id = ?", [check.userId]);
  }
  const qr = await QRCode.toDataURL(totpUri(secret, check.email, `${site.name} Admin`), { margin: 1, width: 384 });
  return <MfaForm setup={{ qr, secret: secret.match(/.{1,4}/g)!.join(" ") }} />;
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-4 p-8">
      <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">{title}</h1>
      <p className="text-sm leading-relaxed text-[var(--s-text-2)] [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]">{children}</p>
      <form action={adminSignOut}>
        <button className="btn-secondary w-full py-3">Back to sign in</button>
      </form>
    </div>
  );
}
