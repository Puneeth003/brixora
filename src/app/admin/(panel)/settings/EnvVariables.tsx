"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { saveEnvVariables } from "@/app/admin/settings-actions";
import type { ActionState } from "@/lib/types";

// Hostinger-style environment variable editor. Every variable the website can take is
// listed (grouped), ready to fill in. Importing or pasting KEY=value text only changes
// the variables it names; every other row stays as it is. Deleting asks first, then
// removes the saved value straight away. Saved secrets are never sent to the browser:
// their row shows a mask, and leaving it empty keeps them.

export type EnvVar = { name: string; group: string; secret: boolean; hint: string; saved: boolean; value: string; onServer: boolean };

/**
 * Accepts a .env file or a notes file as it is: KEY=value, KEY: value or KEY<tab>value
 * (copied from a hosting panel's table). Headings, comments and other prose are ignored;
 * `export ` and surrounding quotes are stripped.
 */
function parseDotenv(text: string) {
  const out: [string, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*(?:=|:|\t)\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    out.push([m[1], value]);
  }
  return out;
}

/** Empty, or still a note placeholder like "<LATER: from Meta>" or "(LATER)". */
const isPlaceholder = (v: string) => !v.trim() || /^<.*>$/.test(v.trim()) || /\bLATER\b/.test(v);

/** Set in Settings → Organization → Website details, not here. */
const WEBSITE_DETAILS = new Set(["BROKERAGE_ENQUIRY_WHATSAPP", "WHATSAPP_PHONE_NUMBER_ID"]);

/** Variables that only the hosting panel can set (the site needs them to start). */
const SERVER_ONLY = /^(DB_|AUTH_SECRET$|UPLOAD_DIR$|NODE_ENV$)/;

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs font-bold ${state.ok ? "text-[var(--brand)]" : "text-[var(--s-late)]"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

export function EnvVariables({ vars }: { vars: EnvVar[] }) {
  const byName = new Map(vars.map((v) => [v.name, v]));
  const initial = Object.fromEntries(vars.map((v) => [v.name, v.value]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);
  const [dotenv, setDotenv] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const changed = vars.filter((v) => (values[v.name] ?? "") !== (initial[v.name] ?? ""));
  const set = (name: string, value: string) => setValues((vs) => ({ ...vs, [name]: value }));

  /** Writes the named variables only; returns a summary of what was used and skipped. */
  function apply(text: string) {
    const parsed = parseDotenv(text);
    const serverOnly: string[] = [];
    const website: string[] = [];
    const placeholders: string[] = [];
    const unknown: string[] = [];
    const next: Record<string, string> = {};
    for (const [name, value] of parsed) {
      if (!byName.has(name)) {
        (SERVER_ONLY.test(name) ? serverOnly : name.startsWith("NEXT_PUBLIC_") || WEBSITE_DETAILS.has(name) ? website : unknown).push(name);
        continue;
      }
      if (isPlaceholder(value)) {
        placeholders.push(name);
        continue;
      }
      next[name] = value;
    }
    const names = Object.keys(next);
    if (names.length) setValues((vs) => ({ ...vs, ...next }));
    const notes = [
      placeholders.length && `skipped ${placeholders.join(", ")} (no real value yet)`,
      website.length && `${website.join(", ")} belong in Organization → Website details`,
      serverOnly.length && `left ${serverOnly.join(", ")} in the hosting panel`,
      unknown.length && `ignored ${unknown.join(", ")} (not used by the website)`,
    ].filter(Boolean);
    const summary = `Filled in ${names.length ? names.join(", ") : "nothing"}${notes.length ? `; ${notes.join("; ")}` : ""}.`;
    setState(
      names.length
        ? { ok: true, message: `${summary} Other variables are unchanged. Press Save to apply.` }
        : { ok: false, error: parsed.length ? summary : "No KEY=value lines found." },
    );
    return { parsed: parsed.length, used: names.length };
  }

  /** Pasting KEY=value text into any box fills the right rows instead of that one box. */
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    // A plain value (even one ending in "=") pastes into the box as usual.
    if (!parseDotenv(text).some(([name]) => byName.has(name))) return;
    e.preventDefault();
    apply(text);
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setDotenv(text);
    } catch {
      setState({ ok: false, error: "The browser blocked clipboard access. Paste into the box with Ctrl+V / ⌘V instead." });
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) return setState({ ok: false, error: "That file is too big for a .env or notes file." });
    setDotenv(await file.text());
  }

  function importText() {
    apply(dotenv);
    setDotenv("");
    setImporting(false);
  }

  async function askDelete(v: EnvVar) {
    if (!v.saved) {
      set(v.name, "");
      return;
    }
    const ok = await confirm({
      title: `Delete ${v.name}?`,
      message: v.onServer
        ? "The value saved here is removed now. The website goes back to the value set in the hosting panel."
        : "The value saved here is removed now. Anything that uses it stops working until you set it again.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    set(v.name, "");
    startTransition(async () => {
      const res = await saveEnvVariables({ set: {}, remove: [v.name] });
      setState(res?.ok ? { ok: true, message: `${v.name} deleted.` } : res);
    });
  }

  function save() {
    const toSet: Record<string, string> = {};
    const remove: string[] = [];
    for (const v of changed) {
      const value = (values[v.name] ?? "").trim();
      if (value) toSet[v.name] = value;
      // Clearing a saved, visible value removes it; an empty secret box just means "keep".
      else if (v.saved && !v.secret) remove.push(v.name);
    }
    startTransition(async () => {
      const res = await saveEnvVariables({ set: toSet, remove });
      setState(res);
      // Saved secrets aren't sent back, so empty their boxes (they then show "saved").
      if (res?.ok) setValues((vs) => ({ ...vs, ...Object.fromEntries(vars.filter((v) => v.secret).map((v) => [v.name, ""])) }));
    });
  }

  const groups = [...new Set(vars.map((v) => v.group))];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setImporting((x) => !x)} className="btn-secondary px-3 py-2 text-sm">
          Import .env / note
        </button>
        <span className="self-center text-xs text-[var(--s-muted)]">You can also paste KEY=value lines straight into any box below.</span>
      </div>

      {importing && (
        <div className="space-y-2 rounded-2xl border border-[var(--s-border)] p-4">
          <label htmlFor="env-import" className="label">
            Paste or upload your .env file or notes (.txt) as they are
          </label>
          <p className="text-xs text-[var(--s-muted)]">
            Only the variables named in the text are filled in; the others stay as they are. Headings, comments, placeholders like{" "}
            <code>&lt;LATER&gt;</code> and server-only keys (database, AUTH_SECRET) are skipped.
          </p>
          <textarea
            id="env-import"
            value={dotenv}
            onChange={(e) => setDotenv(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={"META_APP_ID=2001817940484419\nWHATSAPP_ES_CONFIG_ID=…"}
            className="input font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={importText} disabled={!dotenv.trim()} className="btn-primary px-3 py-2 text-sm">
              Import
            </button>
            <button type="button" onClick={pasteClipboard} className="btn-secondary px-3 py-2 text-sm">
              Paste from clipboard
            </button>
            <label className="btn-secondary cursor-pointer px-3 py-2 text-sm">
              Upload .txt / .env
              <input
                type="file"
                accept=".txt,.env,text/plain"
                className="sr-only"
                onChange={(e) => {
                  void loadFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" onClick={() => setImporting(false)} className="btn-secondary px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h3 className="text-xs font-bold tracking-wide text-[var(--s-muted)] uppercase">{g}</h3>
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.25rem] gap-2 sm:grid">
            <span className="label !mb-0">Key</span>
            <span className="label !mb-0">Value</span>
          </div>
          <ul className="space-y-3 sm:space-y-2">
            {vars
              .filter((v) => v.group === g)
              .map((v) => {
                const value = values[v.name] ?? "";
                const edited = value !== (initial[v.name] ?? "");
                const source = edited ? "Changed, not saved" : v.saved ? "Saved here" : v.onServer ? "From hosting panel" : "Not set";
                return (
                  <li key={v.name} className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.25rem]">
                    <div className="min-w-0 sm:pt-2">
                      <p className="truncate font-mono text-xs font-bold text-[var(--s-text)]" title={v.name}>
                        {v.name}
                      </p>
                      <p className={`text-[11px] ${edited ? "font-bold text-[var(--brand)]" : "text-[var(--s-muted)]"}`}>{source}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => askDelete(v)}
                      disabled={pending || (!v.saved && !value)}
                      aria-label={`Delete ${v.name}`}
                      title={v.saved ? "Delete the saved value" : "Clear"}
                      className="btn-secondary row-span-2 grid h-[2.6rem] place-items-center px-0 text-[var(--s-late)] disabled:opacity-30 sm:col-start-3 sm:row-span-1 sm:row-start-1"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                    <div className="relative sm:col-start-2 sm:row-start-1">
                      <input
                        aria-label={`Value for ${v.name}`}
                        type={v.secret && !reveal[v.name] ? "password" : "text"}
                        value={value}
                        onChange={(e) => set(v.name, e.target.value)}
                        onPaste={onPaste}
                        placeholder={v.secret && v.saved ? "•••••••• saved. Type to replace" : v.onServer ? `Using the hosting panel's value. ${v.hint}` : v.hint}
                        autoComplete="off"
                        spellCheck={false}
                        className={`input font-mono text-xs ${v.secret ? "pr-10" : ""}`}
                      />
                      {v.secret && (
                        <button
                          type="button"
                          onClick={() => setReveal((r) => ({ ...r, [v.name]: !r[v.name] }))}
                          aria-label={reveal[v.name] ? "Hide value" : "Show value"}
                          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-[var(--s-muted)] hover:text-[var(--s-text)]"
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                            {reveal[v.name] ? <circle cx="12" cy="12" r="3" /> : <path d="M3 3l18 18" />}
                          </svg>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-[var(--s-border)] bg-white/95 py-4 backdrop-blur">
        <button type="button" onClick={save} disabled={pending || !changed.length} className="btn-primary px-4 py-2 text-sm">
          {pending ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Save"}
        </button>
        {changed.length > 0 && (
          <button type="button" onClick={() => setValues(initial)} disabled={pending} className="btn-secondary px-3 py-2 text-sm">
            Discard changes
          </button>
        )}
        <Status state={state} />
      </div>
      {confirmDialog}
    </div>
  );
}
