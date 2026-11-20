import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { metaTemplates, whatsappConnection } from "@/lib/whatsapp";
import { LIMITS, type TemplateCategory } from "@/lib/wa-template-types";
import { PageHeader } from "@/components/admin/ui";
import { TemplateBuilder, type BuilderPrefill } from "./TemplateBuilder";

export const metadata: Metadata = { title: "New WhatsApp template" };

const CATEGORIES: TemplateCategory[] = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const MEDIA = ["IMAGE", "VIDEO", "DOCUMENT"] as const;

export default async function NewTemplatePage({ searchParams }: PageProps<"/admin/templates/new">) {
  await requireAdmin();
  const { from, lang } = await searchParams;
  const conn = await whatsappConnection();
  const ready = Boolean(conn?.wabaId);
  const meta = ready ? await metaTemplates() : null;

  // "Copy as new": start from an existing template. Button links and phone numbers
  // aren't part of MetaTemplate, so buttons come over by text and need their details again.
  let prefill: BuilderPrefill | null = null;
  const fromName = typeof from === "string" ? from : null;
  const fromLang = typeof lang === "string" ? lang : null;
  if (fromName && meta) {
    const t = meta.find((x) => x.name === fromName && (!fromLang || x.language === fromLang));
    if (t) {
      const media = MEDIA.find((f) => f === t.headerFormat);
      prefill = {
        source: `${t.name} (${t.language})`,
        name: `${t.name}_copy`.slice(0, LIMITS.name),
        language: t.language,
        category: CATEGORIES.find((c) => c === t.category) ?? "MARKETING",
        headerFormat: t.headerFormat === "TEXT" ? "TEXT" : (media ?? "NONE"),
        headerText: t.header ?? "",
        body: t.body,
        footer: t.footer ?? "",
        buttons: t.buttons,
      };
    }
  }

  const existing = (meta ?? []).map((t) => ({ name: t.name, language: t.language }));
  const notFound = fromName && meta && !prefill;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <Link href="/admin/templates" className="hover:text-[var(--s-text)]">
            ← Templates
          </Link>
        }
        title="New template"
        description="Design a WhatsApp message template and send it to Meta for review. Approved templates can be used in broadcasts and website messages."
      />
      {!ready && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[color-mix(in_srgb,var(--s-late)_25%,transparent)] bg-[color-mix(in_srgb,var(--s-late)_6%,#fff)] p-5">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[var(--s-late)]">Templates can&apos;t be created yet</p>
            <p className="mt-0.5 text-sm text-[var(--s-text-2)]">
              {conn
                ? "Set WHATSAPP_WABA_ID (your WhatsApp Business Account ID) so templates can be sent to Meta."
                : "WhatsApp isn't connected. Add the WhatsApp token, Phone number ID and WHATSAPP_WABA_ID first."}
            </p>
          </div>
          <Link href="/admin/settings?section=env" className="btn-secondary px-4 py-2 text-sm">
            Open environment variables
          </Link>
        </div>
      )}
      {notFound && (
        <div role="status" className="mb-6 rounded-2xl bg-[var(--s-seg)] px-4 py-3 text-sm text-[var(--s-text-2)]">
          Couldn&apos;t find <strong className="font-mono">{fromName}</strong> in Meta, so the builder starts empty.
        </div>
      )}
      <TemplateBuilder disabled={!ready} prefill={prefill} existing={existing} businessName={conn?.verifiedName || "Brixora"} />
    </div>
  );
}
