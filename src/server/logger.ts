/**
 * Structured JSON logger with secret redaction. Vercel captures stdout/stderr as runtime logs;
 * Sentry (when configured) receives errors via instrumentation.
 */

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|cvv|pin|otp|card|pan|api[_-]?key|signature|backup/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && /^(sk|pk)_(test|live)_/.test(value)) return "[redacted]";
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const entry: Record<string, unknown> = { level, msg, time: new Date().toISOString(), ...((redact(ctx ?? {}) as object) ?? {}) };
  if (ctx?.err instanceof Error) {
    entry.err = { name: ctx.err.name, message: ctx.err.message, stack: ctx.err.stack };
  }
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level !== "debug" || process.env.NODE_ENV !== "production") console.log(line);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};
