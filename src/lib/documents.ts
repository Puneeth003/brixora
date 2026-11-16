import "server-only";
import sharp from "sharp";
import { putFile } from "./storage";
import { DOCUMENT_LIMITS } from "./constants";

// Owners' ownership documents (sale deed, khata, …). PDFs are stored as uploaded;
// photos of documents are re-encoded to JPEG, which also drops the camera's metadata.
// The type is decided by the file's first bytes, never by its name or the browser.

export class DocumentError extends Error {}

const PDF = Buffer.from("%PDF-");

function sniff(buf: Buffer): "pdf" | "image" | null {
  if (buf.subarray(0, PDF.length).equals(PDF)) return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image"; // JPEG
  if (buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image"; // PNG
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image";
  return null;
}

/** Validates and stores one document privately. Returns what the database row needs. */
export async function storeDocument(file: File, propertyId: string) {
  if (!file.size) throw new DocumentError("No file received.");
  if (file.size > DOCUMENT_LIMITS.maxBytes) {
    throw new DocumentError(`Each document must be under ${DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB.`);
  }
  const input = Buffer.from(await file.arrayBuffer());
  const kind = sniff(input);
  if (!kind) throw new DocumentError("Please upload a PDF, or a JPG / PNG photo of the document.");

  let data = input;
  if (kind === "image") {
    try {
      data = await sharp(input).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } catch {
      throw new DocumentError("That photo couldn't be read. Please try another file.");
    }
  }
  const ext = kind === "pdf" ? "pdf" : "jpg";
  const storagePath = `${propertyId}/${crypto.randomUUID()}.${ext}`;
  await putFile("documents", storagePath, data);
  return {
    storagePath,
    mimeType: kind === "pdf" ? "application/pdf" : "image/jpeg",
    sizeBytes: data.length,
    originalName: file.name ? file.name.slice(0, 160) : null,
  };
}

export function documentUrl(storagePath: string) {
  return `/admin/documents/${storagePath}`;
}
