import { documentTypeLabel } from "@/lib/constants";
import { documentUrl } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import { deleteDocument, reviewDocument } from "@/app/admin/document-actions";
import { StaffDocumentUpload } from "./StaffDocumentUpload";
import type { PropertyDocument } from "@/lib/types";

export type DocumentRow = Pick<PropertyDocument, "id" | "doc_type" | "storage_path" | "original_name" | "mime_type" | "size_bytes" | "status" | "review_note" | "reviewed_at" | "created_at"> & {
  reviewer_name: string | null;
};

export const DOCUMENT_ROW_SELECT = `SELECT d.id, d.doc_type, d.storage_path, d.original_name, d.mime_type, d.size_bytes, d.status, d.review_note,
        d.reviewed_at, d.created_at, r.name AS reviewer_name
   FROM property_documents d LEFT JOIN users r ON r.id = d.reviewed_by
  WHERE d.property_id = ? ORDER BY d.created_at`;

const BADGE: Record<DocumentRow["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};
const LABEL: Record<DocumentRow["status"], string> = { pending: "To check", accepted: "Accepted", rejected: "Rejected" };

/** Ownership documents with accept / reject per document. For admins and the assigned auditor. */
export function PropertyDocuments({
  propertyId,
  docs,
  canReview,
  canDelete,
}: {
  propertyId: string;
  docs: DocumentRow[];
  canReview: boolean;
  canDelete: boolean;
}) {
  const pending = docs.filter((d) => d.status === "pending").length;
  return (
    <section className="card space-y-4 p-6 text-sm">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          Documents
          <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{docs.length}</span>
          {pending > 0 && <span className="badge bg-amber-100 text-amber-800">{pending} to check</span>}
        </h2>
        <p className="mt-1 text-xs text-[var(--s-muted)]">Private. Check each one against the originals at the site visit.</p>
      </div>
      {docs.length === 0 ? (
        <p className="text-[var(--s-muted)]">The owner hasn&apos;t uploaded any documents. Check the originals at the visit.</p>
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => (
            <li key={d.id} className="rounded-2xl border border-[var(--s-border)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <a href={documentUrl(d.storage_path)} target="_blank" rel="noopener" className="font-bold text-[var(--brand)] hover:underline">
                    {documentTypeLabel(d.doc_type)} ↗
                  </a>
                  <p className="truncate text-xs text-[var(--s-muted)]">
                    {d.original_name ?? (d.mime_type === "application/pdf" ? "PDF" : "Photo")} · {Math.max(1, Math.round(d.size_bytes / 1024))} KB ·{" "}
                    {formatDate(d.created_at)}
                  </p>
                </div>
                <span className={`badge shrink-0 ${BADGE[d.status]}`}>{LABEL[d.status]}</span>
              </div>
              {d.status !== "pending" && (
                <p className="mt-2 text-xs text-[var(--s-text-2)]">
                  {d.reviewer_name ?? "Staff"}, {formatDate(d.reviewed_at)}
                  {d.review_note && <>: {d.review_note}</>}
                </p>
              )}
              {canReview &&
                (d.status === "pending" ? (
                  <form action={reviewDocument.bind(null, d.id)} className="mt-3 flex flex-wrap gap-2">
                    <input name="note" maxLength={500} placeholder="Note for the owner (optional)" className="input min-w-0 flex-1 text-sm" />
                    <button name="decision" value="accepted" className="btn-primary px-3 py-1.5 text-xs">
                      Accept
                    </button>
                    <button name="decision" value="rejected" className="btn-danger px-3 py-1.5 text-xs">
                      Reject
                    </button>
                  </form>
                ) : (
                  <form action={reviewDocument.bind(null, d.id)} className="mt-2 flex gap-3">
                    <button name="decision" value="pending" className="text-xs font-bold text-[var(--s-muted)] hover:text-[var(--brand)]">
                      Undo review
                    </button>
                  </form>
                ))}
              {canDelete && (
                <form action={deleteDocument.bind(null, d.id)} className="mt-2">
                  <button className="text-xs font-bold text-[var(--s-late)] hover:underline">Delete document</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canReview && <StaffDocumentUpload propertyId={propertyId} />}
    </section>
  );
}
