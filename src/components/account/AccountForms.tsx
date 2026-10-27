"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { markRepliesRead, savedState, sendMemberMessage, toggleSaved, updateMemberProfile } from "@/app/(site)/account/actions";
import type { ActionState } from "@/lib/types";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-brand-700" : "text-red-600"}`}>{state.ok ? state.message : state.error}</p>;
}

export function ProfileForm({ name, email }: { name: string | null; email: string | null }) {
  const [state, action, pending] = useActionState(updateMemberProfile, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="label">Your name</span>
        <input name="name" defaultValue={name ?? ""} required className="input" />
      </label>
      <label className="block">
        <span className="label">Email (optional)</span>
        <input name="email" type="email" defaultValue={email ?? ""} className="input" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function MessageForm({ enquiryId }: { enquiryId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await sendMemberMessage(prev, fd);
    if (res?.ok) {
      (document.getElementById(`msg-${enquiryId}`) as HTMLFormElement | null)?.reset();
      router.refresh();
    }
    return res;
  }, null);
  return (
    <form id={`msg-${enquiryId}`} action={action} className="space-y-2">
      <input type="hidden" name="enquiry_id" value={enquiryId} />
      <textarea name="body" rows={2} required maxLength={2000} placeholder="Ask a question or reply to our team…" className="input" />
      <div className="flex items-center gap-3">
        <button className="btn-secondary px-3 py-1.5 text-sm" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

/** Marks our replies as read once the member has the page open. */
export function MarkRepliesRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) markRepliesRead();
  }, [unread]);
  return null;
}

/** Heart button on a listing. Asks guests to sign in. */
export function SaveButton({ propertyId, refNo }: { propertyId: string; refNo: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    savedState(propertyId)
      .then((s) => setSaved(s.saved))
      .catch(() => setSaved(false));
  }, [propertyId]);

  function click() {
    start(async () => {
      const res = await toggleSaved(propertyId);
      if (res.needsLogin) router.push(`/login?next=${encodeURIComponent(`/properties/${refNo}`)}`);
      else if (res.ok) setSaved(Boolean(res.saved));
    });
  }

  return (
    <button type="button" onClick={click} disabled={pending || saved === null} className="btn-secondary w-full" aria-pressed={Boolean(saved)}>
      <span aria-hidden className={saved ? "text-red-500" : "text-zinc-400"}>
        {saved ? "♥" : "♡"}
      </span>
      {saved ? "Saved to your shortlist" : "Save to shortlist"}
    </button>
  );
}
