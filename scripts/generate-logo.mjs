// Vector recreation of the BRIXORA logo (green/white wordmark, gold X and building bars).
// Writes public/brand/{logo,wordmark}-{light,dark}.svg plus PNG exports.
// "light" = for light backgrounds (green text); "dark" = for dark backgrounds (white text).
// Run: node scripts/generate-logo.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "brand");
const GREEN = "#06392b";
const WHITE = "#fbfaf6";
const SW = 32; // letter stroke width

function wordmark(ink) {
  const s = `stroke="${ink}" stroke-width="${SW}" fill="none"`;
  const r = (x) => `
    <path d="M${x + 16} 20 V170" ${s}/>
    <path d="M${x} 36 H${x + 88} a29.5 29.5 0 0 1 0 59 H${x + 16}" ${s}/>
    <path d="M${x + 62} 95 L${x + 124} 170" ${s}/>`;
  return `
    <!-- B -->
    <path d="M16 20 V170" ${s}/>
    <path d="M0 36 H88 a29.5 29.5 0 0 1 0 59 H16" ${s}/>
    <path d="M16 95 H96 a29.5 29.5 0 0 1 0 59 H0" ${s}/>
    <!-- R -->${r(150)}
    <!-- I -->
    <path d="M318 20 V170" ${s}/>
    <!-- X: ink stroke + gold stroke -->
    <path d="M354 20 L490 170" ${s}/>
    <path d="M494 20 L358 170" stroke="url(#gold)" stroke-width="${SW}"/>
    <!-- O -->
    <circle cx="592" cy="95" r="59" ${s}/>
    <!-- R -->${r(690)}
    <!-- A as a roofline with gold building bars -->
    <path d="M842 170 L922 26 L1002 170" ${s} stroke-linejoin="miter"/>
    <rect x="910" y="112" width="10" height="58" fill="url(#gold)"/>
    <rect x="925" y="124" width="10" height="46" fill="url(#gold)"/>
    <rect x="940" y="136" width="10" height="34" fill="url(#gold)"/>`;
}

const defs = `<defs>
  <clipPath id="cap"><rect x="-10" y="20" width="1030" height="150"/></clipPath>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#a8761f"/><stop offset=".45" stop-color="#f1cf78"/><stop offset="1" stop-color="#9b6a1c"/>
  </linearGradient>
</defs>`;

function logo(ink, tagline) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 0 1014 248" width="1014" height="248" role="img" aria-label="Brixora – Together, We Build More">
${defs}<g clip-path="url(#cap)">${wordmark(ink)}</g>
  <path d="M0 214 H222 M788 214 H1004" stroke="${tagline}" stroke-width="3"/>
  <text x="505" y="226" text-anchor="middle" letter-spacing="5.5"
    font-family="Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="36" font-weight="500" fill="${tagline}">Together, We Build More</text>
</svg>`;
}

function wordmarkOnly(ink) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 4 1014 182" width="1014" height="182" role="img" aria-label="Brixora">
${defs}<g clip-path="url(#cap)">${wordmark(ink)}</g>
</svg>`;
}

const files = {
  "logo-light.svg": logo(GREEN, "#9a7436"),
  "logo-dark.svg": logo(WHITE, "#e3b85e"),
  "wordmark-light.svg": wordmarkOnly(GREEN),
  "wordmark-dark.svg": wordmarkOnly(WHITE),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, svg] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), svg);
  // Transparent PNG at 2028px wide for documents, social posts, WhatsApp profile etc.
  await sharp(Buffer.from(svg), { density: 288 }).resize({ width: 2028 }).png().toFile(path.join(OUT, name.replace(".svg", ".png")));
}

// Previews on their intended backgrounds (for checking only).
for (const [name, bg] of [["logo-light", "#fbfaf6"], ["logo-dark", "#06392b"]]) {
  await sharp({ create: { width: 1254, height: 600, channels: 4, background: bg } })
    .composite([{ input: await sharp(path.join(OUT, `${name}.png`)).resize({ width: 1100 }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(path.join(OUT, `${name}-preview.png`));
}
console.log("wrote", Object.keys(files).length * 2 + 2, "files to public/brand");
