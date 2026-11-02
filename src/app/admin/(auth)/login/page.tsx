"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/admin/PasswordInput";
import { OrDivider } from "@/components/AuthScene";
import { adminLogin } from "../actions";

const ICON = "pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-zinc-500";
const FIELD = "h-12 rounded-xl border-zinc-200 bg-white";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await adminLogin(email.trim(), password).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    // Straight to the panel, or to the TOTP step when two-factor is on.
    router.replace(res.next);
  }

  return (
    <form onSubmit={submit} aria-labelledby="login-title">
      <h2 id="login-title" className="text-center text-2xl font-semibold tracking-tight text-zinc-900">
        Log in to your account
      </h2>
      <p className="mt-2 mb-7 text-center text-sm text-zinc-500">Staff and agents</p>

      <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="email">
        Email address
      </label>
      <div className="relative">
        <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          placeholder="Enter your email"
          className={`input pl-11 ${FIELD}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <label className="mt-5 mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="password">
        Password
      </label>
      <div className="relative">
        <svg viewBox="0 0 24 24" className={`${ICON} z-10`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          placeholder="Enter your password"
          className={`pl-11 ${FIELD}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Link
          href={`/admin/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
          className="text-sm font-medium text-zinc-700 hover:text-[var(--brand)] hover:underline"
        >
          Forgot your password?
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button className="btn-primary mt-6 h-12 w-full text-[15px]" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>

      <OrDivider />
      <Link
        href="/login"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50"
      >
        <svg viewBox="0 0 24 24" className="size-[18px] text-[#25D366]" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.2.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2z" />
        </svg>
        Buyer or owner? Log in with WhatsApp
      </Link>
    </form>
  );
}
