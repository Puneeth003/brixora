"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { connectWhatsApp, disconnectWhatsApp } from "@/app/admin/whatsapp-actions";
import type { ActionState } from "@/lib/types";

// Meta Embedded Signup in "WhatsApp Business app" mode (coexistence): the admin logs in
// with Facebook, picks the business, enters the brokerage's existing WhatsApp Business
// number and confirms on the phone app. The number keeps working in the app.
//
// Meta reports the result twice: FB.login's callback carries the one-time code, and a
// postMessage from facebook.com carries the WABA (and usually the phone number) ID. Either can arrive
// first, so both are collected before calling the server.

type FbLoginResponse = { authResponse?: { code?: string } | null };

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (cb: (res: FbLoginResponse) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
    __fbLoading?: Promise<void>;
  }
}

function loadSdk(appId: string, version: string) {
  if (window.FB) return Promise.resolve();
  if (!window.__fbLoading) {
    window.__fbLoading = new Promise((resolve, reject) => {
      window.fbAsyncInit = () => {
        window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
        resolve();
      };
      const s = document.createElement("script");
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.onerror = () => reject(new Error("Facebook SDK failed to load"));
      document.head.appendChild(s);
    });
  }
  return window.__fbLoading;
}

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

export function WhatsAppConnect({ appId, configId, version, connected }: { appId: string; configId: string; version: string; connected: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const signup = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    loadSdk(appId, version).catch(() => setState({ ok: false, error: "Couldn't load Facebook. Check ad blockers and try again." }));
  }, [appId, version]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/.test(event.origin)) return;
      let data: { type?: string; event?: string; data?: Record<string, string> };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        signup.current.wabaId = data.data?.waba_id;
        signup.current.phoneNumberId = data.data?.phone_number_id;
        finish();
      } else if (data.event === "CANCEL") {
        setBusy(false);
        setState({ ok: false, error: data.data?.error_message ? `Meta: ${data.data.error_message}` : "Signup was closed before it finished." });
      } else if (data.event === "ERROR") {
        setBusy(false);
        setState({ ok: false, error: `Meta: ${data.data?.error_message ?? "signup failed"}` });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  function finish() {
    const { code, wabaId, phoneNumberId } = signup.current;
    if (!code || !wabaId) return;
    signup.current = {};
    startTransition(async () => {
      setState(await connectWhatsApp({ code, wabaId, phoneNumberId }));
      setBusy(false);
    });
  }

  function start() {
    if (!window.FB) return setState({ ok: false, error: "Facebook is still loading. Try again in a moment." });
    signup.current = {};
    setState(null);
    setBusy(true);
    window.FB.login(
      (res) => {
        const code = res.authResponse?.code;
        if (!code) {
          setBusy(false);
          return setState((s) => s ?? { ok: false, error: "Facebook login was cancelled." });
        }
        signup.current.code = code;
        finish();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      },
    );
  }

  function disconnect() {
    if (!confirm("Disconnect this number from the website? The WhatsApp Business app on the phone keeps working.")) return;
    startTransition(async () => setState(await disconnectWhatsApp()));
  }

  const working = busy || pending;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={start} disabled={working} className="btn-primary px-4 py-2 text-sm">
          {working ? "Connecting…" : connected ? "Reconnect WhatsApp Business app" : "Connect WhatsApp Business app"}
        </button>
        {connected && (
          <button type="button" onClick={disconnect} disabled={working} className="btn-secondary px-4 py-2 text-sm text-[var(--s-late)]">
            Disconnect
          </button>
        )}
      </div>
      <Status state={state} />
    </div>
  );
}
