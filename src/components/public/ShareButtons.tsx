"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** The browser's share support never changes while the page is open. */
const noSubscription = () => () => {};

/** Share a listing: the device's share sheet where there is one, WhatsApp, or copy the link. */
export function ShareButtons({ title, text, url, whatsappHref }: { title: string; text: string; url: string; whatsappHref: string }) {
  const [copied, setCopied] = useState(false);
  // Known only in the browser: false on the server and during hydration, then the real answer.
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked (old browser, or not a secure page): leave the link in the address bar to copy by hand.
      setCopied(false);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // Closing the share sheet rejects too; nothing to do.
    }
  };

  const pill = "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-brand-600 hover:text-brand-700";

  return (
    <div className="card p-4">
      <p className="mb-2.5 text-sm font-semibold">Share this property</p>
      <div className="flex flex-wrap gap-2">
        <a href={whatsappHref} target="_blank" rel="noopener" className={pill}>
          WhatsApp
        </a>
        <button type="button" onClick={copy} className={pill} aria-live="polite">
          {copied ? "Link copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={pill}>
            More…
          </button>
        )}
      </div>
    </div>
  );
}
