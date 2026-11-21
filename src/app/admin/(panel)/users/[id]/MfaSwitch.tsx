"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setStaffMfa } from "@/app/admin/crm-actions";
import { useConfirm } from "@/components/ConfirmDialog";

/** Admin-only on/off switch for one staff user's two-factor sign-in. */
export function MfaSwitch({ userId, on, enrolled, isMe, name }: { userId: string; on: boolean; enrolled: boolean; isMe: boolean; name: string }) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  async function toggle() {
    const next = !on;
    const ok = await confirm(
      next
        ? {
            title: `Switch on two-factor sign-in${isMe ? "" : ` for ${name}`}?`,
            message: enrolled
              ? "They'll need the code from their authenticator app every time they sign in."
              : "On their next page they'll be asked to scan a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator…), then enter its code at every sign-in.",
            confirmLabel: "Switch on",
          }
        : {
            title: `Switch off two-factor sign-in${isMe ? " for your account" : ` for ${name}`}?`,
            message: "A password alone will be enough to sign in to this account. If the password leaks, anyone can get in.",
            confirmLabel: "Switch off",
            danger: true,
          },
    );
    if (!ok) return;
    startTransition(async () => {
      setResult(await setStaffMfa(userId, next));
      router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-[var(--s-border)] pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--s-text)]">Two-factor sign-in</p>
          <p className="text-xs text-[var(--s-muted)]">
            {on ? (enrolled ? "On · authenticator set up" : "On · will set up the authenticator at next sign-in") : "Off · password only"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Two-factor sign-in"
          onClick={toggle}
          disabled={pending}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-[var(--brand)]" : "bg-zinc-300"}`}
        >
          <span className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </button>
      </div>
      {result && (
        <p role="status" className={`mt-2 text-xs font-bold ${result.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      {dialog}
    </div>
  );
}
