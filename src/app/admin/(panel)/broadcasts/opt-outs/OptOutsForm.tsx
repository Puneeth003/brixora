"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addOptOuts, removeOptOut } from "@/app/admin/broadcast-actions";
import { useConfirm } from "@/components/ConfirmDialog";
import { displayPhone } from "@/lib/format";
import type { ActionState } from "@/lib/types";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

/** Paste numbers (one per line, or separated by commas) to stop broadcasts to them. */
export function AddOptOutsForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setState(null);
        startTransition(async () => {
          const result = await addOptOuts(text);
          setState(result);
          if (result?.ok) {
            setText("");
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor="optout-numbers" className="text-sm font-bold text-[var(--s-text)]">
        Add numbers
      </label>
      <p className="mt-0.5 text-xs text-[var(--s-muted)]">One per line or separated by commas. 10-digit Indian numbers get +91 added.</p>
      <textarea
        id="optout-numbers"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"9876543210\n+91 98765 43211"}
        className="input mt-2 w-full font-mono text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !text.trim()} className="btn-primary px-4 py-2 text-sm">
          {pending ? "Adding…" : "Add to opt-outs"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function RemoveOptOutButton({ phone, account }: { phone: string; account: boolean }) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm({
      title: `Remove ${displayPhone(phone)}?`,
      message: account
        ? "This number can get broadcasts again, and the member's account setting is switched back on. Only do this if they asked."
        : "This number can get broadcasts again. Only do this if they asked to hear from you.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await removeOptOut(phone);
      setState(result);
      if (result?.ok) router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={onClick} disabled={pending} className="btn-secondary px-3 py-1 text-xs">
        {pending ? "Removing…" : "Remove"}
      </button>
      {state && !state.ok && <Status state={state} />}
      {dialog}
    </span>
  );
}
