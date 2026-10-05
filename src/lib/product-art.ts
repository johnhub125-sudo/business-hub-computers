import { KIND_LABEL, type ProductKind } from "./product-kind";

/**
 * Draws the automatic product picture: a 3D-styled illustration of the device type with the
 * product's brand, name, key specs and condition. Pure function → SVG string (no I/O), so it can be
 * served on demand for any product and always reflects the latest details.
 */
export type ProductArtInput = {
  name: string;
  brand?: string | null;
  kind: ProductKind;
  accent: string;
  condition?: string | null;
  specs?: string[];
  /** Small tiles (product cards): a larger device and no text, because the card prints the details itself. */
  compact?: boolean;
};

const NAVY = "#1B2A7B";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Greedy word wrap into at most `lines` lines of about `width` characters. */
function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.trim().split(/\s+/)) {
    if (!cur) cur = word;
    else if ((cur + " " + word).length <= width) cur += " " + word;
    else {
      out.push(cur);
      cur = word;
      if (out.length === lines) break;
    }
  }
  if (out.length < lines && cur) out.push(cur);
  else if (out.length === lines && cur) out[lines - 1] = clip(`${out[lines - 1]} ${cur}`, width);
  return out.map((l) => clip(l, width + 2));
}

const screen = (x: number, y: number, w: number, h: number, accent: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#screen)"/>
<path d="M${x} ${y + h * 0.7} Q ${x + w * 0.35} ${y + h * 0.3} ${x + w} ${y + h * 0.5} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="${accent}" opacity="0.45"/>
<path d="M${x} ${y + h * 0.86} Q ${x + w * 0.5} ${y + h * 0.5} ${x + w} ${y + h * 0.78} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="#fff" opacity="0.10"/>
<path d="M${x + 8} ${y + 8} L ${x + w * 0.42} ${y + 8} L ${x + w * 0.2} ${y + h - 8} L ${x + 8} ${y + h - 8} Z" fill="#fff" opacity="0.06"/>`;

/** Front-view device drawn in an 800×800 box (roughly y 160–600). Depth is added by the frame. */
function device(kind: ProductKind, accent: string): string {
  switch (kind) {
    case "laptop":
      return `<rect x="170" y="190" width="460" height="300" rx="18" fill="url(#dark)"/>${screen(190, 210, 420, 260, accent)}
<path d="M110 500 H690 L645 566 H155 Z" fill="url(#metal)"/><path d="M150 512 H650 L628 548 H172 Z" fill="#6B7280" opacity="0.55"/><rect x="340" y="551" width="120" height="9" rx="4.5" fill="#4B5563"/>`;
    case "gaming":
      return `<rect x="170" y="190" width="460" height="300" rx="18" fill="#0B0F1A"/>${screen(190, 210, 420, 260, accent)}
<path d="M110 500 H690 L645 566 H155 Z" fill="#1F2937"/><path d="M150 512 H650 L628 548 H172 Z" fill="#111827"/><path d="M176 556 H624" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
<path d="M310 320 l40 -34 l50 34 l50 -34 l40 34" stroke="#fff" stroke-width="9" fill="none" opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "desktop":
      return `<rect x="100" y="200" width="400" height="270" rx="16" fill="url(#dark)"/>${screen(118, 218, 364, 214, accent)}
<rect x="275" y="470" width="50" height="60" fill="#9CA3AF"/><rect x="210" y="528" width="180" height="16" rx="8" fill="#6B7280"/>
<rect x="540" y="170" width="160" height="380" rx="16" fill="url(#dark)"/><circle cx="620" cy="222" r="11" fill="${accent}"/><circle cx="620" cy="222" r="19" fill="none" stroke="${accent}" stroke-width="2" opacity="0.5"/>
<rect x="566" y="264" width="108" height="8" rx="4" fill="#4B5563"/><rect x="566" y="284" width="108" height="8" rx="4" fill="#4B5563"/><rect x="566" y="430" width="108" height="90" rx="8" fill="#0B1220"/>
<path d="M578 446 h84 M578 462 h84 M578 478 h84 M578 494 h84" stroke="#374151" stroke-width="5"/>`;
    case "monitor":
      return `<rect x="120" y="170" width="560" height="350" rx="18" fill="url(#dark)"/>${screen(138, 188, 524, 300, accent)}
<path d="M368 520 H432 L452 588 H348 Z" fill="url(#metal)"/><rect x="280" y="586" width="240" height="18" rx="9" fill="#6B7280"/>`;
    case "printer":
      return `<rect x="250" y="160" width="300" height="100" rx="6" fill="#fff" stroke="#E5E7EB" stroke-width="2"/><rect x="200" y="235" width="400" height="80" rx="14" fill="#D1D5DB"/>
<rect x="150" y="300" width="500" height="210" rx="24" fill="url(#metal)"/><rect x="225" y="476" width="350" height="96" rx="6" fill="#fff" stroke="#E5E7EB" stroke-width="2"/>
<rect x="248" y="498" width="220" height="8" rx="4" fill="#CBD5E1"/><rect x="248" y="518" width="270" height="8" rx="4" fill="#CBD5E1"/><rect x="248" y="538" width="180" height="8" rx="4" fill="#CBD5E1"/>
<circle cx="590" cy="352" r="11" fill="${accent}"/><rect x="195" y="338" width="130" height="36" rx="6" fill="#111827"/><rect x="205" y="348" width="70" height="6" rx="3" fill="${accent}"/>`;
    case "projector":
      return `<rect x="160" y="320" width="500" height="190" rx="40" fill="url(#metal)"/><circle cx="275" cy="415" r="68" fill="url(#dark)"/>
<circle cx="275" cy="415" r="40" fill="${accent}" opacity="0.85"/><circle cx="262" cy="401" r="12" fill="#fff" opacity="0.65"/>
<rect x="390" y="378" width="210" height="12" rx="6" fill="#6B7280"/><rect x="390" y="408" width="210" height="12" rx="6" fill="#6B7280"/><rect x="390" y="438" width="140" height="12" rx="6" fill="#6B7280"/>
<rect x="200" y="505" width="50" height="22" rx="8" fill="#4B5563"/><rect x="570" y="505" width="50" height="22" rx="8" fill="#4B5563"/>`;
    case "power":
    case "ups":
      return `<rect x="290" y="150" width="220" height="60" rx="22" fill="#4B5563"/><rect x="215" y="190" width="370" height="400" rx="38" fill="url(#dark)"/>
<rect x="258" y="244" width="284" height="134" rx="12" fill="#0B1220"/><text x="400" y="332" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="66" font-weight="700" fill="${accent}">${kind === "ups" ? "UPS" : "86%"}</text>
<circle cx="298" cy="452" r="23" fill="#374151"/><circle cx="368" cy="452" r="23" fill="#374151"/><rect x="430" y="432" width="96" height="40" rx="8" fill="#374151"/>
<path d="M400 500 l-22 42 h26 l-13 38 l44 -56 h-28 l15 -24 z" fill="${accent}"/>`;
    case "keyboard":
      return `<rect x="90" y="310" width="620" height="220" rx="26" fill="url(#dark)"/>${Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 13 }, (_, c) => `<rect x="${118 + c * 44}" y="${336 + r * 42}" width="36" height="34" rx="6" fill="${r === 0 && c === 12 ? accent : "#4B5563"}"/>`).join(""),
      ).join("")}<rect x="250" y="504" width="300" height="16" rx="6" fill="#4B5563"/>`;
    case "mouse":
      return `<path d="M400 190 C 525 190 568 300 568 425 C 568 548 492 612 400 612 C 308 612 232 548 232 425 C 232 300 275 190 400 190 Z" fill="url(#dark)"/>
<path d="M400 190 V335" stroke="#6B7280" stroke-width="6"/><rect x="384" y="246" width="32" height="62" rx="16" fill="${accent}"/>
<path d="M270 470 Q 400 540 530 470" stroke="#4B5563" stroke-width="5" fill="none"/>`;
    case "headset":
      return `<path d="M225 440 Q225 205 400 205 Q575 205 575 440" stroke="url(#dark)" stroke-width="36" fill="none" stroke-linecap="round"/>
<rect x="172" y="395" width="116" height="190" rx="42" fill="url(#dark)"/><rect x="512" y="395" width="116" height="190" rx="42" fill="url(#dark)"/>
<rect x="194" y="426" width="72" height="128" rx="30" fill="${accent}" opacity="0.85"/><rect x="534" y="426" width="72" height="128" rx="30" fill="${accent}" opacity="0.85"/>`;
    case "phone":
      return `<rect x="265" y="150" width="270" height="460" rx="38" fill="url(#dark)"/>${screen(281, 172, 238, 416, accent)}
<rect x="365" y="182" width="70" height="14" rx="7" fill="#0B1220"/><rect x="350" y="566" width="100" height="6" rx="3" fill="#fff" opacity="0.6"/>`;
    case "storage":
      return `<rect x="180" y="250" width="440" height="270" rx="28" fill="url(#metal)"/><rect x="210" y="280" width="380" height="150" rx="14" fill="url(#dark)"/>
<text x="400" y="378" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="700" fill="${accent}">SSD</text>
<circle cx="560" cy="476" r="10" fill="${accent}"/><rect x="220" y="466" width="160" height="10" rx="5" fill="#6B7280"/><rect x="220" y="486" width="110" height="10" rx="5" fill="#6B7280"/>`;
    case "network":
      return `<rect x="232" y="170" width="16" height="230" rx="8" fill="#374151"/><rect x="552" y="170" width="16" height="230" rx="8" fill="#374151"/><rect x="392" y="200" width="16" height="200" rx="8" fill="#374151"/>
<rect x="150" y="390" width="500" height="150" rx="30" fill="url(#dark)"/>${Array.from({ length: 5 }, (_, i) => `<circle cx="${220 + i * 44}" cy="465" r="9" fill="${i < 3 ? accent : "#4B5563"}"/>`).join("")}
<rect x="470" y="448" width="130" height="34" rx="8" fill="#0B1220"/><path d="M340 150 q60 -60 120 0 M362 172 q38 -38 76 0" stroke="${accent}" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.8"/>`;
    case "accessory":
    default:
      return `<rect x="230" y="230" width="340" height="300" rx="34" fill="url(#metal)"/><rect x="262" y="262" width="276" height="236" rx="20" fill="url(#dark)"/>
<path d="M400 320 v90 m-45 -45 h90" stroke="${accent}" stroke-width="14" stroke-linecap="round"/><rect x="330" y="446" width="140" height="12" rx="6" fill="#4B5563"/>
<path d="M400 230 C 400 160 470 140 520 176" stroke="#374151" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  }
}

/** Light effects drawn once behind the device (they must not pick up the 3D edge). */
function backdrop(kind: ProductKind, accent: string): string {
  return kind === "projector" ? `<path d="M215 360 L40 190 L40 640 L215 470 Z" fill="${accent}" opacity="0.16"/>` : "";
}

export function renderProductArt(p: ProductArtInput): string {
  const accent = /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : "#3B82F6";
  const nameLines = wrap(p.name, 27, 2);
  const brand = p.brand ? clip(p.brand.toUpperCase(), 24) : "";

  // Spec chips, centred; drop from the end until the row fits.
  let chips = (p.specs ?? []).map((s) => clip(s, 18)).slice(0, 3);
  const chipW = (s: string) => Math.round(s.length * 11.6 + 34);
  while (chips.length && chips.reduce((w, s) => w + chipW(s), 0) + (chips.length - 1) * 12 > 720) chips = chips.slice(0, -1);
  const rowW = chips.reduce((w, s) => w + chipW(s), 0) + Math.max(0, chips.length - 1) * 12;
  let cx = 400 - rowW / 2;
  const nameBottom = 646 + (nameLines.length - 1) * 42;
  const chipY = nameBottom + 22;
  const chipSvg = chips
    .map((s) => {
      const w = chipW(s);
      const out = `<rect x="${cx}" y="${chipY}" width="${w}" height="38" rx="19" fill="#fff" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.5"/><text x="${cx + w / 2}" y="${chipY + 26}" text-anchor="middle" font-size="20" font-weight="600" fill="${NAVY}">${esc(s)}</text>`;
      cx += w + 12;
      return out;
    })
    .join("");

  const condition = p.condition ? clip(p.condition.toUpperCase(), 16) : "";
  const condW = Math.round(condition.length * 12.5 + 36);
  const isNew = /new/i.test(condition);
  const body = device(p.kind, accent);

  // Depth: the same silhouette repeated behind itself, darkened, gives the device a 3D edge.
  const depth = Array.from({ length: 9 }, (_, i) => `<use href="#dev" x="${(9 - i) * 2.2}" y="${(9 - i) * 1.5}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" role="img" aria-label="${esc(p.name)}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.62" stop-color="#F3F5FB"/><stop offset="1" stop-color="#E7EAF6"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="38%" r="46%"><stop offset="0" stop-color="${accent}" stop-opacity="0.30"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
<radialGradient id="floor" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0F172A" stop-opacity="0.34"/><stop offset="1" stop-color="#0F172A" stop-opacity="0"/></radialGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3F4F6"/><stop offset="1" stop-color="#9CA3AF"/></linearGradient>
<linearGradient id="dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#475569"/><stop offset="0.5" stop-color="#1F2937"/><stop offset="1" stop-color="#0B1220"/></linearGradient>
<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E3A8A"/><stop offset="0.55" stop-color="${NAVY}"/><stop offset="1" stop-color="#0F172A"/></linearGradient>
<filter id="edge"><feColorMatrix type="matrix" values="0.42 0 0 0 0  0 0.42 0 0 0  0 0 0.46 0 0  0 0 0 1 0"/></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0f172a" flood-opacity="0.22"/></filter>
<g id="dev">${body}</g>
</defs>
<rect width="800" height="800" rx="44" fill="url(#bg)"/>
<rect width="800" height="800" rx="44" fill="url(#glow)"/>
<circle cx="668" cy="118" r="92" fill="${accent}" opacity="0.07"/><circle cx="118" cy="468" r="62" fill="${NAVY}" opacity="0.05"/>
<ellipse cx="410" cy="${p.compact ? 650 : 536}" rx="${p.compact ? 330 : 290}" ry="${p.compact ? 40 : 34}" fill="url(#floor)"/>
<g transform="${p.compact ? "translate(0 22) scale(1)" : "translate(92 -4) scale(0.77)"} translate(400 385) rotate(-3) skewX(-5) translate(-400 -385)">
${backdrop(p.kind, accent)}
<g filter="url(#edge)">${depth}</g>
<g filter="url(#soft)"><use href="#dev"/></g>
</g>
${p.compact ? "" : `${condition ? `<rect x="36" y="36" width="${condW}" height="40" rx="20" fill="${isNew ? NAVY : "#D62828"}"/><text x="${36 + condW / 2}" y="63" text-anchor="middle" font-size="19" font-weight="700" fill="#fff" letter-spacing="1">${esc(condition)}</text>` : ""}
<text x="764" y="62" text-anchor="end" font-size="18" font-weight="600" fill="${NAVY}" opacity="0.45" letter-spacing="1.5">${esc(KIND_LABEL[p.kind].toUpperCase())}</text>
${brand ? `<text x="400" y="602" text-anchor="middle" font-size="21" font-weight="700" fill="${accent}" letter-spacing="3">${esc(brand)}</text>` : ""}
${nameLines.map((l, i) => `<text x="400" y="${646 + i * 42}" text-anchor="middle" font-size="35" font-weight="800" fill="${NAVY}">${esc(l)}</text>`).join("")}
${chipSvg}`}
</svg>`;
}
