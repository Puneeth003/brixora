"use client";

import { useState, useTransition } from "react";
import { saveEnvVariables } from "@/app/admin/settings-actions";
import type { ActionState } from "@/lib/types";

// Hostinger-style environment variable editor: Key / Value rows, add, delete and
// "Import .env". Saved secrets are never sent to the browser; their row shows a mask and
// an empty value keeps them.

export type EnvVar = { name: string; group: string; secret: boolean; hint: string; saved: boolean; value: string; onServer: boolean };
type Row = { id: number; name: string; value: string; reveal: boolean };

let nextId = 1;
const row = (name = "", value = ""): Row => ({ id: nextId++, name, value, reveal: false });

/** KEY=value lines; comments, blank lines, `export ` and surrounding quotes are handled. */
function parseDotenv(text: string) {
  const out: [string, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    out.push([m[1], value]);
  }
  return out;
}

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
  const savedNames = vars.filter((v) => v.saved).map((v) => v.name);
  const [rows, setRows] = useState<Row[]>(() => {
    const initial = vars.filter((v) => v.saved).map((v) => row(v.name, v.value));
    return initial.length ? initial : [row()];
  });
  const [importing, setImporting] = useState(false);
  const [dotenv, setDotenv] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  const used = new Set(rows.map((r) => r.name));
  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function importText() {
    const parsed = parseDotenv(dotenv);
    const skipped: string[] = [];
    const next = rows.filter((r) => r.name || r.value).map((r) => ({ ...r }));
    for (const [name, value] of parsed) {
      if (!byName.has(name)) {
        skipped.push(name);
        continue;
      }
      const existing = next.find((r) => r.name === name);
      if (existing) existing.value = value;
      else next.push(row(name, value));
    }
    setRows(next.length ? next : [row()]);
    setDotenv("");
    setImporting(false);
    const added = parsed.length - skipped.length;
    setState(
      skipped.length
        ? { ok: false, error: `Imported ${added}. Skipped ${skipped.join(", ")}: those stay in the hosting panel. Press Save to apply.` }
        : { ok: true, message: `Imported ${added}. Press Save to apply.` },
    );
  }

  function save() {
    const set: Record<string, string> = {};
    for (const r of rows) {
      if (!r.name) continue;
      const v = byName.get(r.name);
      if (!v) return setState({ ok: false, error: `${r.name} can't be set here.` });
      if (!r.value.trim() && !(v.secret && v.saved)) return setState({ ok: false, error: `${r.name} needs a value (or delete the row).` });
      set[r.name] = r.value;
    }
    const remove = savedNames.filter((n) => !rows.some((r) => r.name === n));
    startTransition(async () => setState(await saveEnvVariables({ set, remove })));
  }

  const groups = [...new Set(vars.map((v) => v.group))];
  return (
    <div className="space-y-4">
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.25rem] gap-2 sm:grid">
        <span className="label">Key</span>
        <span className="label">Value</span>
      </div>
      <ul className="space-y-3 sm:space-y-2">
        {rows.map((r) => {
          const v = byName.get(r.name);
          const keepSecret = Boolean(v?.secret && v.saved && !r.value);
          return (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.25rem]">
              <select
                aria-label="Key"
                value={r.name}
                onChange={(e) => update(r.id, { name: e.target.value, value: "", reveal: false })}
                className="input font-mono text-xs"
              >
                <option value="">Choose a variable…</option>
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {vars
                      .filter((x) => x.group === g && (x.name === r.name || !used.has(x.name)))
                      .map((x) => (
                        <option key={x.name} value={x.name}>
                          {x.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : [row()]))}
                aria-label={`Delete ${r.name || "row"}`}
                title="Delete"
                className="btn-secondary row-span-2 grid h-[2.6rem] place-items-center px-0 text-[var(--s-late)] sm:col-start-3 sm:row-span-1 sm:row-start-1"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
              </button>
              <div className="relative sm:col-start-2 sm:row-start-1">
                <input
                  aria-label={`Value for ${r.name || "variable"}`}
                  type={v?.secret && !r.reveal ? "password" : "text"}
                  value={r.value}
                  onChange={(e) => update(r.id, { value: e.target.value })}
                  placeholder={keepSecret ? "•••••••• saved. Type to replace" : (v?.hint ?? "Value")}
                  autoComplete="off"
                  spellCheck={false}
                  className={`input font-mono text-xs ${v?.secret ? "pr-10" : ""}`}
                />
                {v?.secret && (
                  <button
                    type="button"
                    onClick={() => update(r.id, { reveal: !r.reveal })}
                    aria-label={r.reveal ? "Hide value" : "Show value"}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-[var(--s-muted)] hover:text-[var(--s-text)]"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                      {r.reveal ? <circle cx="12" cy="12" r="3" /> : <path d="M3 3l18 18" />}
                    </svg>
                  </button>
                )}
              </div>
              {v?.onServer && (
                <p className="col-span-full -mt-1 text-xs text-[var(--s-muted)]">Also set on the server. The value here wins.</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setRows((rs) => [...rs, row()])} disabled={used.size >= vars.length} className="btn-secondary px-3 py-2 text-sm">
          + Add variable
        </button>
        <button type="button" onClick={() => setImporting((x) => !x)} className="btn-secondary px-3 py-2 text-sm">
          Import .env
        </button>
      </div>

      {importing && (
        <div className="space-y-2 rounded-2xl border border-[var(--s-border)] p-4">
          <label htmlFor="env-import" className="label">
            Paste the contents of a .env file
          </label>
          <textarea
            id="env-import"
            value={dotenv}
            onChange={(e) => setDotenv(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"META_APP_ID=2001817940484419\nWHATSAPP_ES_CONFIG_ID=…"}
            className="input font-mono text-xs"
          />
          <div className="flex gap-2">
            <button type="button" onClick={importText} disabled={!dotenv.trim()} className="btn-primary px-3 py-2 text-sm">
              Import
            </button>
            <button type="button" onClick={() => setImporting(false)} className="btn-secondary px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--s-border)] pt-4">
        <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-2 text-sm">
          {pending ? "Saving…" : "Save"}
        </button>
        <Status state={state} />
      </div>
    </div>
  );
}
