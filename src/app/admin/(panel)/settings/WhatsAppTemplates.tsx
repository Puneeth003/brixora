"use client";

import { useState, useTransition } from "react";
import { saveTemplateSettings, sendTemplateTestAction } from "@/app/admin/whatsapp-actions";
import { Dropdown } from "@/components/Dropdown";
import type { ActionState } from "@/lib/types";
import type { MetaTemplate } from "@/lib/whatsapp";

// Settings → WhatsApp templates. Each message the website sends is matched to a template
// designed and approved in Meta (WhatsApp Manager), and previewed with Meta's own wording.
// Without access to Meta (no connected number / WABA ID) the name and language are typed.

export type TemplateRow = {
  key: string;
  category: string;
  purpose: string;
  params: string[];
  sample: string[];
  name: string;
  lang: string;
  enabled: boolean;
};

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

function Badge({ status }: { status: string }) {
  const tone =
    status === "APPROVED"
      ? "bg-[var(--s-brand-soft)] text-[var(--brand)]"
      : status === "REJECTED" || status === "MISSING"
        ? "bg-[var(--s-seg)] text-[var(--s-late)]"
        : "bg-[var(--s-seg)] text-[var(--s-text-2)]";
  return (
    <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${tone}`}>{status === "MISSING" ? "Not in Meta" : status.toLowerCase().replace(/_/g, " ")}</span>
  );
}

const vars = (text: string) => new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
const fill = (text: string, sample: string[]) => text.replace(/\{\{(\d+)\}\}/g, (m, n) => sample[Number(n) - 1] ?? m);

/** The template as WhatsApp shows it, with the sample values filled in. */
function Preview({ t, sample }: { t: MetaTemplate; sample: string[] }) {
  return (
    <div className="rounded-2xl bg-[#e7ddd3] p-3">
      <div className="max-w-sm rounded-xl rounded-tl-none bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm">
        {t.header && <p className="mb-1 font-bold">{fill(t.header, sample)}</p>}
        <p className="whitespace-pre-wrap break-words">{fill(t.body, sample)}</p>
        {t.footer && <p className="mt-1 text-xs text-zinc-500">{t.footer}</p>}
      </div>
      {t.buttons.map((b) => (
        <div key={b} className="mt-1 max-w-sm rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-[#027eb5] shadow-sm">
          {b}
        </div>
      ))}
    </div>
  );
}

export function WhatsAppTemplates({ templates, meta }: { templates: TemplateRow[]; meta: MetaTemplate[] | null }) {
  const [rows, setRows] = useState(templates);
  const [testPhone, setTestPhone] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<TemplateRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dirty = rows.some((r, i) => r.name !== templates[i].name || r.lang !== templates[i].lang || r.enabled !== templates[i].enabled);
  const find = (r: TemplateRow) => meta?.find((t) => t.name === r.name && t.language === r.lang) ?? null;

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
        <input id="tpl-test-phone" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="tel" placeholder="e.g. 9740913107" className="input" />
        <p className="mt-1 text-xs text-[var(--s-muted)]">&quot;Send test&quot; sends the template with sample values to this number. It can&apos;t be the connected number itself.</p>
      </div>

      <ul className="divide-y divide-[var(--s-border)] rounded-2xl border border-[var(--s-border)]">
        {rows.map((r) => {
          const t = find(r);
          const mismatch = t && vars(t.body) !== r.params.length;
          return (
            <li key={r.key} className={`space-y-3 p-4 ${r.enabled ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[var(--s-text)]">{r.purpose}</p>
                {meta && <Badge status={t?.status ?? "MISSING"} />}
                <span className="ml-auto text-[11px] text-[var(--s-muted)]">
                  sends {r.params.map((p, i) => `{{${i + 1}}} ${p}`).join(", ")}
                </span>
              </div>

              {meta ? (
                <div>
                  <label className="label" htmlFor={`tpl-${r.key}`}>
                    Template in Meta
                  </label>
                  <Dropdown
                    id={`tpl-${r.key}`}
                    label="Template in Meta"
                    variant="field"
                    value={t ? `${t.name}|${t.language}` : ""}
                    onChange={(v) => {
                      const [name, lang] = v.split("|");
                      if (name) update(r.key, { name, lang });
                    }}
                    placeholder={`${r.name} (${r.lang}) is not in Meta. Choose one…`}
                    searchable={meta.length > 8}
                    searchPlaceholder="Search templates…"
                    options={meta.map((m) => ({
                      value: `${m.name}|${m.language}`,
                      label: `${m.name} · ${m.language} · ${m.status.toLowerCase()}`,
                    }))}
                    buttonClassName="font-mono text-xs"
                  />
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
                </div>
              )}

              {t && <Preview t={t} sample={r.sample} />}
              {mismatch && (
                <p className="text-xs font-bold text-[var(--s-late)]">
                  This template has {vars(t.body)} variable{vars(t.body) === 1 ? "" : "s"}, but the website sends {r.params.length}. Meta will refuse the message.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--s-text-2)]" title={r.key === "otp_login" ? "Login codes can't be switched off" : undefined}>
                  <input type="checkbox" checked={r.enabled} disabled={r.key === "otp_login"} onChange={(e) => update(r.key, { enabled: e.target.checked })} />
                  Send this message
                </label>
                <button type="button" onClick={() => test(r.key)} disabled={pending} className="btn-secondary px-3 py-1.5 text-sm">
                  {testing === r.key ? "Sending…" : "Send test"}
                </button>
              </div>
            </li>
          );
        })}
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
