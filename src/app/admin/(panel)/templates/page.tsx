import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { metaTemplates, templateSettings, TEMPLATES } from "@/lib/whatsapp";
import { Empty, PageHeader, StatCard, Tabs } from "@/components/admin/ui";
import { RefreshButton, TemplateCards } from "./TemplateCards";

export const metadata: Metadata = { title: "WhatsApp templates" };

const STATUS_TABS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "review", label: "In review", statuses: ["PENDING", "IN_APPEAL"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
  { key: "paused", label: "Paused & disabled", statuses: ["PAUSED", "DISABLED", "LIMIT_EXCEEDED", "ARCHIVED"] },
];

const CATEGORIES = [
  { key: "all", label: "All categories" },
  { key: "marketing", label: "Marketing" },
  { key: "utility", label: "Utility" },
  { key: "authentication", label: "Authentication" },
] as const;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function TemplatesPage({ searchParams }: PageProps<"/admin/templates">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = STATUS_TABS.find((t) => t.key === one(sp.status)) ?? STATUS_TABS[0];
  const category = CATEGORIES.find((c) => c.key === one(sp.category))?.key ?? "all";
  const q = one(sp.q).trim().slice(0, 100);

  const [templates, settings] = await Promise.all([metaTemplates(), templateSettings()]);

  const href = (o: { status?: string; category?: string }) => {
    const p = new URLSearchParams();
    const s = o.status ?? tab.key;
    const c = o.category ?? category;
    if (s !== "all") p.set("status", s);
    if (c !== "all") p.set("category", c);
    if (q) p.set("q", q);
    const str = p.toString();
    return str ? `/admin/templates?${str}` : "/admin/templates";
  };

  const actions = (
    <>
      <RefreshButton />
      <Link href="/admin/templates/new" className="btn-primary px-4 py-2 text-sm">
        + Create template
      </Link>
    </>
  );

  if (!templates) {
    return (
      <>
        <PageHeader
          title="WhatsApp templates"
          description="Message templates in your WhatsApp Business Account. New ones go to Meta for review before they can be sent."
          actions={actions}
        />
        <Empty>
          <p className="text-base font-extrabold text-[var(--s-text)]">Can&apos;t load templates from Meta</p>
          <p className="mx-auto mt-2 max-w-md font-medium">
            Either WhatsApp isn&apos;t connected yet, WHATSAPP_WABA_ID (the WhatsApp Business Account ID) isn&apos;t set, or Meta couldn&apos;t be
            reached just now.
          </p>
          <Link href="/admin/settings?section=env" className="btn-secondary mt-5 inline-flex px-4 py-2 text-sm">
            Open Environment variables
          </Link>
        </Empty>
      </>
    );
  }

  // Which website message uses which template (name|language → purpose).
  const usedFor: Record<string, string[]> = {};
  for (const t of TEMPLATES) {
    const s = settings[t.key];
    if (!s?.enabled) continue;
    (usedFor[`${s.name}|${s.lang}`] ??= []).push(t.purpose);
  }

  const inCategory = templates.filter((t) => category === "all" || t.category.toLowerCase() === category);
  const needle = q.toLowerCase();
  const matching = inCategory.filter(
    (t) => !needle || t.name.toLowerCase().includes(needle) || t.body.toLowerCase().includes(needle) || t.language.toLowerCase().includes(needle),
  );
  const tabCount = (t: (typeof STATUS_TABS)[number]) => (t.statuses ? matching.filter((m) => t.statuses!.includes(m.status)).length : matching.length);
  const rows = matching
    .filter((m) => !tab.statuses || tab.statuses.includes(m.status))
    .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));

  const count = (statuses: string[]) => templates.filter((t) => statuses.includes(t.status)).length;
  const filtered = Boolean(q) || category !== "all";

  return (
    <>
      <PageHeader
        title="WhatsApp templates"
        description="Message templates in your WhatsApp Business Account. New ones go to Meta for review before they can be sent."
        actions={actions}
      />

      <div className="s-stats mb-7">
        <StatCard label="Templates" value={templates.length} />
        <StatCard label="Approved" value={count(["APPROVED"])} href={href({ status: "approved" })} />
        <StatCard label="In review" value={count(["PENDING", "IN_APPEAL"])} href={href({ status: "review" })} tone={count(["PENDING", "IN_APPEAL"]) ? "warn" : "default"} />
        <StatCard label="Rejected" value={count(["REJECTED"])} href={href({ status: "rejected" })} tone={count(["REJECTED"]) ? "bad" : "default"} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {CATEGORIES.map((c) => {
            const on = c.key === category;
            return (
              <Link
                key={c.key}
                href={href({ category: c.key })}
                aria-current={on ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  on ? "bg-[var(--s-brand-soft)] text-[var(--brand)]" : "bg-[var(--s-seg)] text-[var(--s-muted)] hover:text-[var(--s-text)]"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
        <form method="GET" action="/admin/templates" className="flex w-full gap-2 sm:w-auto" role="search">
          {tab.key !== "all" && <input type="hidden" name="status" value={tab.key} />}
          {category !== "all" && <input type="hidden" name="category" value={category} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or text…"
            aria-label="Search templates"
            className="input min-w-0 flex-1 py-2 text-sm sm:w-64"
          />
          <button type="submit" className="btn-secondary px-3 py-2 text-sm">
            Search
          </button>
        </form>
      </div>

      <Tabs active={tab.key} tabs={STATUS_TABS.map((t) => ({ key: t.key, label: t.label, href: href({ status: t.key }), count: tabCount(t) }))} />

      {rows.length ? (
        <TemplateCards templates={rows} usedFor={usedFor} />
      ) : templates.length === 0 ? (
        <Empty>
          <p className="text-base font-extrabold text-[var(--s-text)]">No templates yet</p>
          <p className="mx-auto mt-2 max-w-md font-medium">
            WhatsApp only lets a business start a conversation with an approved template. Create one here and Meta reviews it, usually within minutes
            to a day.
          </p>
          <Link href="/admin/templates/new" className="btn-primary mt-5 inline-flex px-4 py-2 text-sm">
            + Create template
          </Link>
        </Empty>
      ) : (
        <Empty>
          No {tab.key === "all" ? "" : `${tab.label.toLowerCase()} `}templates{filtered ? " match these filters" : ""}.
          {filtered && (
            <>
              {" "}
              <Link href={tab.key === "all" ? "/admin/templates" : `/admin/templates?status=${tab.key}`} className="text-[var(--brand)] hover:underline">
                Clear filters
              </Link>
            </>
          )}
        </Empty>
      )}
    </>
  );
}
