import type { Instrumentation } from "next";

/**
 * Server error monitoring. Every uncaught server error is logged as structured JSON (visible in
 * Vercel → Logs / Observability) with a correlation id. Query strings and headers are never logged,
 * so tokens and personal data stay out of the logs.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  const headers = request.headers as Record<string, string | string[] | undefined>;
  const pick = (k: string) => {
    const v = headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  console.error(
    JSON.stringify({
      level: "error",
      msg: "Unhandled server error",
      time: new Date().toISOString(),
      error: { name: e?.name, message: e?.message?.slice(0, 500), digest: e?.digest, stack: e?.stack?.split("\n").slice(0, 8).join("\n") },
      method: request.method,
      path: request.path.split("?")[0],
      requestId: pick("x-request-id") ?? pick("x-vercel-id"),
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    }),
  );
};
