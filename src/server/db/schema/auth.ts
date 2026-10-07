import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name?: string) => (name ? timestamp(name, { withTimezone: true }) : timestamp({ withTimezone: true }));

export const userTypeEnum = pgEnum("user_type", ["customer", "staff"]);
export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "pending",
  "rejected",
  "inactive",
  "suspended",
  "deleted",
]);

/* ------------------------------------------------------------------ */
/* Better Auth core tables (field names must match Better Auth models) */
/* ------------------------------------------------------------------ */

export const user = pgTable(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    twoFactorEnabled: boolean().default(false),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
    // application fields (not managed by Better Auth)
    userType: userTypeEnum().notNull().default("customer"),
    status: accountStatusEnum().notNull().default("active"),
    phone: text(),
    mustChangePassword: boolean().notNull().default(false),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: ts(),
    lastLoginAt: ts(),
    deletedAt: ts(),
  },
  (t) => [index("user_type_status_idx").on(t.userType, t.status)],
);

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: ts().notNull(),
    token: text().notNull().unique(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

/** Better Auth verification tokens: email verification + password reset (short-lived, one-time). */
export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts().notNull(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text().primaryKey(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean().default(true),
    failedVerificationCount: integer().default(0),
    lockedUntil: ts(),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

/** Better Auth database-backed rate limiter. */
export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* RBAC                                                                */
/* ------------------------------------------------------------------ */

export const roles = pgTable("roles", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  isSystem: boolean().notNull().default(false),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull().unique(),
  module: text().notNull(),
  description: text().notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid()
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export const customerProfiles = pgTable("customer_profiles", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  surname: text().notNull(),
  firstName: text().notNull(),
  middleName: text(),
  phone: text().notNull(),
  whatsapp: text(),
  address: text().notNull(),
  state: text().notNull(),
  city: text().notNull(),
  phoneVerifiedAt: ts(),
  marketingOptIn: boolean().notNull().default(false),
  termsAcceptedAt: ts().notNull(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

/**
 * Staff and administrators share one profile table. "Admin" vs "staff" is a matter of
 * assigned roles/permissions, which keeps authorization in one place.
 */
export const staffApprovalEnum = pgEnum("staff_approval", ["pending", "approved", "rejected"]);

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    surname: text().notNull(),
    firstName: text().notNull(),
    phone: text().notNull(),
    department: text(),
    position: text(),
    requestedRole: text(),
    approval: staffApprovalEnum().notNull().default("pending"),
    reviewedBy: text().references(() => user.id, { onDelete: "set null" }),
    reviewedAt: ts(),
    reviewNote: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("staff_approval_idx").on(t.approval)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text().notNull().default("Home"),
    fullName: text().notNull(),
    phone: text().notNull(),
    line1: text().notNull(),
    landmark: text(),
    city: text().notNull(),
    state: text().notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("addresses_user_idx").on(t.userId),
    uniqueIndex("addresses_one_default_idx")
      .on(t.userId)
      .where(sql`${t.isDefault} = true`),
  ],
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    email: text(),
    type: text().notNull(),
    severity: text().notNull().default("info"),
    ip: text(),
    userAgent: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("security_events_user_idx").on(t.userId), index("security_events_created_idx").on(t.createdAt)],
);

/** WebAuthn credentials ("quick sign-in"): fingerprint / face / device PIN. Managed by the Better Auth passkey plugin. */
export const passkey = pgTable(
  "passkey",
  {
    id: text().primaryKey(),
    name: text(),
    publicKey: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    createdAt: timestamp({ withTimezone: true }),
    aaguid: text(),
  },
  (t) => [index("passkey_user_idx").on(t.userId), index("passkey_credential_idx").on(t.credentialID)],
);
