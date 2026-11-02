"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PhoneOtp } from "@/components/PhoneOtp";

const MODES = {
  signin: { tab: "Sign in", text: "Welcome back. Enter your WhatsApp number and we'll send you a code." },
  create: { tab: "Create account", text: "New here? Enter your WhatsApp number. We'll send a code and set up your account. No password needed." },
} as const;

/** Member sign-in. Signing in and creating an account are the same WhatsApp code; only the wording differs. */
export function ManageLogin({ next, title = "Sign in" }: { next?: string; title?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<keyof typeof MODES>("signin");
  const onVerified = useCallback(() => {
    // Only same-site paths we know, so ?next= can't send people elsewhere.
    if (next && /^\/(manage|account|properties|post)(\/|\?|$)/.test(next)) router.push(next);
    else router.refresh();
  }, [next, router]);

  return (
    <div className="card mx-auto max-w-md p-6">
      <h1 className="sr-only">{title}</h1>
      <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-semibold" role="tablist">
        {(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 transition-colors ${mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
          >
            {MODES[m].tab}
          </button>
        ))}
      </div>
      <p className="mt-4 mb-5 text-sm text-zinc-500">{MODES[mode].text}</p>
      <PhoneOtp onVerified={onVerified} />
      <p className="mt-5 text-center text-sm text-zinc-500">
        Agent, broker or staff?{" "}
        <Link href="/admin/login" className="font-medium text-brand-700 hover:underline">
          Staff login
        </Link>
      </p>
    </div>
  );
}
