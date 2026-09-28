/**
 * Generates placeholder product and banner illustrations (SVG) into public/images.
 * They keep the demo store looking polished until real photos are uploaded in Admin → Products.
 *
 *   npx tsx scripts/generate-art.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve("public/images/catalog");
const banners = path.resolve("public/images/banners");
mkdirSync(out, { recursive: true });
mkdirSync(banners, { recursive: true });

const NAVY = "#1B2A7B";
const RED = "#D62828";

type Kind = "laptop" | "desktop" | "gaming" | "monitor" | "printer" | "projector" | "power" | "accessory" | "keyboard" | "headset" | "ups";

const bgs = [
  ["#EEF2FF", "#E0E7FF"],
  ["#F1F5F9", "#E2E8F0"],
  ["#FEF2F2", "#FDE8E8"],
  ["#ECFEFF", "#E0F2FE"],
  ["#F5F3FF", "#EDE9FE"],
  ["#F0FDF4", "#DCFCE7"],
];

function frame(inner: string, bg: string[], label?: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E5E7EB"/><stop offset="1" stop-color="#9CA3AF"/></linearGradient>
<linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#374151"/><stop offset="1" stop-color="#111827"/></linearGradient>
<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E3A8A"/><stop offset="0.55" stop-color="${NAVY}"/><stop offset="1" stop-color="#0F172A"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.18"/></filter>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
<circle cx="650" cy="140" r="120" fill="#fff" opacity="0.45"/>
<circle cx="120" cy="690" r="90" fill="#fff" opacity="0.35"/>
<g filter="url(#sh)">${inner}</g>
${label ? `<text x="400" y="752" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="600" fill="${NAVY}" opacity="0.55">${label}</text>` : ""}
</svg>`;
}

const screenGlow = (x: number, y: number, w: number, h: number, accent: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#screen)"/>
   <path d="M${x} ${y + h * 0.7} Q ${x + w * 0.35} ${y + h * 0.35} ${x + w} ${y + h * 0.55} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="${accent}" opacity="0.35"/>
   <path d="M${x} ${y + h * 0.85} Q ${x + w * 0.5} ${y + h * 0.5} ${x + w} ${y + h * 0.8} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="#fff" opacity="0.08"/>`;

function device(kind: Kind, accent: string): string {
  switch (kind) {
    case "laptop":
      return `<rect x="170" y="190" width="460" height="300" rx="18" fill="url(#dark)"/>${screenGlow(190, 210, 420, 260, accent)}
        <path d="M120 500 H680 L640 560 H160 Z" fill="url(#metal)"/><rect x="340" y="505" width="120" height="10" rx="5" fill="#6B7280"/>`;
    case "gaming":
      return `<rect x="170" y="190" width="460" height="300" rx="18" fill="#0B0F1A"/>${screenGlow(190, 210, 420, 260, RED)}
        <path d="M120 500 H680 L640 560 H160 Z" fill="#1F2937"/><path d="M180 540 H620" stroke="${RED}" stroke-width="6" stroke-linecap="round"/>
        <path d="M300 300 l40 -30 l40 30 l40 -30 l40 30" stroke="#fff" stroke-width="8" fill="none" opacity="0.8"/>`;
    case "desktop":
      return `<rect x="110" y="200" width="400" height="270" rx="16" fill="url(#dark)"/>${screenGlow(128, 218, 364, 214, accent)}
        <rect x="285" y="470" width="50" height="60" fill="#9CA3AF"/><rect x="220" y="528" width="180" height="16" rx="8" fill="#6B7280"/>
        <rect x="540" y="180" width="150" height="360" rx="16" fill="url(#dark)"/><circle cx="615" cy="230" r="10" fill="${accent}"/>
        <rect x="565" y="270" width="100" height="8" rx="4" fill="#4B5563"/><rect x="565" y="290" width="100" height="8" rx="4" fill="#4B5563"/>`;
    case "monitor":
      return `<rect x="130" y="170" width="540" height="340" rx="18" fill="url(#dark)"/>${screenGlow(148, 188, 504, 290, accent)}
        <path d="M370 510 H430 L450 580 H350 Z" fill="#9CA3AF"/><rect x="290" y="578" width="220" height="18" rx="9" fill="#6B7280"/>`;
    case "printer":
      return `<rect x="200" y="230" width="400" height="80" rx="14" fill="#E5E7EB"/><rect x="250" y="170" width="300" height="80" rx="6" fill="#fff"/>
        <rect x="160" y="300" width="480" height="200" rx="22" fill="url(#metal)"/><rect x="230" y="470" width="340" height="90" rx="6" fill="#fff"/>
        <rect x="250" y="490" width="220" height="8" rx="4" fill="#CBD5E1"/><rect x="250" y="510" width="260" height="8" rx="4" fill="#CBD5E1"/>
        <circle cx="580" cy="350" r="10" fill="${accent}"/><rect x="200" y="340" width="120" height="30" rx="6" fill="#374151"/>`;
    case "projector":
      return `<rect x="160" y="330" width="480" height="170" rx="36" fill="url(#metal)"/><circle cx="270" cy="415" r="62" fill="url(#dark)"/>
        <circle cx="270" cy="415" r="36" fill="${accent}" opacity="0.8"/><circle cx="258" cy="402" r="10" fill="#fff" opacity="0.6"/>
        <rect x="380" y="380" width="200" height="12" rx="6" fill="#6B7280"/><rect x="380" y="410" width="200" height="12" rx="6" fill="#6B7280"/>
        <path d="M210 360 L60 200 L60 630 L210 470 Z" fill="${accent}" opacity="0.12"/>`;
    case "power":
    case "ups":
      return `<rect x="220" y="200" width="360" height="380" rx="36" fill="url(#dark)"/><rect x="290" y="165" width="220" height="50" rx="20" fill="#4B5563"/>
        <rect x="260" y="250" width="280" height="130" rx="12" fill="#0B1220"/><text x="400" y="335" text-anchor="middle" font-family="Segoe UI, Arial" font-size="64" font-weight="700" fill="${accent}">${kind === "ups" ? "UPS" : "86%"}</text>
        <circle cx="300" cy="450" r="22" fill="#374151"/><circle cx="370" cy="450" r="22" fill="#374151"/><rect x="430" y="432" width="90" height="36" rx="8" fill="#374151"/>
        <path d="M400 500 l-20 40 h24 l-12 36 l40 -52 h-26 l14 -24 z" fill="${accent}"/>`;
    case "keyboard":
      return `<rect x="110" y="330" width="580" height="200" rx="24" fill="url(#dark)"/>${Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 12 }, (_, c) => `<rect x="${140 + c * 44}" y="${355 + r * 42}" width="36" height="34" rx="6" fill="#4B5563"/>`).join(""),
      ).join("")}<rect x="250" y="485" width="300" height="30" rx="6" fill="#4B5563"/><rect x="600" y="355" width="36" height="34" rx="6" fill="${accent}"/>`;
    case "headset":
      return `<path d="M230 440 Q230 220 400 220 Q570 220 570 440" stroke="url(#dark)" stroke-width="34" fill="none"/>
        <rect x="180" y="400" width="110" height="180" rx="40" fill="url(#dark)"/><rect x="510" y="400" width="110" height="180" rx="40" fill="url(#dark)"/>
        <rect x="200" y="430" width="70" height="120" rx="28" fill="${accent}" opacity="0.8"/><rect x="530" y="430" width="70" height="120" rx="28" fill="${accent}" opacity="0.8"/>`;
    case "accessory":
    default:
      return `<path d="M400 200 C 520 200 560 300 560 420 C 560 540 490 600 400 600 C 310 600 240 540 240 420 C 240 300 280 200 400 200 Z" fill="url(#dark)"/>
        <path d="M400 200 V330" stroke="#6B7280" stroke-width="6"/><rect x="386" y="250" width="28" height="56" rx="14" fill="${accent}"/>
        <path d="M400 200 C 400 140 460 120 500 150" stroke="#374151" stroke-width="10" fill="none"/>`;
  }
}

const accents = ["#3B82F6", "#D62828", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4"];
const kinds: Kind[] = ["laptop", "desktop", "gaming", "monitor", "printer", "projector", "power", "accessory", "keyboard", "headset", "ups"];

let count = 0;
for (const kind of kinds) {
  for (let i = 0; i < 3; i++) {
    const svg = frame(device(kind, accents[(i + kinds.indexOf(kind)) % accents.length]), bgs[(i + kinds.indexOf(kind)) % bgs.length]);
    writeFileSync(path.join(out, `${kind}-${i + 1}.svg`), svg);
    count++;
  }
}

function banner(file: string, title: string, subtitle: string, kind: Kind, from: string, to: string, accent: string, w = 1600, h = 640) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E5E7EB"/><stop offset="1" stop-color="#9CA3AF"/></linearGradient>
<linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#374151"/><stop offset="1" stop-color="#111827"/></linearGradient>
<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E3A8A"/><stop offset="0.55" stop-color="${NAVY}"/><stop offset="1" stop-color="#0F172A"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#000" flood-opacity="0.35"/></filter></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${w - 260}" cy="${h / 2}" r="${h * 0.62}" fill="#fff" opacity="0.07"/>
<circle cx="${w - 200}" cy="${h / 2}" r="${h * 0.42}" fill="#fff" opacity="0.06"/>
<path d="M0 ${h - 40} L${w} ${h - 120} L${w} ${h} L0 ${h} Z" fill="${accent}" opacity="0.18"/>
<g transform="translate(${w - 820} ${(h - 800 * 0.78) / 2}) scale(0.78)" filter="url(#sh)">${device(kind, accent)}</g>
</svg>`;
  writeFileSync(path.join(banners, file), svg);
  count++;
  void title;
  void subtitle;
}

banner("hero-laptops.svg", "", "", "laptop", NAVY, "#0B1446", "#3B82F6");
banner("hero-uk-used.svg", "", "", "desktop", "#7F1D1D", RED, "#FCA5A5");
banner("hero-gaming.svg", "", "", "gaming", "#0B0F1A", "#1E1B4B", RED);
banner("hero-power.svg", "", "", "power", "#064E3B", "#065F46", "#34D399");
banner("hero-setup.svg", "", "", "monitor", "#1E293B", NAVY, "#F59E0B");

console.log(`✓ generated ${count} illustrations`);
