"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DOCUMENT_LIMITS, DOCUMENT_TYPES, documentTypeLabel } from "@/lib/constants";
import { compressImage } from "@/lib/compress";
import { deleteOwnDocument, uploadListingDocument } from "@/app/(site)/manage/actions";
import type { DocumentType } from "@/lib/types";

type Doc = { id: string; doc_type: string; original_name: string | null; status: "pending" | "accepted" | "rejected"; review_note: string | null; created_at: string };

const STATUS: Record<Doc["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting for review", cls: "bg-amber-50 text-amber-800" },
  accepted: { label: "Checked ✓", cls: "bg-emerald-50 text-emerald-800" },
  rejected: { label: "Not accepted", cls: "bg-red-50 text-red-700" },
};

/** The owner's ownership documents on /manage/[ref]: list, add, withdraw (until reviewed). */
export function OwnerDocuments({ propertyId, docs, canAdd }: { propertyId: string; docs: Doc[]; canAdd: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<DocumentType>("sale_deed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, DOCUMENT_LIMITS.max - docs.length)) {
        const fd = new FormData();
        fd.set("propertyId", propertyId);
        fd.set("docType", type);
        fd.set("file", f.type.startsWith("image/") ? await compressImage(f) : f);
        const res = await uploadListingDocument(fd);
        if (!res.ok) throw new Error(`${f.name}: ${res.error}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await deleteOwnDocument(id);
    if (!res.ok) setError(res.error);
    else startTransition(() => router.refresh());
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Ownership documents</h2>
        <p className="text-sm text-zinc-500">Optional. Only our team and the auditor see these; they are never shown on the website.</p>
      </div>
      {docs.length > 0 ? (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{documentTypeLabel(d.doc_type)}</span>
                <span className="block truncate text-zinc-500">{d.original_name ?? "Document"}</span>
                {d.status === "rejected" && d.review_note && <span className="block text-red-700">Reason: {d.review_note}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span>
                {d.status === "pending" && (
                  <button type="button" onClick={() => remove(d.id)} className="text-red-600 hover:underline">
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No documents yet.</p>
      )}
      {canAdd && docs.length < DOCUMENT_LIMITS.max && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="owner-doc-type">
              Document type
            </label>
            <select id="owner-doc-type" className="input" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <label className={`btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy ? "Uploading…" : "Add document"}
            <input
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
