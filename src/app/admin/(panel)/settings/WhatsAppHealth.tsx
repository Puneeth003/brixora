"use client";

import { useEffect, useState, useTransition } from "react";
import { checkWhatsApp, subscribeWhatsAppApp, type HealthCheck } from "@/app/admin/whatsapp-actions";
import type { ActionState } from "@/lib/types";

function Spinner() {
  return <span aria-hidden className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

function StateIcon({ state }: { state: HealthCheck["state"] }) {
  const common = "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full";
  if (state === "ok")
    return (
      <span className={`${common} bg-emerald-100 text-emerald-700`} aria-label="OK">
        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 10.5l3.2 3.2L15 7" />
        </svg>
      </span>
    );
  if (state === "warn")
    return (
      <span className={`${common} bg-amber-100 text-amber-700`} aria-label="Warning">
        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
          <path d="M10 5.5v5.5M10 14.5v.01" />
        </svg>
      </span>
    );
  return (
    <span className={`${common} bg-red-100 text-[var(--s-late)]`} aria-label="Problem">
      <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
        <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" />
      </svg>
    </span>
  );
}

/** Settings → WhatsApp: checks the Cloud API setup with Meta, with one-click fixes. */
export function WhatsAppHealth() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixState, setFixState] = useState<ActionState>(null);
  const [checking, startCheck] = useTransition();
  const [fixing, startFix] = useTransition();

  async function load() {
    try {
      setChecks(await checkWhatsApp());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check couldn't run.");
    }
  }

  function recheck() {
    startCheck(load);
  }

  function subscribe() {
    startFix(async () => {
      const res = await subscribeWhatsAppApp();
      setFixState(res);
      await load();
    });
  }

  useEffect(() => {
    startCheck(load);
  }, []);

  const problems = checks?.filter((c) => c.state === "fail").length ?? 0;
  const warnings = checks?.filter((c) => c.state === "warn").length ?? 0;
  const busy = checking || fixing;

  return (
    <div className="rounded-2xl border border-[var(--s-border)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--s-text)]">Check connection</p>
          <p className="text-xs text-[var(--s-muted)]" aria-live="polite">
            {!checks
              ? checking
                ? "Checking with Meta…"
                : error
                  ? "Check failed."
                  : "Not checked yet."
              : problems
                ? `${problems} problem${problems === 1 ? "" : "s"} to fix${warnings ? `, ${warnings} to look at` : ""}`
                : warnings
                  ? `Ready to send, ${warnings} thing${warnings === 1 ? "" : "s"} to look at`
                  : "All good: ready to send"}
          </p>
        </div>
        <button type="button" onClick={recheck} disabled={busy} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm">
          {checking && <Spinner />}
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl bg-[var(--s-seg)] p-3 text-sm text-[var(--s-late)]">{error}</p>}
      {fixState && (
        <p className={`mt-3 rounded-xl p-3 text-sm ${fixState.ok ? "bg-[var(--s-brand-soft)] text-[var(--brand)]" : "bg-[var(--s-seg)] text-[var(--s-late)]"}`}>
          {fixState.ok ? fixState.message : fixState.error}
        </p>
      )}

      {checks && (
        <ul className={`mt-4 divide-y divide-[var(--s-border)] ${checking ? "opacity-60" : ""}`}>
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 py-3">
              <StateIcon state={c.state} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--s-text)]">{c.label}</p>
                <p className="break-words text-xs text-[var(--s-muted)]">{c.detail}</p>
              </div>
              {c.fix === "subscribe" && (
                <button type="button" onClick={subscribe} disabled={busy} className="btn-primary inline-flex shrink-0 items-center gap-2 px-3 py-1.5 text-xs">
                  {fixing && <Spinner />}
                  {fixing ? "Fixing…" : "Fix it"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read-only text with a Copy button (the webhook URL on Settings → WhatsApp). */
export function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-xs" aria-label="Webhook URL" />
      <button type="button" onClick={copy} className="btn-secondary shrink-0 px-3 py-2 text-sm">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
