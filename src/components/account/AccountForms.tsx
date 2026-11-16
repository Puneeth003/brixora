"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { markRepliesRead, sendMemberMessage, updateMemberProfile } from "@/app/(site)/account/actions";
import { REPLIES_READ_EVENT } from "@/components/public/ProfileMenu";
import { SHORTLIST_EVENT, readShortlist, toggleShortlist } from "@/lib/shortlist";
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
    if (unread <= 0) return;
    // The page keeps its "New" highlights; only the header's unread dot is told to clear.
    markRepliesRead()
      .then(() => window.dispatchEvent(new Event(REPLIES_READ_EVENT)))
      .catch(() => {});
  }, [unread]);
  return null;
}

/**
 * Heart button on a listing. Buyers don't need an account: the shortlist is kept in
 * their browser and shown at /shortlist.
 */
export function SaveButton({ refNo }: { propertyId?: string; refNo: string }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSaved(readShortlist().includes(refNo));
    sync();
    window.addEventListener(SHORTLIST_EVENT, sync);
    window.addEventListener("storage", sync); // another tab
    return () => {
      window.removeEventListener(SHORTLIST_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [refNo]);

  function click() {
    const on = toggleShortlist(refNo);
    if (on === null) setError("This browser isn’t letting us remember your shortlist (private window?).");
    else {
      setError(null);
      setSaved(on);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={click} className="btn-secondary w-full" aria-pressed={saved}>
        <span aria-hidden className={saved ? "text-red-500" : "text-zinc-400"}>
          {saved ? "♥" : "♡"}
        </span>
        {saved ? "Saved to your shortlist" : "Save to shortlist"}
      </button>
      {saved && !error && (
        <p className="text-center text-xs text-zinc-500">
          <Link href="/shortlist" className="font-semibold text-brand-700 hover:underline">
            See your shortlist
          </Link>{" "}
          · kept on this device
        </p>
      )}
      {error && (
        <p role="alert" className="text-center text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
