"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dropdown } from "@/components/Dropdown";
import { DOCUMENT_TYPES } from "@/lib/constants";
import { compressImage } from "@/lib/compress";
import { uploadStaffDocument } from "@/app/admin/document-actions";
import type { DocumentType } from "@/lib/types";

/** Staff add a document to a listing, e.g. the auditor photographs the khata on site. */
export function StaffDocumentUpload({ propertyId }: { propertyId: string }) {
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
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.set("propertyId", propertyId);
        fd.set("docType", type);
        fd.set("file", f.type.startsWith("image/") ? await compressImage(f) : f);
        const res = await uploadStaffDocument(fd);
        if (!res.ok) throw new Error(`${f.name}: ${res.error}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--s-border)] pt-4">
      <div className="flex flex-wrap items-end gap-2">
        <Dropdown
          label="Document type"
          variant="field"
          className="min-w-0 flex-1"
          value={type}
          onChange={(v) => setType(v as DocumentType)}
          searchable
          options={DOCUMENT_TYPES}
        />
        <label className={`btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "Uploading…" : "Add document"}
          <input
            type="file"
            accept="application/pdf,image/*"
            capture="environment"
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
      {error && <p className="text-sm font-semibold text-[var(--s-late)]">{error}</p>}
    </div>
  );
}
