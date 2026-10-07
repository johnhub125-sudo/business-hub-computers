import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { orders } from "./commerce";

const ts = () => timestamp({ withTimezone: true });

export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "assigned",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "completed",
  "overdue",
]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    description: text(),
    assignedTo: text().references(() => user.id, { onDelete: "set null" }),
    role: text(),
    department: text(),
    priority: priorityEnum().notNull().default("medium"),
    status: taskStatusEnum().notNull().default("pending"),
    startDate: ts(),
    deadline: ts(),
    attachmentUrl: text(),
    completion: integer().notNull().default(0),
    approvedBy: text().references(() => user.id, { onDelete: "set null" }),
    approvedAt: ts(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assignedTo),
    index("tasks_status_idx").on(t.status),
    check("tasks_completion_range", sql`${t.completion} BETWEEN 0 AND 100`),
  ],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    body: text().notNull(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId)],
);

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "assigned",
  "in_progress",
  "waiting_for_customer",
  "resolved",
  "closed",
]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketNumber: text().notNull().unique(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    subject: text().notNull(),
    message: text().notNull(),
    priority: priorityEnum().notNull().default("medium"),
    status: ticketStatusEnum().notNull().default("open"),
    assignedTo: text().references(() => user.id, { onDelete: "set null" }),
    resolution: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
    closedAt: ts(),
  },
  (t) => [index("tickets_user_idx").on(t.userId), index("tickets_status_idx").on(t.status)],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: text().references(() => user.id, { onDelete: "set null" }),
    isStaff: boolean().notNull().default(false),
    body: text().notNull(),
    attachmentPathname: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId)],
);

/** Messages from the public contact form. */
export const customerMessages = pgTable("customer_messages", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull(),
  phone: text(),
  subject: text().notNull(),
  message: text().notNull(),
  status: text().notNull().default("new"), // new | read | replied | archived
  handledBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: ts().notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Notifications & outbox                                              */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    link: text(),
    readAt: ts(),
    archivedAt: ts(),
    dedupeKey: text().unique(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/**
 * Transactional outbox. Business transactions insert rows here; a worker sends them afterwards.
 * `dedupeKey` guarantees one email per event even if the payment webhook fires twice.
 */
export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: text().notNull(), // email | whatsapp
    template: text().notNull(),
    recipient: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    dedupeKey: text().notNull().unique(),
    status: text().notNull().default("pending"), // pending | sent | failed | skipped
    attempts: integer().notNull().default(0),
    lastError: text(),
    sendAfter: ts().notNull().defaultNow(),
    sentAt: ts(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("outbox_status_idx").on(t.status, t.sendAfter)],
);

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    actorEmail: text(),
    actorRole: text(),
    action: text().notNull(),
    module: text().notNull(),
    description: text().notNull(),
    entityType: text(),
    entityId: text(),
    before: jsonb().$type<unknown>(),
    after: jsonb().$type<unknown>(),
    ip: text(),
    userAgent: text(),
    status: text().notNull().default("success"),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_actor_idx").on(t.actorId),
    index("audit_module_idx").on(t.module),
    index("audit_entity_idx").on(t.entityType, t.entityId),
  ],
);

/** Fallback rate-limit store used when Upstash Redis is not configured. */
export const appRateLimits = pgTable("app_rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  windowStart: ts().notNull(),
});

/* ------------------------------------------------------------------ */
/* Secrets vault                                                       */
/* ------------------------------------------------------------------ */

/**
 * Credentials entered in the admin (e.g. Paystack keys). Values are encrypted with AES-256-GCM using a
 * key derived from BETTER_AUTH_SECRET, so a database leak alone does not reveal them. Only a masked
 * hint is ever shown again. See src/server/secrets.ts.
 */
export const appSecrets = pgTable("app_secrets", {
  key: text().primaryKey(),
  ciphertext: text().notNull(),
  hint: text().notNull(),
  updatedBy: text().references(() => user.id, { onDelete: "set null" }),
  updatedAt: ts().notNull().defaultNow(),
});
