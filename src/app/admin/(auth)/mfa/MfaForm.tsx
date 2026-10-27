"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { verifyAdminTotp } from "../actions";

/** Shows the enrolment QR on first use, then verifies a code to unlock the panel. */
export function MfaForm({ setup }: { setup: { qr: string; secret: string } | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await verifyAdminTotp(code.trim()).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={verify} className="card space-y-5 p-8" aria-labelledby="mfa-title">
      <div className="space-y-1.5">
        <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[var(--s-brand-soft)] text-brand-700">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l7 3v5c0 4.5-3 8.3-7 9.5-4-1.2-7-5-7-9.5V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <h1 id="mfa-title" className="text-[26px] leading-tight font-extrabold tracking-tight">
          {setup ? "Set up two-factor authentication" : "Two-factor authentication"}
        </h1>
        {!setup && <p className="text-sm text-[var(--s-muted)]">Enter the 6-digit code from your authenticator app.</p>}
      </div>
      {setup && (
        <>
          <p className="text-sm text-[var(--s-muted)]">
            Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password or similar, then enter the
            6-digit code.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="TOTP QR code" className="mx-auto size-48 rounded-2xl border border-[var(--s-border)] bg-white p-2 shadow-[var(--s-field-shadow)]" />
          <p className="rounded-xl bg-[var(--s-hover)] px-3 py-2 text-center text-xs text-[var(--s-muted)]">
            Or enter this key: <code className="font-mono font-semibold break-all text-[var(--s-text)]">{setup.secret}</code>
          </p>
        </>
      )}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="input py-3.5 text-center font-mono text-2xl font-bold tracking-[0.6em]"
        placeholder="••••••"
        autoFocus
        aria-label="Authentication code"
      />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button className="btn-primary w-full py-3 text-[15px]" disabled={busy || code.length < 6}>
        {busy ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
