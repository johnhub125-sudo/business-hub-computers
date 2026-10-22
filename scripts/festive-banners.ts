/**
 * Draws the seasonal carousel backgrounds (Black Friday, Christmas, New Year) into public/images/banners.
 * The words on a slide come from Admin → Carousel; these are only the backgrounds, with the artwork on
 * the right so the text on the left stays readable.
 *
 *   npx tsx scripts/festive-banners.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const W = 1600;
const H = 640;
const dir = path.resolve("public/images/banners");

// Deterministic "random" so the files never change between runs.
let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

const svg = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${body}</svg>`;

/* ── Black Friday: black and gold, sale tags ── */
function blackFriday() {
  const sparkles = Array.from({ length: 40 }, () => {
    const x = 700 + rnd() * 880;
    const y = 20 + rnd() * 600;
    const r = 1 + rnd() * 2.6;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#FDE68A" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
  }).join("");
  const tag = (x: number, y: number, rot: number, text: string, sub: string, fill: string) => `
    <g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#sh)">
      <path d="M0 0 H230 L290 70 L230 140 H0 Z" fill="${fill}"/>
      <circle cx="236" cy="70" r="12" fill="#0A0A0A"/>
      <text x="22" y="78" font-family="Arial Black, Arial, sans-serif" font-size="58" font-weight="900" fill="#0A0A0A">${text}</text>
      <text x="24" y="118" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0A0A0A" letter-spacing="4">${sub}</text>
    </g>`;
  return svg(
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050505"/><stop offset="0.6" stop-color="#141414"/><stop offset="1" stop-color="#2A1A00"/></linearGradient>
     <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FDE68A"/><stop offset="0.5" stop-color="#F59E0B"/><stop offset="1" stop-color="#B45309"/></linearGradient>
     <radialGradient id="glow" cx="0.75" cy="0.45" r="0.55"><stop offset="0" stop-color="#F59E0B" stop-opacity="0.35"/><stop offset="1" stop-color="#F59E0B" stop-opacity="0"/></radialGradient>
     <filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#000" flood-opacity="0.55"/></filter>`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <rect width="${W}" height="${H}" fill="url(#glow)"/>
     <text x="${W - 40}" y="300" text-anchor="end" font-family="Arial Black, Arial, sans-serif" font-size="210" font-weight="900" fill="none" stroke="#F59E0B" stroke-opacity="0.22" stroke-width="3">BLACK</text>
     <text x="${W - 40}" y="500" text-anchor="end" font-family="Arial Black, Arial, sans-serif" font-size="210" font-weight="900" fill="none" stroke="#F59E0B" stroke-opacity="0.22" stroke-width="3">FRIDAY</text>
     ${sparkles}
     ${tag(980, 150, -12, "-30%", "MEGA DEALS", "url(#gold)")}
     ${tag(1180, 330, 8, "-50%", "LIMITED", "#EF4444")}
     ${tag(900, 420, -4, "SALE", "ALL WEEK", "#FAFAFA")}
     <rect x="0" y="${H - 10}" width="${W}" height="10" fill="url(#gold)"/>`,
  );
}

/* ── Christmas: deep red and green, a tree, ornaments and snow ── */
function christmas() {
  const snow = Array.from({ length: 90 }, () => {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 1.2 + rnd() * 3.2;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#fff" opacity="${(0.3 + rnd() * 0.6).toFixed(2)}"/>`;
  }).join("");
  const baubles = [
    [1250, 300, "#FBBF24"], [1170, 390, "#EF4444"], [1330, 400, "#60A5FA"], [1210, 470, "#FBBF24"], [1300, 495, "#EF4444"], [1250, 225, "#EF4444"],
  ].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="15" fill="${c}"/><circle cx="${Number(x) - 5}" cy="${Number(y) - 5}" r="4" fill="#fff" opacity="0.7"/>`).join("");
  const gift = (x: number, w: number, h: number, c: string, ribbon: string) => `
    <g filter="url(#sh)"><rect x="${x}" y="${600 - h}" width="${w}" height="${h}" rx="6" fill="${c}"/>
    <rect x="${x + w / 2 - 8}" y="${600 - h}" width="16" height="${h}" fill="${ribbon}"/>
    <rect x="${x}" y="${600 - h + h / 2 - 8}" width="${w}" height="16" fill="${ribbon}"/>
    <path d="M${x + w / 2} ${600 - h} c-30 -40 -60 -10 0 0 c30 -40 60 -10 0 0" fill="none" stroke="${ribbon}" stroke-width="8"/></g>`;
  return svg(
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7F1D1D"/><stop offset="0.55" stop-color="#991B1B"/><stop offset="1" stop-color="#14532D"/></linearGradient>
     <linearGradient id="tree" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22C55E"/><stop offset="1" stop-color="#14532D"/></linearGradient>
     <filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity="0.4"/></filter>`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <circle cx="1250" cy="330" r="300" fill="#fff" opacity="0.06"/>
     ${snow}
     <g filter="url(#sh)">
       <path d="M1250 120 L1390 330 H1320 L1430 470 H1340 L1460 590 H1040 L1160 470 H1070 L1180 330 H1110 Z" fill="url(#tree)"/>
       <rect x="1228" y="590" width="44" height="40" fill="#78350F"/>
     </g>
     <path d="M1250 92 l10 26 h28 l-22 16 8 27 -24 -16 -24 16 8 -27 -22 -16 h28 z" fill="#FDE047"/>
     <path d="M1160 360 Q1250 400 1340 350 M1120 440 Q1250 490 1380 430 M1090 530 Q1250 575 1410 520" stroke="#FDE047" stroke-width="4" fill="none" opacity="0.8"/>
     ${baubles}
     ${gift(930, 110, 90, "#2563EB", "#FDE047")}
     ${gift(1470, 100, 110, "#FBBF24", "#DC2626")}
     <path d="M0 ${H - 40} Q400 ${H - 90} 800 ${H - 50} T1600 ${H - 60} V${H} H0 Z" fill="#fff" opacity="0.92"/>`,
  );
}

/* ── New Year: midnight blue, fireworks, confetti ── */
function newYear() {
  const burst = (cx: number, cy: number, r: number, c: string) =>
    Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2;
      const x2 = cx + Math.cos(a) * r;
      const y2 = cy + Math.sin(a) * r;
      const x1 = cx + Math.cos(a) * r * 0.35;
      const y1 = cy + Math.sin(a) * r * 0.35;
      return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${c}" stroke-width="4" stroke-linecap="round"/><circle cx="${x2.toFixed(0)}" cy="${y2.toFixed(0)}" r="5" fill="${c}"/>`;
    }).join("");
  const confetti = Array.from({ length: 70 }, () => {
    const x = 650 + rnd() * 950;
    const y = rnd() * H;
    const c = ["#FDE047", "#F472B6", "#60A5FA", "#34D399", "#F59E0B"][Math.floor(rnd() * 5)];
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="10" height="5" rx="2" fill="${c}" transform="rotate(${(rnd() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" opacity="0.85"/>`;
  }).join("");
  return svg(
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1446"/><stop offset="0.6" stop-color="#1E1B4B"/><stop offset="1" stop-color="#4C1D95"/></linearGradient>
     <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FEF3C7"/><stop offset="0.5" stop-color="#FBBF24"/><stop offset="1" stop-color="#B45309"/></linearGradient>
     <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
     <filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000" flood-opacity="0.45"/></filter>`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <g filter="url(#glow)" opacity="0.95">${burst(1030, 150, 95, "#F472B6")}${burst(1430, 130, 120, "#FDE047")}${burst(1260, 250, 70, "#60A5FA")}${burst(1500, 330, 60, "#34D399")}</g>
     ${confetti}
     <text x="1240" y="520" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="230" font-weight="900" fill="url(#gold)" filter="url(#sh)">2027</text>
     <path d="M0 ${H - 26} H${W}" stroke="url(#gold)" stroke-width="6"/>`,
  );
}

for (const [file, draw] of [["festive-black-friday.svg", blackFriday], ["festive-christmas.svg", christmas], ["festive-new-year.svg", newYear]] as const) {
  writeFileSync(path.join(dir, file), draw());
  console.log("✓", file);
}
