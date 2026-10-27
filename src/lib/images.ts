import "server-only";
import sharp, { type OutputInfo } from "sharp";
import { putFile, removeFile } from "./storage";
import { PHOTO_LIMITS } from "./constants";
import { site } from "./site";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_EDGE = 1600;

function watermarkSvg(width: number, height: number) {
  const fontSize = Math.round(Math.max(18, width / 22));
  const label = site.name.toUpperCase();
  // Bottom-right brand mark plus a faint centred mark so crops still carry it.
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .m { font-family: Helvetica, Arial, sans-serif; font-weight: 700; letter-spacing: 0.08em; }
      </style>
      <text x="50%" y="52%" text-anchor="middle" class="m" font-size="${fontSize * 2.2}"
        fill="#ffffff" fill-opacity="0.16">${label}</text>
      <text x="${width - fontSize}" y="${height - fontSize}" text-anchor="end" class="m"
        font-size="${fontSize}" fill="#ffffff" fill-opacity="0.85"
        stroke="#000000" stroke-opacity="0.35" stroke-width="1">${label}</text>
    </svg>`);
}

export class ImageError extends Error {}

/**
 * Stores the original privately and a resized, watermarked WebP publicly under a random
 * name. Returns both storage paths.
 */
export async function processAndStore(file: File, propertyId: string) {
  if (!ACCEPTED.includes(file.type)) throw new ImageError("Please upload JPG, PNG, WebP or HEIC photos.");
  if (file.size > PHOTO_LIMITS.maxBytes) throw new ImageError("Each photo must be under 15 MB.");

  const input = Buffer.from(await file.arrayBuffer());

  let resized: Buffer;
  let info: OutputInfo;
  try {
    ({ data: resized, info } = await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new ImageError("That file doesn't look like a valid photo.");
  }

  const watermarked = await sharp(resized)
    .composite([{ input: watermarkSvg(info.width, info.height), top: 0, left: 0 }])
    .webp({ quality: 80 })
    .toBuffer();

  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[file.type];
  const originalPath = `${propertyId}/${crypto.randomUUID()}.${ext}`;
  const publicPath = `${crypto.randomUUID()}.webp`;

  await putFile("originals", originalPath, input);
  try {
    await putFile("public", publicPath, watermarked);
  } catch (e) {
    await removeFile("originals", originalPath);
    throw e;
  }

  return { storagePath: originalPath, watermarkedPath: publicPath };
}

export async function removeStoredImage(storagePath: string, watermarkedPath: string) {
  await Promise.all([removeFile("originals", storagePath), removeFile("public", watermarkedPath)]);
}

/** Admin-only URL for the private original (the route checks the admin session). */
export function originalUrl(storagePath: string) {
  return `/admin/originals/${storagePath}`;
}
