"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    __turnstileLoading?: Promise<void>;
  }
}

// Cloudflare's documented always-pass test site key, used when no key is configured.
const TEST_SITE_KEY = "1x00000000000000000000AA";

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!window.__turnstileLoading) {
    window.__turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Turnstile failed to load"));
      document.head.appendChild(s);
    });
  }
  return window.__turnstileLoading;
}

/**
 * Renders the widget; Cloudflare adds a hidden `cf-turnstile-response` input inside it, so
 * the token is submitted with the surrounding form. Change `resetKey` to get a fresh token.
 */
export function Turnstile({ onToken, resetKey }: { onToken?: (token: string) => void; resetKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY,
          size: "flexible",
          callback: (token: string) => onTokenRef.current?.(token),
          "expired-callback": () => onTokenRef.current?.(""),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [resetKey]);

  return <div ref={ref} className="min-h-[65px]" />;
}
