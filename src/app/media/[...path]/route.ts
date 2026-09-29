import { readPublicMedia } from "@/server/storage";

/**
 * Serves PUBLIC media (product, team, brand images) when the Blob store is private.
 * Pathnames carry a random suffix and never change, so responses are cached by the CDN for a year.
 * Private files (payment proofs, attachments) are refused here and only served by /api/files.
 */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...path]">) {
  const { path } = await ctx.params;
  const file = await readPublicMedia(path.join("/"));
  if (!file) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
