"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PhoneOtp } from "@/components/PhoneOtp";

/** Member sign-in. Signing in and creating an account are the same WhatsApp code; only the wording differs. */
export function ManageLogin({ next }: { next?: string; title?: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const onVerified = useCallback(() => {
    // Only same-site paths we know, so ?next= can't send people elsewhere.
    if (next && /^\/(manage|account|properties|post)(\/|\?|$)/.test(next)) router.push(next);
    else router.refresh();
  }, [next, router]);

  return (
    <div className="card mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">{creating ? "Create account" : "Sign in"}</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-500">
        {creating ? "Enter your WhatsApp number. We'll send a code to set up your account." : "Enter your WhatsApp number to get a sign-in code."}
      </p>
      <PhoneOtp onVerified={onVerified} />
      <div className="mt-5 space-y-1.5 text-center text-sm text-zinc-500">
        <p>
          {creating ? "Already have an account? " : "New here? "}
          <button type="button" onClick={() => setCreating((c) => !c)} className="font-medium text-brand-700 hover:underline">
            {creating ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p>
          Agent or staff?{" "}
          <Link href="/admin/login" className="font-medium text-brand-700 hover:underline">
            Staff login
          </Link>
        </p>
      </div>
    </div>
  );
}
