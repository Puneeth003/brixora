"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addTemplate, removeTemplate, sendTemplateTestAction } from "@/app/admin/whatsapp-actions";
import { useConfirm } from "@/components/ConfirmDialog";
import { Dropdown } from "@/components/Dropdown";
import type { ActionState } from "@/lib/types";
import type { MetaTemplate } from "@/lib/whatsapp";

// Settings → WhatsApp templates. The templates designed in Meta (WhatsApp Manager) are
// fetched automatically; the admin adds one per website message, and only added ones are
// listed (and sent). Without access to Meta the name and language are typed instead.

export type TemplateRow = {
  key: string;
  category: string;
  purpose: string;
  params: string[];
  sample: string[];
  name: string;
  lang: string;
  added: boolean;
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
  return <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${tone}`}>{status === "MISSING" ? "Not in Meta" : status.toLowerCase().replace(/_/g, " ")}</span>;
}

const varCount = (text: string) => new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
const fill = (text: string, sample: string[]) => text.replace(/\{\{(\d+)\}\}/g, (m, n) => sample[Number(n) - 1] ?? m);
const metaKey = (name: string, lang: string) => `${name}|${lang}`;

/** The template as WhatsApp shows it, with sample values filled in. */
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

function Mismatch({ t, params }: { t: MetaTemplate; params: string[] }) {
  const n = varCount(t.body);
  if (n === params.length) return null;
  return (
    <p className="text-xs font-bold text-[var(--s-late)]">
      This template has {n} variable{n === 1 ? "" : "s"}, but the website sends {params.length} ({params.join(", ")}). Meta will refuse the message.
    </p>
  );
}

/** Add / change popup: which website message, and which Meta template it uses. */
function AddDialog({
  open,
  rows,
  meta,
  editing,
  preselect,
  onClose,
  onDone,
}: {
  open: boolean;
  rows: TemplateRow[];
  meta: MetaTemplate[] | null;
  editing: TemplateRow | null;
  /** Website message to start on when adding ("Add existing" in the not-set-up list). */
  preselect: string | null;
  onClose: () => void;
  onDone: (s: ActionState) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState("");
  const [choice, setChoice] = useState("");
  const [name, setName] = useState("");
  const [lang, setLang] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const first = editing ?? rows.find((r) => !r.added && r.key === preselect) ?? rows.find((r) => !r.added) ?? null;
      setKey(first?.key ?? "");
      setChoice(editing ? metaKey(editing.name, editing.lang) : "");
      setName(editing?.name ?? first?.key ?? "");
      setLang(editing?.lang ?? first?.lang ?? "en");
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, editing, preselect, rows]);

  const row = rows.find((r) => r.key === key);
  const picked = meta?.find((m) => metaKey(m.name, m.language) === choice) ?? null;
  // Meta has nothing approved that this message could use: offer to create the suggested one.
  const noSuitable = Boolean(meta && row && !meta.some((m) => m.status === "APPROVED" && varCount(m.body) === row.params.length));
  const available = rows.filter((r) => !r.added || r.key === editing?.key);
  // Approved first, then the rest, each alphabetical.
  const metaOptions = [...(meta ?? [])]
    .sort((a, b) => Number(b.status === "APPROVED") - Number(a.status === "APPROVED") || a.name.localeCompare(b.name))
    .map((m) => ({ value: metaKey(m.name, m.language), label: `${m.name} · ${m.language}`, hint: m.status.toLowerCase(), group: m.status === "APPROVED" ? "Approved" : "Not approved yet" }));

  function submit() {
    const [n, l] = meta ? choice.split("|") : [name, lang];
    if (!key) return setError("Choose which website message this is for.");
    if (!n) return setError(meta ? "Choose a template from Meta." : "Enter the template name.");
    startTransition(async () => {
      const res = await addTemplate({ key, name: n, lang: l });
      if (res?.ok) onDone(res);
      else setError(res?.error ?? "Not saved.");
    });
  }

  return (
    <dialog
      ref={ref}
      onClose={() => open && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="tpl-add-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="max-h-[calc(100vh-2rem)] space-y-4 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-2xl">
        <h3 id="tpl-add-title" className="text-base font-extrabold tracking-tight">
          {editing ? `Change template: ${editing.purpose}` : "Add template"}
        </h3>

        {!editing && (
          <div>
            <label className="label" htmlFor="tpl-add-key">
              Website message
            </label>
            <Dropdown
              id="tpl-add-key"
              variant="field"
              label="Website message"
              value={key}
              onChange={(v) => {
                setKey(v);
                if (!meta) setName(v);
              }}
              placeholder="Choose…"
              options={available.map((r) => ({ value: r.key, label: r.purpose, hint: r.category }))}
            />
            {row && <p className="mt-1 text-xs text-[var(--s-muted)]">Sends {row.params.map((p, i) => `{{${i + 1}}} ${p}`).join(", ")}</p>}
          </div>
        )}

        {meta ? (
          <div>
            <label className="label" htmlFor="tpl-add-meta">
              Template in Meta
            </label>
            <Dropdown
              id="tpl-add-meta"
              variant="field"
              label="Template in Meta"
              value={choice}
              onChange={setChoice}
              placeholder={meta.length ? "Choose a template…" : "No templates in Meta yet"}
              disabled={!meta.length}
              searchable={meta.length > 6}
              searchPlaceholder="Search templates…"
              options={metaOptions}
            />
            {noSuitable && row && (
              <p className="mt-1 text-xs text-[var(--s-muted)]">
                No suitable template in Meta yet.{" "}
                <Link href={`/admin/templates/new?for=${encodeURIComponent(row.key)}`} className="font-bold text-[var(--brand)] underline-offset-2 hover:underline">
                  Create one →
                </Link>
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <label className="label" htmlFor="tpl-add-name">
                Template name in Meta
              </label>
              <input id="tpl-add-name" value={name} onChange={(e) => setName(e.target.value.trim().toLowerCase())} spellCheck={false} className="input font-mono text-xs" />
            </div>
            <div>
              <label className="label" htmlFor="tpl-add-lang">
                Language
              </label>
              <input id="tpl-add-lang" value={lang} onChange={(e) => setLang(e.target.value.trim())} spellCheck={false} placeholder="en" className="input font-mono text-xs" />
            </div>
          </div>
        )}

        {picked && row && (
          <>
            <Preview t={picked} sample={row.sample} />
            <Mismatch t={picked} params={row.params} />
          </>
        )}

        {error && <p className="text-xs font-bold text-[var(--s-late)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={pending} className="btn-primary px-4 py-2 text-sm">
            {pending ? "Saving…" : editing ? "Save" : "Add template"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function WhatsAppTemplates({ templates, meta }: { templates: TemplateRow[]; meta: MetaTemplate[] | null }) {
  const router = useRouter();
  const [testPhone, setTestPhone] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ editing: TemplateRow | null; preselect?: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const added = templates.filter((r) => r.added);
  const loginDefault = templates.find((r) => r.key === "otp_login" && !r.added);
  const remaining = templates.filter((r) => !r.added).length;
  // Website messages that aren't sent yet (the login code has a default), welcome first.
  const notSetUp = templates.filter((r) => !r.added && r.key !== "otp_login").sort((a, b) => Number(b.key === "welcome") - Number(a.key === "welcome"));
  const find = (r: TemplateRow) => meta?.find((t) => t.name === r.name && t.language === r.lang) ?? null;

  function refresh() {
    setBusy("refresh");
    startTransition(() => {
      router.refresh();
      setBusy(null);
    });
  }

  function test(r: TemplateRow) {
    if (!testPhone.trim()) return setState({ ok: false, error: "Enter a test phone number first." });
    setBusy(`test:${r.key}`);
    startTransition(async () => {
      setState(await sendTemplateTestAction(r.key, testPhone));
      setBusy(null);
    });
  }

  async function remove(r: TemplateRow) {
    const ok = await confirm({
      title: `Remove the "${r.purpose}" template?`,
      message:
        r.key === "otp_login"
          ? "Login codes go back to the default template named otp_login. The template itself stays in Meta."
          : "The website stops sending this message until you add a template again. The template itself stays in Meta.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(`remove:${r.key}`);
    startTransition(async () => {
      setState(await removeTemplate(r.key));
      setBusy(null);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDialog({ editing: null })} disabled={!remaining} className="btn-primary px-4 py-2 text-sm">
          + Add template
        </button>
        {meta && (
          <button type="button" onClick={refresh} disabled={pending} className="btn-secondary px-3 py-2 text-sm">
            {busy === "refresh" ? "Refreshing…" : "Refresh from Meta"}
          </button>
        )}
        <Link href="/admin/templates/new" className="btn-secondary px-3 py-2 text-sm">
          Create a template
        </Link>
        <span className="text-xs text-[var(--s-muted)]">
          {meta ? `${meta.length} template${meta.length === 1 ? "" : "s"} found in Meta · ` : ""}
          {added.length} added · {remaining} website message{remaining === 1 ? "" : "s"} without a template
        </span>
      </div>

      <div className="max-w-sm">
        <label htmlFor="tpl-test-phone" className="label">
          Test phone number
        </label>
        <input id="tpl-test-phone" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="tel" placeholder="e.g. 9740913107" className="input" />
        <p className="mt-1 text-xs text-[var(--s-muted)]">&quot;Send test&quot; sends the template with sample values to this number. It can&apos;t be the connected number itself.</p>
      </div>

      {added.length === 0 && !loginDefault ? null : (
        <ul className="divide-y divide-[var(--s-border)] rounded-2xl border border-[var(--s-border)]">
          {loginDefault && (
            <li className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[var(--s-text)]">{loginDefault.purpose}</p>
                {meta && <Badge status={find(loginDefault)?.status ?? "MISSING"} />}
                <span className="text-xs text-[var(--s-muted)]">Default: otp_login ({loginDefault.lang}). Always sent, so sign-in keeps working.</span>
              </div>
              {find(loginDefault) && <Preview t={find(loginDefault)!} sample={loginDefault.sample} />}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setDialog({ editing: loginDefault })} className="btn-secondary px-3 py-1.5 text-sm">
                  Change
                </button>
                <button type="button" onClick={() => test(loginDefault)} disabled={pending} className="btn-secondary px-3 py-1.5 text-sm">
                  {busy === "test:otp_login" ? "Sending…" : "Send test"}
                </button>
              </div>
            </li>
          )}
          {added.map((r) => {
            const t = find(r);
            return (
              <li key={r.key} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[var(--s-text)]">{r.purpose}</p>
                  {meta && <Badge status={t?.status ?? "MISSING"} />}
                  <span className="font-mono text-xs text-[var(--s-muted)]">
                    {r.name} · {r.lang}
                  </span>
                </div>
                {t ? (
                  <>
                    <Preview t={t} sample={r.sample} />
                    <Mismatch t={t} params={r.params} />
                  </>
                ) : (
                  meta && <p className="text-xs font-bold text-[var(--s-late)]">This template isn&apos;t in Meta any more. Change it to one that is, or messages will fail.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setDialog({ editing: r })} className="btn-secondary px-3 py-1.5 text-sm">
                    Change
                  </button>
                  <button type="button" onClick={() => test(r)} disabled={pending} className="btn-secondary px-3 py-1.5 text-sm">
                    {busy === `test:${r.key}` ? "Sending…" : "Send test"}
                  </button>
                  <button type="button" onClick={() => remove(r)} disabled={pending} className="btn-secondary px-3 py-1.5 text-sm text-[var(--s-late)]">
                    {busy === `remove:${r.key}` ? "Removing…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {added.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[var(--s-border)] p-6 text-center text-sm text-[var(--s-muted)]">
          No templates added yet. Press <strong>Add template</strong> to choose one of your Meta templates for each website message.
        </p>
      )}

      {notSetUp.length > 0 && (
        <section aria-labelledby="tpl-not-set-up" className="space-y-2">
          <h3 id="tpl-not-set-up" className="text-sm font-extrabold text-[var(--s-text)]">
            Not set up yet
          </h3>
          <p className="text-xs text-[var(--s-muted)]">The website doesn&apos;t send these messages until a template is added.</p>
          <ul className="divide-y divide-[var(--s-border)] rounded-2xl border border-[var(--s-border)]">
            {notSetUp.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--s-text)]">
                    {r.purpose} <span className="ml-1 text-xs font-semibold text-[var(--s-muted)]">{r.category}</span>
                  </p>
                  {r.key === "welcome" && <p className="mt-0.5 text-xs text-[var(--s-muted)]">Sent once to a new customer, just before their first login code.</p>}
                  {r.params.length > 0 && <p className="mt-0.5 text-xs text-[var(--s-muted)]">Sends {r.params.map((p, i) => `{{${i + 1}}} ${p}`).join(", ")}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/templates/new?for=${encodeURIComponent(r.key)}`} className="btn-primary px-3 py-1.5 text-sm">
                    Create in Meta
                  </Link>
                  <button type="button" onClick={() => setDialog({ editing: null, preselect: r.key })} className="btn-secondary px-3 py-1.5 text-sm">
                    Add existing
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Status state={state} />

      <AddDialog
        open={Boolean(dialog)}
        rows={templates}
        meta={meta}
        editing={dialog?.editing ?? null}
        preselect={dialog?.preselect ?? null}
        onClose={() => setDialog(null)}
        onDone={(s) => {
          setDialog(null);
          setState(s);
        }}
      />
      {confirmDialog}
    </div>
  );
}
