// Draws illustrated sample property photos into public/samples/ (WebP, watermarked like
// real uploads). Run: node scripts/generate-samples.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const W = 1200;
const H = 800;
const OUT = path.join(process.cwd(), "public", "samples");
const BRAND = (process.env.NEXT_PUBLIC_BRAND_NAME || "Brixora").toUpperCase();

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

const sky = (top, bottom) => `
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>`;

const palm = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 0 C 8 -120, 18 -220, 10 -320" stroke="#7a5a3a" stroke-width="16" fill="none"/>
    ${[-70, -35, 0, 35, 70, 110, -110]
      .map((a) => `<path d="M10 -320 q ${Math.cos((a * Math.PI) / 180) * 90} ${-40 + Math.abs(a) * 0.6} ${Math.cos((a * Math.PI) / 180) * 160} ${40 + Math.abs(a) * 0.9}" stroke="#2f7d3b" stroke-width="14" fill="none" stroke-linecap="round"/>`)
      .join("")}
  </g>`;

const tree = (x, y, r, c = "#3f8f4a") => `<rect x="${x - 8}" y="${y}" width="16" height="${r * 1.2}" fill="#6b4b2e"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x - r * 0.5}" cy="${y + r * 0.3}" r="${r * 0.7}" fill="${c}"/><circle cx="${x + r * 0.5}" cy="${y + r * 0.25}" r="${r * 0.75}" fill="${c}"/>`;

const scenes = {
  apartment: (c) =>
    svg(`${sky("#8ec5f0", "#e6f3fb")}
      <rect y="620" width="${W}" height="180" fill="#7fb069"/>
      <rect y="690" width="${W}" height="110" fill="#5c5c66"/>
      <rect x="380" y="90" width="440" height="560" fill="${c.wall}"/>
      <rect x="380" y="90" width="440" height="24" fill="${c.trim}"/>
      ${Array.from({ length: 12 }, (_, r) =>
        Array.from({ length: 5 }, (_, k) => `<rect x="${408 + k * 82}" y="${130 + r * 42}" width="58" height="26" rx="2" fill="${(r + k) % 3 ? "#a9d4f2" : "#d9eefb"}"/>`).join(""),
      ).join("")}
      ${Array.from({ length: 12 }, (_, r) => `<rect x="380" y="${156 + r * 42}" width="440" height="6" fill="${c.trim}" opacity=".7"/>`).join("")}
      <rect x="560" y="590" width="80" height="60" fill="#3d3d45"/>
      <rect x="120" y="300" width="220" height="350" fill="${c.alt}"/>
      ${Array.from({ length: 7 }, (_, r) => Array.from({ length: 3 }, (_, k) => `<rect x="${140 + k * 66}" y="${325 + r * 44}" width="44" height="26" fill="#cfe6f6"/>`).join("")).join("")}
      <rect x="860" y="250" width="240" height="400" fill="${c.alt}"/>
      ${Array.from({ length: 8 }, (_, r) => Array.from({ length: 3 }, (_, k) => `<rect x="${882 + k * 74}" y="${275 + r * 44}" width="48" height="26" fill="#cfe6f6"/>`).join("")).join("")}
      ${tree(90, 590, 55)}${tree(1130, 600, 50)}${tree(330, 610, 40, "#4c9b55")}${tree(860, 615, 38, "#4c9b55")}
      ${palm(250, 690, 0.9)}${palm(980, 690, 1)}`),

  villa: (c) =>
    svg(`${sky("#86c0ea", "#f4f9fc")}
      <rect y="600" width="${W}" height="200" fill="#6fae5c"/>
      <path d="M0 720 L1200 690 L1200 800 L0 800 Z" fill="#c9b79a"/>
      <rect x="300" y="380" width="600" height="250" fill="${c.wall}"/>
      <path d="M250 390 L600 200 L950 390 Z" fill="${c.roof}"/>
      <path d="M250 390 L600 200 L950 390" stroke="#5b2a1a" stroke-width="10" fill="none"/>
      ${Array.from({ length: 9 }, (_, i) => `<path d="M${290 + i * 80} 385 L${600} ${215}" stroke="#7a3b25" stroke-width="2" opacity=".35"/>`).join("")}
      <rect x="560" y="480" width="90" height="150" fill="#7a4a2a"/><circle cx="635" cy="560" r="5" fill="#e6c36a"/>
      <rect x="350" y="450" width="140" height="100" fill="#bfe0f5" stroke="${c.trim}" stroke-width="10"/>
      <rect x="720" y="450" width="140" height="100" fill="#bfe0f5" stroke="${c.trim}" stroke-width="10"/>
      <rect x="280" y="620" width="640" height="22" fill="#d8d2c4"/>
      <rect x="40" y="560" width="10" height="120" fill="#fff"/>${Array.from({ length: 11 }, (_, i) => `<rect x="${40 + i * 22}" y="600" width="8" height="80" fill="#fff"/>`).join("")}<rect x="40" y="610" width="230" height="8" fill="#fff"/>
      ${palm(160, 640, 1.1)}${palm(1040, 650, 1.2)}${tree(980, 600, 45)}`),

  living: (c) =>
    svg(`<rect width="${W}" height="${H}" fill="${c.wall}"/>
      <rect y="560" width="${W}" height="240" fill="#b9895a"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 100}" y="560" width="2" height="240" fill="#9c6f45"/>`).join("")}
      <rect x="760" y="120" width="320" height="300" fill="#cfe9fb" stroke="#fff" stroke-width="16"/>
      <rect x="912" y="120" width="16" height="300" fill="#fff"/><rect x="760" y="262" width="320" height="16" fill="#fff"/>
      <rect x="720" y="100" width="40" height="360" fill="${c.alt}" opacity=".8"/><rect x="1080" y="100" width="40" height="360" fill="${c.alt}" opacity=".8"/>
      <rect x="140" y="160" width="220" height="150" fill="#f6efe2" stroke="#8a6a46" stroke-width="10"/><path d="M160 290 L230 220 L280 260 L320 210 L345 290 Z" fill="${c.trim}" opacity=".7"/>
      <ellipse cx="520" cy="690" rx="330" ry="60" fill="${c.rug}"/>
      <rect x="230" y="430" width="560" height="140" rx="28" fill="${c.sofa}"/>
      <rect x="250" y="380" width="520" height="90" rx="26" fill="${c.sofa}" opacity=".85"/>
      <rect x="200" y="420" width="70" height="160" rx="24" fill="${c.sofa}"/><rect x="750" y="420" width="70" height="160" rx="24" fill="${c.sofa}"/>
      <rect x="300" y="400" width="110" height="70" rx="16" fill="${c.trim}"/><rect x="610" y="400" width="110" height="70" rx="16" fill="${c.alt}"/>
      <rect x="420" y="620" width="220" height="24" rx="6" fill="#6b4b2e"/><rect x="440" y="644" width="12" height="50" fill="#6b4b2e"/><rect x="608" y="644" width="12" height="50" fill="#6b4b2e"/>
      <rect x="930" y="470" width="80" height="100" fill="#d9c7a7"/><path d="M970 470 q-60 -90 -10 -170 q20 80 70 40 q-20 70 -60 130" fill="#3f8f4a"/>
      <rect x="110" y="300" width="8" height="270" fill="#333"/><path d="M80 300 L148 300 L130 250 L98 250 Z" fill="#f2d48a"/>`),

  bedroom: (c) =>
    svg(`<rect width="${W}" height="${H}" fill="${c.wall}"/>
      <rect y="580" width="${W}" height="220" fill="#c7a47c"/>
      <rect x="320" y="250" width="560" height="200" rx="18" fill="${c.alt}"/>
      <rect x="280" y="430" width="640" height="190" rx="18" fill="#f7f4ee"/>
      <rect x="280" y="500" width="640" height="120" rx="12" fill="${c.sofa}"/>
      <rect x="350" y="400" width="200" height="70" rx="22" fill="#fff"/><rect x="650" y="400" width="200" height="70" rx="22" fill="#fff"/>
      <rect x="140" y="470" width="110" height="140" fill="#8a6a46"/><rect x="950" y="470" width="110" height="140" fill="#8a6a46"/>
      <path d="M170 470 L220 470 L210 420 L180 420 Z" fill="#f2d48a"/><path d="M980 470 L1030 470 L1020 420 L990 420 Z" fill="#f2d48a"/>
      <rect x="60" y="120" width="180" height="230" fill="#cfe9fb" stroke="#fff" stroke-width="14"/>
      <rect x="980" y="130" width="160" height="110" fill="#f6efe2" stroke="#8a6a46" stroke-width="8"/>`),

  kitchen: (c) =>
    svg(`<rect width="${W}" height="${H}" fill="#f1ede6"/>
      <rect y="620" width="${W}" height="180" fill="#9b8f80"/>
      ${Array.from({ length: 30 }, (_, i) => `<rect x="${(i % 10) * 120 + 60}" y="${330 + Math.floor(i / 10) * 40}" width="110" height="34" fill="#fff" stroke="#e1dbd2"/>`).join("")}
      <rect x="40" y="80" width="1120" height="200" fill="${c.cab}"/>${Array.from({ length: 7 }, (_, i) => `<rect x="${56 + i * 158}" y="96" width="142" height="168" fill="${c.cab}" stroke="#00000022" stroke-width="3"/><rect x="${118 + i * 158}" y="240" width="20" height="6" fill="#ccc"/>`).join("")}
      <rect x="40" y="450" width="1120" height="30" fill="#3b3b3b"/>
      <rect x="40" y="480" width="1120" height="150" fill="${c.cab}"/>${Array.from({ length: 7 }, (_, i) => `<rect x="${56 + i * 158}" y="496" width="142" height="118" fill="${c.cab}" stroke="#00000022" stroke-width="3"/>`).join("")}
      <rect x="480" y="430" width="240" height="22" fill="#222"/><circle cx="540" cy="440" r="18" fill="#444"/><circle cx="660" cy="440" r="18" fill="#444"/>
      <rect x="860" y="400" width="60" height="50" rx="6" fill="#c0392b"/><rect x="200" y="410" width="120" height="40" rx="8" fill="#ddd"/>`),

  plot: () =>
    svg(`${sky("#9fd0f2", "#eef7fc")}
      <path d="M0 470 Q 300 420 600 460 T 1200 440 L1200 800 L0 800 Z" fill="#8cc06e"/>
      <path d="M0 560 Q 400 520 800 560 T 1200 540 L1200 800 L0 800 Z" fill="#79b05a"/>
      <path d="M560 800 L620 520 L660 520 L760 800 Z" fill="#c9a77a"/>
      ${Array.from({ length: 16 }, (_, i) => `<rect x="${60 + i * 70}" y="${600 - (i % 2) * 4}" width="10" height="90" fill="#8a6a46"/>`).join("")}
      <rect x="60" y="620" width="1060" height="6" fill="#8a6a46"/><rect x="60" y="650" width="1060" height="6" fill="#8a6a46"/>
      ${palm(180, 560, 1)}${palm(330, 540, 0.8)}${palm(940, 560, 1.1)}${tree(1080, 470, 60)}${tree(80, 460, 45)}
      <rect x="820" y="610" width="140" height="80" fill="#fff" stroke="#c0392b" stroke-width="6"/><text x="890" y="660" text-anchor="middle" font-family="Arial" font-weight="700" font-size="30" fill="#c0392b">PLOT</text>`),

  office: (c) =>
    svg(`<rect width="${W}" height="${H}" fill="#e9edf0"/>
      <rect y="600" width="${W}" height="200" fill="#8f9aa3"/>
      <rect x="60" y="80" width="1080" height="380" fill="#bfe0f5"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${60 + i * 180}" y="80" width="10" height="380" fill="#7c8a96"/>`).join("")}
      <path d="M60 330 L260 250 L400 300 L600 180 L800 260 L1000 200 L1140 260 L1140 460 L60 460 Z" fill="#9cb7cb"/>
      ${[160, 520, 880].map((x) => `<rect x="${x}" y="500" width="260" height="20" fill="${c.trim}"/><rect x="${x + 20}" y="520" width="12" height="90" fill="#555"/><rect x="${x + 228}" y="520" width="12" height="90" fill="#555"/><rect x="${x + 80}" y="440" width="110" height="64" rx="4" fill="#2d3436"/><rect x="${x + 90}" y="560" width="70" height="80" rx="12" fill="${c.sofa}"/>`).join("")}`),

  shop: (c) =>
    svg(`${sky("#a7d3f3", "#f2f8fc")}
      <rect y="660" width="${W}" height="140" fill="#9a9a9a"/>
      <rect x="140" y="160" width="920" height="500" fill="${c.wall}"/>
      <rect x="140" y="160" width="920" height="110" fill="${c.roof}"/>
      ${Array.from({ length: 12 }, (_, i) => `<path d="M${140 + i * 76.6} 270 l38 40 l38 -40 Z" fill="${i % 2 ? c.roof : "#fff"}"/>`).join("")}
      <rect x="200" y="340" width="380" height="300" fill="#cfe9fb" stroke="#555" stroke-width="10"/>
      <rect x="640" y="340" width="360" height="300" fill="#bcdcf0" stroke="#555" stroke-width="10"/><rect x="790" y="340" width="10" height="300" fill="#555"/>
      <rect x="380" y="190" width="440" height="56" rx="8" fill="#fff"/><text x="600" y="230" text-anchor="middle" font-family="Arial" font-weight="700" font-size="32" fill="#333">SHOWROOM SPACE</text>`),
};

const PALETTES = [
  { wall: "#f2e6d0", trim: "#c8a46e", alt: "#e7d3b0", roof: "#b5482e", sofa: "#5b7c99", rug: "#d9c2a3", cab: "#ffffff" },
  { wall: "#e8eef2", trim: "#5d7f95", alt: "#c9d6df", roof: "#9b3d2b", sofa: "#7a8f6a", rug: "#e2d7c3", cab: "#2f4858" },
  { wall: "#f5efe6", trim: "#b07a4f", alt: "#e9d9c5", roof: "#a4452b", sofa: "#c9a26b", rug: "#cdb8a0", cab: "#e8dcc8" },
  { wall: "#eef3ec", trim: "#6c8f5e", alt: "#d6e3cf", roof: "#8f3a2a", sofa: "#3e5c76", rug: "#e8dfd0", cab: "#6c8f5e" },
];

// property key → scenes + palette index (must match src/lib/samples.ts)
export const SAMPLE_IMAGES = {
  kadri: [["apartment", 0], ["living", 0], ["bedroom", 0], ["kitchen", 0]],
  bejai: [["apartment", 1], ["living", 1], ["bedroom", 1]],
  derebail: [["villa", 2], ["living", 2], ["bedroom", 2], ["kitchen", 2]],
  pumpwell: [["apartment", 3], ["living", 3], ["kitchen", 3]],
  surathkal: [["plot", 0], ["plot", 1], ["villa", 0]],
  hampankatta: [["office", 1], ["office", 2], ["apartment", 1]],
  urwa: [["villa", 3], ["living", 3], ["bedroom", 3], ["kitchen", 1]],
  falnir: [["shop", 2], ["shop", 0], ["apartment", 2]],
  lalbagh: [["apartment", 2], ["living", 1], ["bedroom", 2], ["kitchen", 3]],
  kankanady: [["apartment", 0], ["bedroom", 3], ["living", 0]],
};

function watermark() {
  const fs_ = Math.round(W / 22);
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="52%" text-anchor="middle" font-family="Helvetica, Arial" font-weight="700" font-size="${fs_ * 2.2}" fill="#fff" fill-opacity="0.16">${BRAND}</text>
    <text x="${W - fs_}" y="${H - fs_}" text-anchor="end" font-family="Helvetica, Arial" font-weight="700" font-size="${fs_}" fill="#fff" fill-opacity="0.85" stroke="#000" stroke-opacity="0.35">${BRAND}</text>
  </svg>`);
}

// Hero: modern two-storey glass villa with pool (no watermark — it's site artwork).
function heroSvg() {
  const HW = 1600;
  const HH = 1100;
  const glass = (x, y, w, h, panes) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#glow)"/>
    ${Array.from({ length: panes - 1 }, (_, i) => `<rect x="${x + ((i + 1) * w) / panes - 3}" y="${y}" width="6" height="${h}" fill="#2b2b2b"/>`).join("")}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#2b2b2b" stroke-width="8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${HW}" height="${HH}" viewBox="0 0 ${HW} ${HH}">
    <defs>
      <linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe2f5"/><stop offset=".6" stop-color="#eef4fa"/><stop offset="1" stop-color="#fbf3e6"/></linearGradient>
      <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a8"/><stop offset="1" stop-color="#f3b866"/></linearGradient>
      <linearGradient id="pool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb3e8"/><stop offset="1" stop-color="#1c78c0"/></linearGradient>
      <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6b43"/><stop offset="1" stop-color="#c08a5a"/></linearGradient>
    </defs>
    <rect width="${HW}" height="${HH}" fill="url(#hsky)"/>
    <ellipse cx="300" cy="200" rx="260" ry="50" fill="#fff" opacity=".6"/><ellipse cx="1200" cy="140" rx="220" ry="40" fill="#fff" opacity=".55"/>
    ${tree(1450, 380, 150, "#3f7d3a")}${tree(1540, 520, 120, "#356d32")}${tree(160, 640, 90, "#4b8a45")}${tree(60, 700, 110, "#3f7d3a")}
    <rect y="820" width="${HW}" height="280" fill="#7fae5d"/>
    <!-- ground floor -->
    <rect x="330" y="560" width="1050" height="290" fill="#e9e7e2"/>
    ${glass(380, 600, 520, 230, 5)}
    <rect x="920" y="600" width="200" height="230" fill="url(#wood)"/>
    ${glass(1140, 600, 210, 230, 2)}
    <!-- upper floor, cantilevered -->
    <rect x="260" y="250" width="960" height="40" fill="#f5f4f0"/>
    <rect x="300" y="290" width="900" height="250" fill="#f1efe9"/>
    ${glass(560, 320, 600, 200, 5)}
    <rect x="320" y="320" width="220" height="200" fill="url(#wood)"/>
    <rect x="280" y="530" width="1120" height="34" fill="#f5f4f0"/>
    <rect x="560" y="470" width="600" height="56" fill="#cfe7f2" opacity=".55" stroke="#9fb8c4" stroke-width="3"/>
    <!-- side wing -->
    <rect x="1220" y="330" width="200" height="210" fill="#d9d6cf"/><rect x="1240" y="360" width="160" height="150" fill="url(#glow)" opacity=".85"/>
    <!-- interior hints -->
    <rect x="440" y="760" width="160" height="50" rx="12" fill="#f2efe8"/><rect x="660" y="720" width="12" height="90" fill="#555"/><circle cx="666" cy="712" r="22" fill="#fff4d6"/>
    <rect x="640" y="440" width="140" height="60" rx="8" fill="#e8e1d4"/>
    <!-- deck + pool -->
    <rect x="240" y="850" width="1260" height="40" fill="#d8cfc0"/>
    <rect x="380" y="890" width="1120" height="130" fill="url(#pool)"/>
    ${Array.from({ length: 6 }, (_, i) => `<path d="M${420 + i * 180} ${930 + (i % 2) * 30} q40 -14 80 0 t80 0" stroke="#bfe6fb" stroke-width="5" fill="none" opacity=".7"/>`).join("")}
    <rect x="380" y="1020" width="1120" height="16" fill="#d8cfc0"/>
    ${tree(280, 800, 60, "#4b8a45")}
    <rect x="200" y="790" width="40" height="60" rx="6" fill="#6b8f5a"/><rect x="1440" y="800" width="36" height="50" rx="6" fill="#6b8f5a"/>
  </svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
await sharp(Buffer.from(heroSvg())).webp({ quality: 85 }).toFile(path.join(OUT, "hero.webp"));
let n = 1;
for (const [key, list] of Object.entries(SAMPLE_IMAGES)) {
  for (let i = 0; i < list.length; i++) {
    const [scene, pal] = list[i];
    const file = path.join(OUT, `${key}-${i + 1}.webp`);
    await sharp(Buffer.from(scenes[scene](PALETTES[pal])))
      .composite([{ input: watermark() }])
      .webp({ quality: 82 })
      .toFile(file);
    n++;
  }
}
console.log(`wrote ${n} images to public/samples`);
