// Browser-only: shrink photos before upload so each request stays small. The server
// still does the real resize + watermark with sharp.

const MAX_EDGE = 2400;
const MAX_UNCOMPRESSED = 7 * 1024 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) throw new Error("encode failed");
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Browser can't decode it (e.g. HEIC on Chrome): send as-is if small enough.
    if (file.size <= MAX_UNCOMPRESSED) return file;
    throw new Error(`${file.name} is too large. Please choose a JPG or PNG photo.`);
  }
}
