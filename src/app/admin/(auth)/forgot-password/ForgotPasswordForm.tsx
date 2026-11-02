"use client";

import { PasswordInput } from "@/components/admin/PasswordInput";
import Link from "next/link";
import { useEffect, useState } from "react";
import { requestPasswordReset, resetPassword, verifyResetCode } from "../actions";

type Step = "email" | "code" | "password" | "done";

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

const steps = [
  { key: "email", label: "Email" },
  { key: "code", label: "Code" },
  { key: "password", label: "New password" },
] as const;

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
      {children}
    </p>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Numbered circles: done steps show a check, the current one is brand green. */
function Stepper({ step }: { step: Exclude<Step, "done"> }) {
  const current = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`} aria-current={active ? "step" : undefined}>
            <span className="flex items-center gap-2">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold transition-colors ${
                  active
                    ? "bg-[var(--brand)] text-white shadow-[0_4px_10px_-2px_color-mix(in_srgb,var(--brand)_45%,transparent)]"
                    : done
                      ? "bg-[var(--s-brand-soft)] text-brand-700"
                      : "bg-[var(--s-seg)] text-[var(--s-muted)]"
                }`}
              >
                {done ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span className={`text-xs font-bold whitespace-nowrap ${active ? "text-[var(--s-text)]" : "text-[var(--s-muted)]"}`}>
                {s.label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </span>
            {i < steps.length - 1 && <span aria-hidden className={`mx-2 h-0.5 flex-1 rounded-full ${done ? "bg-[var(--brand)]" : "bg-[var(--s-border)]"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Email → 6-digit code → new password. The one-time token from step 2 lives only in memory. */
export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    const res = await requestPasswordReset(email).catch(() => failed);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setInfo(res.message);
    setCode("");
    setStep("code");
    setCooldown(30);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await verifyResetCode(email, code).catch(() => failed);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setToken(res.token);
    setInfo(null);
    setStep("password");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await resetPassword(email, token, password, confirm).catch(() => failed);
    setBusy(false);
    if (!res.ok) {
      if (res.error.includes("expired")) {
        setStep("email");
        setToken("");
      }
      return setError(res.error);
    }
    setToken("");
    setPassword("");
    setConfirm("");
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="card space-y-5 p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-[var(--s-brand-soft)] text-brand-700">
          <CheckIcon className="size-6" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">Password updated</h1>
          <p className="text-sm text-[var(--s-muted)]">Your password has been changed and every other session was signed out.</p>
        </div>
        <Link href="/admin/login" className="btn-primary w-full py-3 text-[15px]">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card space-y-6 p-8">
      <div className="space-y-1.5">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">Reset your password</h1>
        <p className="text-sm text-[var(--s-muted)]">Three quick steps to get back into your account.</p>
      </div>
      <Stepper step={step} />

      {step === "email" && (
        <form onSubmit={send} className="space-y-5">
          <p className="text-sm text-[var(--s-muted)]">Enter the email you sign in with. We&apos;ll send you a 6-digit code.</p>
          <div>
            <label className="label" htmlFor="fp-email">
              Email
            </label>
            <input
              id="fp-email"
              type="email"
              autoComplete="username"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button className="btn-primary w-full py-3 text-[15px]" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="space-y-5">
          {info && (
            <p role="status" className="rounded-xl bg-[var(--s-brand-soft)] px-3 py-2 text-sm font-semibold text-brand-800">
              {info}
            </p>
          )}
          <div>
            <label className="label" htmlFor="fp-code">
              6-digit code
            </label>
            <input
              id="fp-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input py-3.5 text-center font-mono text-2xl font-bold tracking-[0.6em]"
              placeholder="••••••"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-[var(--s-muted)]">The code expires in 10 minutes.</p>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button className="btn-primary w-full py-3 text-[15px]" disabled={busy || code.length < 6}>
            {busy ? "Checking…" : "Continue"}
          </button>
          <p className="flex justify-between text-sm text-[var(--s-muted)]">
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setStep("email")}>
              Change email
            </button>
            {cooldown > 0 ? (
              <span className="font-semibold tabular-nums">Resend in {cooldown}s</span>
            ) : (
              <button type="button" className="text-brand-700 hover:underline" onClick={() => send()} disabled={busy}>
                Resend code
              </button>
            )}
          </p>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={save} className="space-y-5">
          <div>
            <label className="label" htmlFor="fp-new">
              New password
            </label>
            <PasswordInput
              id="fp-new"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <p className="mt-1.5 text-xs text-[var(--s-muted)]">At least 12 characters. A short sentence works well.</p>
          </div>
          <div>
            <label className="label" htmlFor="fp-confirm">
              Confirm password
            </label>
            <PasswordInput
              id="fp-confirm"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button className="btn-primary w-full py-3 text-[15px]" disabled={busy}>
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}

      <p className="border-t border-[var(--s-border)] pt-5 text-center text-sm">
        <Link href="/admin/login" className="font-semibold text-[var(--s-muted)] hover:text-brand-700">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
