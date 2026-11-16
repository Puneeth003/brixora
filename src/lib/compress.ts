// Browser-only: shrink photos before upload so each request stays small. The server
// still does the real resize + watermark with sharp.

const MAX_EDGE = 2400;
// Matches PHOTO_LIMITS.maxBytes (kept separate: this file is client-only).
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
    // The server can't read iPhone HEIC photos either, so say so now instead of failing later.
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      throw new Error(`${file.name} is an iPhone HEIC photo this browser can't convert. Upload it from the iPhone itself, or save it as JPG first.`);
    }
    // Browser can't decode it for another reason: send as-is if small enough.
    if (file.size <= MAX_UNCOMPRESSED) return file;
    throw new Error(`${file.name} is too large. Please choose a JPG or PNG photo.`);
  }
}
