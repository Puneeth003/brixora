import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import QRCode from "qrcode";
import { checkStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt, totpUri } from "@/lib/crypto";
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
  if (check.enrolled) return <MfaForm setup={null} />;

  // First sign-in: show the secret created at login as a QR code.
  const user = await db.one<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = ?", [check.userId]);
  if (!user?.totp_secret) redirect("/admin/login");
  const secret = decrypt(user.totp_secret);
  const qr = await QRCode.toDataURL(totpUri(secret, check.email, `${site.name} Admin`), { margin: 1, width: 384 });
  return <MfaForm setup={{ qr, secret: secret.match(/.{1,4}/g)!.join(" ") }} />;
}
