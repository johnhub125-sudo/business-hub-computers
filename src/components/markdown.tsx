import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal, XSS-safe Markdown renderer for CMS pages (headings, paragraphs, lists, **bold**,
 * numbered steps, [links](/path)). Produces React elements — never injects raw HTML.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${key}-b${i++}`}>{tok.slice(2, -2)}</strong>);
    else {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      const safe = /^(\/|https?:\/\/|mailto:|tel:)/.test(href) ? href : "#";
      out.push(
        safe.startsWith("/") ? (
          <Link key={`${key}-l${i++}`} href={safe}>
            {label}
          </Link>
        ) : (
          <a key={`${key}-l${i++}`} href={safe} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, skipTitle }: { source: string; skipTitle?: boolean }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const nodes: ReactNode[] = [];
  blocks.forEach((raw, bi) => {
    const lines = raw.split("\n").filter((l) => l.trim());
    if (!lines.length) return;
    let buffer: string[] = [];
    const flushPara = () => {
      if (buffer.length) nodes.push(<p key={`p${bi}-${nodes.length}`}>{inline(buffer.join(" "), `p${bi}${nodes.length}`)}</p>);
      buffer = [];
    };
    let list: string[] = [];
    let ordered = false;
    const flushList = () => {
      if (list.length) {
        const Tag = ordered ? "ol" : "ul";
        nodes.push(
          <Tag key={`u${bi}-${nodes.length}`}>
            {list.map((li, k) => (
              <li key={k}>{inline(li, `li${bi}${k}`)}</li>
            ))}
          </Tag>,
        );
      }
      list = [];
    };
    for (const line of lines) {
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const li = bullet ?? numbered;
      if (h) {
        flushPara();
        flushList();
        if (h[1].length === 1 && skipTitle) continue;
        const Tag = (`h${h[1].length}` as "h1" | "h2" | "h3");
        nodes.push(<Tag key={`h${bi}-${nodes.length}`}>{h[2]}</Tag>);
      } else if (li) {
        flushPara();
        if (list.length && ordered !== Boolean(numbered)) flushList();
        ordered = Boolean(numbered);
        list.push(li[1]);
      } else {
        flushList();
        buffer.push(line.trim());
      }
    }
    flushPara();
    flushList();
  });
  return <div className="prose-content">{nodes}</div>;
}
