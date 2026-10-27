"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { PhoneOtp } from "@/components/PhoneOtp";

export function ManageLogin({ next, title = "Manage my listing" }: { next?: string; title?: string }) {
  const router = useRouter();
  const onVerified = useCallback(() => {
    // Only same-site paths we know, so ?next= can't send people elsewhere.
    if (next && /^\/(manage|account|properties|post)(\/|\?|$)/.test(next)) router.push(next);
    else router.refresh();
  }, [next, router]);

  return (
    <div className="card mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-500">
        Sign in with your WhatsApp number. New here? The same code creates your account, so you can follow your
        enquiries, listings and saved properties.
      </p>
      <PhoneOtp onVerified={onVerified} />
    </div>
  );
}
