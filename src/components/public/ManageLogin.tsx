"use client";

import Link from "next/link";
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
      <p className="mt-1 mb-5 text-sm text-zinc-500">Use your WhatsApp number. New here? We&apos;ll create your account.</p>
      <PhoneOtp onVerified={onVerified} />
      <p className="mt-4 text-center text-sm">
        <Link href="/admin/login" className="text-zinc-500 hover:text-brand-700 hover:underline">
          Staff login
        </Link>
      </p>
    </div>
  );
}
