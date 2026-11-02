"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/admin/PasswordInput";
import { adminLogin } from "../actions";

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
    <form onSubmit={submit} className="card space-y-5 p-8" aria-labelledby="login-title">
      <div className="space-y-1.5">
        <h1 id="login-title" className="text-[26px] leading-tight font-extrabold tracking-tight">
          Staff sign in
        </h1>
        <p className="text-sm text-[var(--s-muted)]">Welcome back. Sign in to manage listings, clients and agents.</p>
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" type="email" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Link
            href={`/admin/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
            className="text-sm font-bold text-[var(--brand)] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button className="btn-primary w-full py-3 text-[15px]" disabled={busy}>
        {busy ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
