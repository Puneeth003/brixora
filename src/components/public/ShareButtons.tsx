"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Copy for browsers or pages where the clipboard API is missing or refused. */
function legacyCopy(text: string) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  field.remove();
  return ok;
}

/** The browser's share support never changes while the page is open. */
const noSubscription = () => () => {};

/** Share a listing: the device's share sheet where there is one, WhatsApp, or copy the link. */
export function ShareButtons({ title, text, url, whatsappHref }: { title: string; text: string; url: string; whatsappHref: string }) {
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  // Known only in the browser: false on the server and during hydration, then the real answer.
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    let ok = false;
    try {
      // The clipboard API can also sit waiting on a permission prompt; don't wait on it for long.
      await Promise.race([
        navigator.clipboard.writeText(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timed out")), 1500)),
      ]);
      ok = true;
    } catch {
      ok = legacyCopy(url);
    }
    setCopied(ok ? "copied" : "failed");
  };

  const share = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // Closing the share sheet rejects too; nothing to do.
    }
  };

  const pill = "inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-brand-600 hover:text-brand-700";

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Share this property">
      <span className="mr-1 text-sm text-zinc-500">Share</span>
      <a href={whatsappHref} target="_blank" rel="noopener" className={pill}>
        WhatsApp
      </a>
      <button type="button" onClick={copy} className={pill} aria-live="polite">
        {copied === "copied" ? "Link copied" : copied === "failed" ? "Couldn't copy" : "Copy link"}
      </button>
      {canShare && (
        <button type="button" onClick={share} className={pill}>
          More…
        </button>
      )}
    </div>
  );
}
