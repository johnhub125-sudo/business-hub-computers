import { ZodError } from "zod";
import { log } from "./logger";
import { RateLimitError } from "./ratelimit";

/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "UserError";
  }
}
export class UnauthorizedError extends UserError {
  constructor(message = "Please sign in to continue.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
export class ForbiddenError extends UserError {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
export class NotFoundError extends UserError {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string };

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Wraps a server action body: converts known errors to safe messages and logs unexpected ones
 * (with full detail server-side, never sent to the browser).
 */
export async function runAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (err) {
    return toActionError(err);
  }
}

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string } {
  // Next.js redirect()/notFound() throw control-flow errors that must propagate.
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
    const digest = (err as { digest: string }).digest;
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw err;
  }
  if (err instanceof ZodError) {
    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: zodFieldErrors(err), code: "validation" };
  }
  if (err instanceof RateLimitError) return { ok: false, error: err.message, code: "rate_limited" };
  if (err instanceof UnauthorizedError) return { ok: false, error: err.message, code: "unauthorized" };
  if (err instanceof ForbiddenError) return { ok: false, error: err.message, code: "forbidden" };
  if (err instanceof UserError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  log.error("Unhandled action error", { err });
  return { ok: false, error: "Something went wrong. Please try again.", code: "internal" };
}
