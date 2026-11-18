"use client";

import { useState, useTransition } from "react";
import { saveTemplateSettings, sendTemplateTestAction } from "@/app/admin/whatsapp-actions";
import type { ActionState } from "@/lib/types";

// Settings → WhatsApp templates: one row per template the website sends. The wording
// lives in Meta (WhatsApp Manager); here the admin matches the name and language Meta
// approved, switches notifications off, and sends a test with the sample values.

export type TemplateRow = {
  key: string;
  category: string;
  purpose: string;
  params: string[];
  sample: string[];
  name: string;
  lang: string;
  enabled: boolean;
  /** Meta's status for this name + language, or null when it isn't known. */
  status: string | null;
};

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

function MetaStatus({ status, known }: { status: string | null; known: boolean }) {
  if (!known) return null;
  const s = status ?? "NOT FOUND";
  const tone = s === "APPROVED" ? "bg-[var(--s-brand-soft)] text-[var(--brand)]" : s === "NOT FOUND" || s === "REJECTED" ? "bg-[var(--s-seg)] text-[var(--s-late)]" : "bg-[var(--s-seg)] text-[var(--s-text-2)]";
  return <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${tone}`}>{s === "NOT FOUND" ? "Not in Meta" : s.toLowerCase().replace(/_/g, " ")}</span>;
}

export function WhatsAppTemplates({ templates, statusKnown }: { templates: TemplateRow[]; statusKnown: boolean }) {
  const [rows, setRows] = useState(templates);
  const [testPhone, setTestPhone] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<TemplateRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dirty = rows.some((r, i) => r.name !== templates[i].name || r.lang !== templates[i].lang || r.enabled !== templates[i].enabled);

  function save() {
    startTransition(async () => {
      setState(await saveTemplateSettings(Object.fromEntries(rows.map((r) => [r.key, { name: r.name, lang: r.lang, enabled: r.enabled }]))));
    });
  }

  function test(key: string) {
    if (!testPhone.trim()) return setState({ ok: false, error: "Enter a test phone number first." });
    if (dirty) return setState({ ok: false, error: "Save your changes first, so the test uses them." });
    setTesting(key);
    startTransition(async () => {
      setState(await sendTemplateTestAction(key, testPhone));
      setTesting(null);
    });
  }

  return (
    <div className="space-y-5">
      <div className="max-w-sm">
        <label htmlFor="tpl-test-phone" className="label">
          Test phone number
        </label>
        <input
          id="tpl-test-phone"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          inputMode="tel"
          placeholder="e.g. 9740913107"
          className="input"
        />
        <p className="mt-1 text-xs text-[var(--s-muted)]">&quot;Send test&quot; sends the template with its sample values to this number. It can&apos;t be the connected number itself.</p>
      </div>

      <ul className="divide-y divide-[var(--s-border)] rounded-2xl border border-[var(--s-border)]">
        {rows.map((r) => (
          <li key={r.key} className={`space-y-3 p-4 ${r.enabled ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm font-bold text-[var(--s-text)]">{r.key}</p>
              <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-[11px] font-bold text-[var(--s-text-2)]">{r.category}</span>
              <MetaStatus status={r.status} known={statusKnown} />
              <span className="text-xs text-[var(--s-muted)]">{r.purpose}</span>
            </div>
            <p className="text-xs text-[var(--s-muted)]">
              Variables: {r.params.map((p, i) => `{{${i + 1}}} ${p}`).join(" · ")}
            </p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto] sm:items-end">
              <div>
                <label className="label" htmlFor={`tpl-${r.key}-name`}>
                  Name in Meta
                </label>
                <input
                  id={`tpl-${r.key}-name`}
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value.trim().toLowerCase() })}
                  spellCheck={false}
                  className="input font-mono text-xs"
                />
              </div>
              <div>
                <label className="label" htmlFor={`tpl-${r.key}-lang`}>
                  Language
                </label>
                <input
                  id={`tpl-${r.key}-lang`}
                  value={r.lang}
                  onChange={(e) => update(r.key, { lang: e.target.value.trim() })}
                  spellCheck={false}
                  placeholder="en"
                  className="input font-mono text-xs"
                />
              </div>
              <label className="flex h-[2.6rem] items-center gap-2 text-sm font-bold text-[var(--s-text-2)]" title={r.key === "otp_login" ? "Login codes can't be switched off" : undefined}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  disabled={r.key === "otp_login"}
                  onChange={(e) => update(r.key, { enabled: e.target.checked })}
                />
                Send
              </label>
              <button type="button" onClick={() => test(r.key)} disabled={pending} className="btn-secondary h-[2.6rem] px-3 text-sm">
                {testing === r.key ? "Sending…" : "Send test"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--s-border)] pt-4">
        <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary px-4 py-2 text-sm">
          {pending && !testing ? "Saving…" : "Save"}
        </button>
        <Status state={state} />
      </div>
    </div>
  );
}
