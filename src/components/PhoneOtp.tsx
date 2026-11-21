"use client";

import { useEffect, useState } from "react";
import { ownerSessionState, saveOwnerName, sendLoginCode, verifyLoginCode } from "@/app/(site)/login/actions";

function toE164(input: string) {
  const d = input.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;
  return null;
}

/**
 * Phone → WhatsApp OTP sign-in → (first time only) name. The server sends the code on
 * WhatsApp and sets the owner session cookie. Calls onVerified once signed in and named
 * (immediately if already). The name is changed later in My account.
 */
export function PhoneOtp({ onVerified, intro }: { onVerified: () => void; intro?: string }) {
  const [step, setStep] = useState<"checking" | "phone" | "code" | "name">("checking");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    ownerSessionState()
      .then((s) => (!s.signedIn ? setStep("phone") : s.needsName ? setStep("name") : onVerified()))
      .catch(() => setStep("phone"));
  }, [onVerified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const e164 = toE164(phone);
    if (!e164) return setError("Enter a valid 10-digit Indian mobile number.");
    setBusy(true);
    const res = await sendLoginCode(e164).catch(() => ({ ok: false as const, error: "Could not send the code. Please try again." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setStep("code");
    setCooldown(30);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const e164 = toE164(phone)!;
    setBusy(true);
    const res = await verifyLoginCode(e164, code.trim()).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.needsName) setStep("name");
    else onVerified();
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Please enter your name.");
    setBusy(true);
    const res = await saveOwnerName(name).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onVerified();
  }

  if (step === "checking") return <p className="text-sm text-zinc-500">Checking…</p>;

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} className="space-y-4">
        {intro && <p className="text-sm text-zinc-600">{intro}</p>}
        <div>
          <label className="label" htmlFor="otp-phone">
            WhatsApp number
          </label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-lg border border-r-0 border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-500">
              +91
            </span>
            <input
              id="otp-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              autoComplete="tel-national"
              // Room for a pasted "+91 98765 43210"; the server keeps only the digits.
              maxLength={17}
              className="input rounded-l-none"
              placeholder="98765 43210"
              required
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Sending…" : "Send code on WhatsApp"}
        </button>
      </form>
    );
  }

  if (step === "name") {
    return (
      <form onSubmit={submitName} className="space-y-4">
        <p className="text-sm text-zinc-600">Your number is verified. What should we call you? You can change it later in My account.</p>
        <div>
          <label className="label" htmlFor="otp-name">
            Your name
          </label>
          <input
            id="otp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={80}
            className="input"
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-zinc-600">
        We sent a 6-digit code on WhatsApp to <strong>{toE164(phone)}</strong>.{" "}
        <button type="button" className="text-brand-700 underline" onClick={() => setStep("phone")}>
          Change
        </button>
      </p>
      <div>
        <label className="label" htmlFor="otp-code">
          Verification code
        </label>
        <input
          id="otp-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="input text-center text-lg tracking-[0.5em]"
          placeholder="••••••"
          required
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || code.length < 6}>
        {busy ? "Verifying…" : "Verify"}
      </button>
      <p className="text-center text-sm text-zinc-500">
        {cooldown > 0 ? (
          `Resend code in ${cooldown}s`
        ) : (
          <button type="button" className="text-brand-700 underline" onClick={() => setStep("phone")}>
            Didn&apos;t get it? Send again
          </button>
        )}
      </p>
    </form>
  );
}
