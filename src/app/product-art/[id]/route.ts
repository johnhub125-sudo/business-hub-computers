import { renderProductArt } from "@/lib/product-art";
import { readArtSegment } from "@/server/product-art-url";

/**
 * The automatic product picture: a 3D-styled illustration with the product's brand, name, key
 * specs and condition, used until a real photo is uploaded. A few KB of SVG, drawn without touching
 * the database (the signed address carries the details — see src/server/product-art-url.ts) and
 * cached permanently by browsers and the CDN.
 */
export async function GET(_req: Request, ctx: RouteContext<"/product-art/[id]">) {
  const art = readArtSegment((await ctx.params).id);
  if (!art) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const svg = renderProductArt({ name: art.n, brand: art.b, kind: art.k, accent: art.a, condition: art.c, specs: art.s, compact: art.m === 1 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
