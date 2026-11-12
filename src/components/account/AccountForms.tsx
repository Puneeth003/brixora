"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { markRepliesRead, savedState, sendMemberMessage, toggleSaved, updateMemberProfile } from "@/app/(site)/account/actions";
import { REPLIES_READ_EVENT } from "@/components/public/ProfileMenu";
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

/** Heart button on a listing. Guests are sent to sign in; failures say so instead of doing nothing. */
export function SaveButton({ propertyId, refNo }: { propertyId: string; refNo: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const loginHref = `/login?next=${encodeURIComponent(`/properties/${refNo}`)}`;

  useEffect(() => {
    savedState(propertyId)
      .then((s) => {
        setSignedIn(s.signedIn);
        setSaved(s.saved);
      })
      .catch(() => setSignedIn(false));
  }, [propertyId]);

  function click() {
    setError(null);
    // Known guest: go straight to sign-in, no round trip.
    if (signedIn === false) {
      router.push(loginHref);
      return;
    }
    start(async () => {
      try {
        const res = await toggleSaved(propertyId);
        if (res.needsLogin) router.push(loginHref);
        else if (res.ok) setSaved(Boolean(res.saved));
        else setError("This listing can’t be saved right now.");
      } catch {
        setError("Couldn’t reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={click} disabled={pending} className="btn-secondary w-full" aria-pressed={saved}>
        <span aria-hidden className={saved ? "text-red-500" : "text-zinc-400"}>
          {saved ? "♥" : "♡"}
        </span>
        {pending ? "Saving…" : saved ? "Saved to your shortlist" : "Save to shortlist"}
      </button>
      {signedIn === false && !error && (
        <p className="text-center text-xs text-zinc-500">
          <Link href={loginHref} className="font-semibold text-brand-700 hover:underline">
            Log in with WhatsApp
          </Link>{" "}
          to keep a shortlist.
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
