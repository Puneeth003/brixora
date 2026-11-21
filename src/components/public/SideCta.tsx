"use client";

import { useEffect, useState } from "react";
import { PhoneIcon } from "@/components/icons";
import { EmiCalculator } from "./EmiCalculator";

const WhatsAppIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={`size-5 shrink-0 ${className}`}>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm0 18.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 1 1 6.98 3.86Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
  </svg>
);

const CalculatorIcon = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className={`size-5 shrink-0 ${className}`}
  >
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h4" />
  </svg>
);

/**
 * Tab fixed to the right edge of every public page: WhatsApp, call, and an "EMI
 * Calculator" label (reading bottom to top) that slides out a calculator panel.
 */
export function SideCta({ whatsappHref, phoneHref }: { whatsappHref: string | null; phoneHref: string | null }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(5_000_000);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const icon =
    "grid size-11 place-items-center text-white transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white";

  return (
    <>
      <div className="fixed top-1/2 right-0 z-40 flex -translate-y-1/2 flex-col overflow-hidden rounded-l-2xl bg-brand-700 shadow-xl shadow-brand-900/25 print:hidden">
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener" aria-label="Chat on WhatsApp" title="WhatsApp" className={`${icon} bg-[#25d366] hover:bg-[#1ebe5a]`}>
            <WhatsAppIcon />
          </a>
        )}
        {phoneHref && (
          <a href={phoneHref} aria-label="Call us" title="Call us" className={`${icon} border-t border-white/15 hover:bg-brand-600`}>
            <PhoneIcon className="size-5!" />
          </a>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex w-11 flex-col items-center gap-2 border-t border-white/15 bg-gradient-to-b from-gold-400 to-gold-600 py-3 text-white transition-colors hover:from-gold-500 hover:to-gold-600 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
        >
          {/* Rotated so the label reads bottom to top, with the icon at the bottom. */}
          <span className="rotate-180 text-sm font-semibold tracking-wide whitespace-nowrap [writing-mode:vertical-rl]">EMI Calculator</span>
          <CalculatorIcon />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label="EMI calculator">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md animate-[side-panel-in_200ms_ease-out] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <p className="flex items-center gap-2 font-semibold text-brand-700">
                <CalculatorIcon /> Home-loan EMI
              </p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-9 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100" autoFocus>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="size-5">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <EmiCalculator price={price} onPriceChange={setPrice} stacked />
            </div>
            {whatsappHref && (
              <div className="border-t border-zinc-100 px-5 py-4">
                <a href={whatsappHref} target="_blank" rel="noopener" className="btn-primary w-full justify-center">
                  <WhatsAppIcon /> Talk to us about a home loan
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
