"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  cancelBroadcast,
  deleteBroadcast,
  pauseBroadcast,
  resumeBroadcast,
  retryFailedBroadcast,
  sendBroadcastNow,
} from "@/app/admin/broadcast-actions";
import { useConfirm, type ConfirmOptions } from "@/components/ConfirmDialog";
import type { BroadcastStatus } from "@/lib/broadcast";
import type { ActionState } from "@/lib/types";

type Action = {
  key: string;
  label: string;
  primary?: boolean;
  confirm: ConfirmOptions;
  run: (id: string) => Promise<ActionState>;
};

/** Report page buttons: send now / pause / resume / cancel / retry / delete, plus live refresh. */
export function BroadcastControls({
  id,
  name,
  status,
  scheduledAt,
  pending,
  failed,
}: {
  id: string;
  name: string;
  status: BroadcastStatus;
  scheduledAt: string;
  pending: number;
  failed: number;
}) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [state, setState] = useState<ActionState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // While messages are going out, refresh every 4 seconds so the numbers move.
  useEffect(() => {
    const due = new Date(scheduledAt).getTime();
    const live = () => status === "sending" || (status === "paused" && pending > 0) || (status === "scheduled" && Date.now() >= due);
    if (status !== "sending" && status !== "paused" && status !== "scheduled") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && live()) router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [router, status, scheduledAt, pending]);

  const cancel: Action = {
    key: "cancel",
    label: "Cancel",
    confirm: {
      title: "Cancel this broadcast?",
      message: "Messages not sent yet won't be sent. Messages already sent stay sent. This can't be undone.",
      confirmLabel: "Cancel broadcast",
      cancelLabel: "Keep it",
      danger: true,
    },
    run: cancelBroadcast,
  };
  const pause: Action = {
    key: "pause",
    label: "Pause",
    confirm: { title: "Pause this broadcast?", message: "Sending stops after the current batch. You can resume it later.", confirmLabel: "Pause" },
    run: pauseBroadcast,
  };

  const actions: Action[] = [];
  if (status === "scheduled") {
    actions.push(
      {
        key: "send_now",
        label: "Send now",
        primary: true,
        confirm: { title: "Send now?", message: `"${name}" starts sending to ${pending} people right away instead of at the scheduled time.`, confirmLabel: "Send now" },
        run: sendBroadcastNow,
      },
      pause,
      cancel,
    );
  } else if (status === "sending") {
    actions.push(pause, cancel);
  } else if (status === "paused") {
    actions.push(
      {
        key: "resume",
        label: "Resume",
        primary: true,
        confirm: { title: "Resume sending?", message: `${pending} message${pending === 1 ? "" : "s"} left to send.`, confirmLabel: "Resume" },
        run: resumeBroadcast,
      },
      cancel,
    );
  }
  if (failed > 0 && status !== "cancelled" && status !== "scheduled") {
    actions.push({
      key: "retry",
      label: `Retry failed (${failed})`,
      confirm: {
        title: `Retry ${failed} failed message${failed === 1 ? "" : "s"}?`,
        message: "They go back in the queue and are sent again. Check the errors first: numbers not on WhatsApp will fail again.",
        confirmLabel: "Retry",
      },
      run: retryFailedBroadcast,
    });
  }
  if (status === "done" || status === "cancelled") {
    actions.push({
      key: "delete",
      label: "Delete",
      confirm: {
        title: "Delete this broadcast?",
        message: "The broadcast and its recipient report are removed for good. Messages already sent are not affected.",
        confirmLabel: "Delete",
        danger: true,
      },
      run: deleteBroadcast,
    });
  }

  async function onClick(a: Action) {
    if (!(await confirm(a.confirm))) return;
    setBusy(a.key);
    setState(null);
    startTransition(async () => {
      const result = await a.run(id);
      setState(result);
      setBusy(null);
      if (a.key === "delete" && result?.ok) {
        router.push("/admin/broadcasts");
        return;
      }
      router.refresh();
    });
  }

  if (!actions.length) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={isPending}
            onClick={() => onClick(a)}
            className={`${a.primary ? "btn-primary" : "btn-secondary"} px-4 py-2 text-sm ${
              a.key === "cancel" || a.key === "delete" ? "text-[var(--s-late)]" : ""
            }`}
          >
            {busy === a.key ? "Working…" : a.label}
          </button>
        ))}
      </div>
      {state && (
        <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
          {state.ok ? state.message : state.error}
        </p>
      )}
      {dialog}
    </div>
  );
}
