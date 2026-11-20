import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { MAX_RECIPIENTS } from "@/lib/broadcast";
import { CLIENT_SOURCES, CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/crm-constants";
import { metaTemplates, whatsappConnection } from "@/lib/whatsapp";
import { PageHeader } from "@/components/admin/ui";
import { NewBroadcast } from "./NewBroadcast";

export const metadata: Metadata = { title: "New broadcast" };

export default async function NewBroadcastPage() {
  await requireAdmin();
  const [conn, meta] = await Promise.all([whatsappConnection(), metaTemplates()]);

  // Broadcasts can only use approved templates; login codes (AUTHENTICATION) can't be
  // broadcast, and a LOCATION header needs coordinates the wizard doesn't collect.
  const templates = (meta ?? [])
    .filter((t) => t.status === "APPROVED" && t.category !== "AUTHENTICATION" && t.headerFormat !== "LOCATION")
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.language.localeCompare(b.language));

  const problem = !conn
    ? "WhatsApp isn't connected, so broadcasts can't be sent."
    : !meta
      ? "Your templates couldn't be loaded from Meta. Check that the WhatsApp Business Account ID is set and the token is still valid."
      : !templates.length
        ? "There are no approved marketing or utility templates in Meta yet. Create one in WhatsApp Manager and wait for Meta to approve it."
        : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <Link href="/admin/broadcasts" className="hover:text-[var(--s-text)]">
            ← Broadcasts
          </Link>
        }
        title="New broadcast"
        description="Send one approved WhatsApp template to many people, personalised for each of them."
      />
      {problem && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[color-mix(in_srgb,var(--s-late)_25%,transparent)] bg-[color-mix(in_srgb,var(--s-late)_6%,#fff)] p-5">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[var(--s-late)]">Broadcasts are unavailable</p>
            <p className="mt-0.5 text-sm text-[var(--s-text-2)]">{problem}</p>
          </div>
          <Link href="/admin/settings?section=whatsapp" className="btn-secondary px-4 py-2 text-sm">
            Open WhatsApp settings
          </Link>
        </div>
      )}
      <NewBroadcast
        templates={templates}
        disabled={Boolean(problem)}
        maxRecipients={MAX_RECIPIENTS}
        clientTypes={CLIENT_TYPES.map(({ value, label }) => ({ value, label }))}
        clientStatuses={CLIENT_STATUSES.map(({ value, label }) => ({ value, label }))}
        clientSources={CLIENT_SOURCES.map(({ value, label }) => ({ value, label }))}
      />
    </div>
  );
}
