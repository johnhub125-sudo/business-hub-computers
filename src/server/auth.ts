import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
import { resolveSiteUrl } from "@/lib/site-url";
import { passwordIssues } from "@/lib/validation/auth";
import { securityEvent } from "./audit";
import { db } from "./db";
import * as schema from "./db/schema";
import { sendTemplateNow } from "./email";
import { appUrl } from "./env";
import { consume } from "./ratelimit";
import { getSetting, SETTINGS_DEFAULTS } from "./settings";

const BLOCKED_STATUSES = new Set(["suspended", "deleted", "inactive", "rejected"]);

/** Header proving a sign-up came from our own registration server action (which also creates the profile). */
export function internalSignupHeaders() {
  return new Headers({ "x-bhc-internal": internalToken() });
}
function internalToken() {
  return createHash("sha256").update(`signup:${process.env.BETTER_AUTH_SECRET ?? ""}`).digest("hex");
}
function isInternal(headers: Headers | undefined | null) {
  const got = headers?.get("x-bhc-internal");
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(internalToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertStrongPassword(pw: unknown) {
  if (typeof pw !== "string") return;
  const issues = passwordIssues(pw);
  if (issues.length) {
    throw new APIError("BAD_REQUEST", { message: `Password needs: ${issues.join(", ").toLowerCase()}` });
  }
}

const security = SETTINGS_DEFAULTS.security;

export const auth = betterAuth({
  appName: "Business Hub Computers",
  baseURL: resolveSiteUrl(process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_APP_URL),
  secret: process.env.BETTER_AUTH_SECRET || undefined,
  trustedOrigins: [
    ...new Set(
      [appUrl(), resolveSiteUrl(), process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
        .filter((u): u is string => Boolean(u && u.trim()))
        .map((u) => (u.startsWith("http") ? u : `https://${u}`)),
    ),
  ],
  database: drizzleAdapter(db, { provider: "pg", schema: { ...schema, twoFactor: schema.twoFactor } }),
  // UUID ids everywhere (consistent with the rest of the schema).
  advanced: { database: { generateId: () => randomUUID() } },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendTemplateNow("passwordReset", user.email, { name: user.name, url });
    },
    onPasswordReset: async ({ user }) => {
      await db.update(schema.user).set({ failedLoginCount: 0, lockedUntil: null, mustChangePassword: false }).where(eq(schema.user.id, user.id));
      await securityEvent({ type: "password_reset", userId: user.id, email: user.email, severity: "warning" });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendTemplateNow("verifyEmail", user.email, { name: user.name, url });
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * security.sessionDays,
    updateAge: 60 * 60 * 24,
    // no cookie cache: every request validates the session row, so revocation is immediate
  },

  rateLimit: {
    enabled: process.env.NODE_ENV === "production" || process.env.RATE_LIMIT_IN_DEV === "1",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
      "/sign-up/email": { window: 60 * 60, max: 5 },
      "/request-password-reset": { window: 60 * 60, max: 5 },
      "/reset-password": { window: 60 * 60, max: 10 },
      "/send-verification-email": { window: 60 * 60, max: 5 },
      "/two-factor/*": { window: 10 * 60, max: 10 },
    },
    customStorage: { consume: (key, rule) => consume(`auth:${key}`, rule) },
  },

  user: {
    deleteUser: { enabled: false }, // account deletion goes through our privacy workflow (financial records retention)
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [u] = await db.select({ status: schema.user.status }).from(schema.user).where(eq(schema.user.id, session.userId));
          if (!u || BLOCKED_STATUSES.has(u.status)) {
            throw new APIError("FORBIDDEN", { message: "This account is not active. Please contact support." });
          }
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        // Registration must go through /register (which validates all fields and creates the profile).
        if (!isInternal(ctx.headers)) throw new APIError("FORBIDDEN", { message: "Please register using the registration form." });
        assertStrongPassword(ctx.body?.password);
      }
      if (ctx.path === "/reset-password" || ctx.path === "/change-password") {
        assertStrongPassword(ctx.body?.newPassword);
      }
      if (ctx.path === "/sign-in/email") {
        const email = String(ctx.body?.email ?? "").toLowerCase();
        const [u] = await db
          .select({ id: schema.user.id, lockedUntil: schema.user.lockedUntil, status: schema.user.status })
          .from(schema.user)
          .where(eq(schema.user.email, email));
        if (u?.lockedUntil && u.lockedUntil > new Date()) {
          const mins = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000);
          throw new APIError("FORBIDDEN", { message: `Too many failed attempts. Try again in ${mins} minute(s) or reset your password.` });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = String(ctx.body?.email ?? "").toLowerCase();
      const failed = isAPIError(ctx.context.returned);
      const [u] = await db
        .select({ id: schema.user.id, name: schema.user.name, failedLoginCount: schema.user.failedLoginCount })
        .from(schema.user)
        .where(eq(schema.user.email, email));
      if (!u) {
        if (failed) await securityEvent({ type: "login_failed_unknown_email", email, severity: "info" });
        return;
      }
      if (failed) {
        const [row] = await db
          .update(schema.user)
          .set({ failedLoginCount: sql`${schema.user.failedLoginCount} + 1` })
          .where(eq(schema.user.id, u.id))
          .returning({ count: schema.user.failedLoginCount });
        await securityEvent({ type: "login_failed", userId: u.id, email, severity: "warning", meta: { attempts: row.count } });
        const live = await getSetting("security").catch(() => security);
        if (row.count >= live.maxFailedLogins) {
          const lockedUntil = new Date(Date.now() + live.lockMinutes * 60_000);
          await db.update(schema.user).set({ lockedUntil, failedLoginCount: 0 }).where(eq(schema.user.id, u.id));
          await securityEvent({ type: "account_locked", userId: u.id, email, severity: "critical" });
          await sendTemplateNow("securityAlert", email, {
            name: u.name,
            event: "Your account was temporarily locked after several failed sign-in attempts",
            when: new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" }),
          });
        }
      } else if (ctx.context.newSession) {
        await db
          .update(schema.user)
          .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
          .where(eq(schema.user.id, u.id));
        await securityEvent({ type: "login", userId: u.id, email });
      }
    }),
  },

  plugins: [twoFactor({ issuer: "Business Hub Computers" }), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
