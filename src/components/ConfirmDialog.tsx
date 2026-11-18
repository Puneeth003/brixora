"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Designed "are you sure?" popup: use it instead of window.confirm() everywhere.
//
//   const [confirm, dialog] = useConfirm();
//   if (!(await confirm({ title: "Delete X?", message: "…", confirmLabel: "Delete", danger: true }))) return;
//   …render {dialog} once in the component.
//
// Built on <dialog>: Esc and a click on the backdrop cancel, focus starts on Cancel.

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deleting or disconnecting. */
  danger?: boolean;
};

export function ConfirmDialog({ open, onResult, ...o }: ConfirmOptions & { open: boolean; onResult: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={() => open && onResult(false)}
      onClick={(e) => {
        // The backdrop is the dialog element itself; the panel stops the click.
        if (e.target === e.currentTarget) onResult(false);
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-2xl animate-[dropdown-in_120ms_ease-out]">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`grid size-9 shrink-0 place-items-center rounded-full ${o.danger ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-700"}`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              {o.danger ? <path d="M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /> : <path d="M12 8v.5M12 11v5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />}
            </svg>
          </span>
          <div className="min-w-0">
            <h3 id="confirm-title" className="text-base font-extrabold tracking-tight">
              {o.title}
            </h3>
            {o.message && <div className="mt-1.5 text-sm text-zinc-600">{o.message}</div>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" autoFocus onClick={() => onResult(false)} className="btn-secondary px-4 py-2 text-sm">
            {o.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onResult(true)}
            className={`btn-primary px-4 py-2 text-sm ${o.danger ? "!bg-red-600 hover:!bg-red-700" : ""}`}
          >
            {o.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Promise-based confirm. Returns the function and the dialog element to render. */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  // The options stay after closing, so the text doesn't vanish mid-animation.
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const onResult = useCallback((ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);
  return [confirm, <ConfirmDialog key="confirm" open={open} onResult={onResult} {...options} />];
}
