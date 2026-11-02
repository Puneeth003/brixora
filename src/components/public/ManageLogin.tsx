"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PhoneOtp } from "@/components/PhoneOtp";
import { OrDivider } from "@/components/AuthScene";

/**
 * Member sign-in card content (sits inside AuthScene). Signing in and creating an
 * account are the same WhatsApp code; only the wording differs.
 */
export function ManageLogin({ next }: { next?: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const onVerified = useCallback(() => {
    // Only same-site paths we know, so ?next= can't send people elsewhere.
    if (next && /^\/(manage|account|properties|post)(\/|\?|$)/.test(next)) router.push(next);
    else router.refresh();
  }, [next, router]);

  return (
    <div>
      <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900">{creating ? "Create your account" : "Log in to your account"}</h2>
      <p className="mt-2 mb-6 text-center text-sm text-zinc-500">
        {creating ? "We'll send a code on WhatsApp to set up your account." : "We'll send a sign-in code to your WhatsApp."}
      </p>
      <PhoneOtp onVerified={onVerified} />
      <OrDivider />
      <Link
        href="/admin/login"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50"
      >
        <svg viewBox="0 0 24 24" className="size-[18px] text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
        </svg>
        Agent or staff login
      </Link>
      <p className="mt-6 text-center text-sm text-zinc-600">
        {creating ? "Already have an account? " : "Don't have an account? "}
        <button type="button" onClick={() => setCreating((c) => !c)} className="font-semibold text-brand-600 hover:underline">
          {creating ? "Log in" : "Create one"}
        </button>
      </p>
    </div>
  );
}
