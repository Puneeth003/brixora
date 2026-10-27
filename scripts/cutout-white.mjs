// Removes a white background from artwork ("colour to alpha", like GIMP), keeping
// anti-aliased edges, then trims to content. Usage: node scripts/cutout-white.mjs in.png out.png
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
const WHITE = 248; // treat anything this light as background

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  // Alpha = how far the most-saturated channel is from white.
  const a = Math.max(0, (WHITE - r) / WHITE, (WHITE - g) / WHITE, (WHITE - b) / WHITE);
  if (a <= 0.02) {
    data[i + 3] = 0;
    continue;
  }
  // Un-blend the white so edge pixels keep their true colour.
  data[i] = Math.min(255, Math.max(0, Math.round((r - WHITE * (1 - a)) / a)));
  data[i + 1] = Math.min(255, Math.max(0, Math.round((g - WHITE * (1 - a)) / a)));
  data[i + 2] = Math.min(255, Math.max(0, Math.round((b - WHITE * (1 - a)) / a)));
  data[i + 3] = Math.round(Math.min(1, a * 1.15) * 255);
}
const out = await sharp(data, { raw: info }).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
await sharp(out.data).toFile(output);
console.log(`${output}: ${out.info.width}x${out.info.height}`);
