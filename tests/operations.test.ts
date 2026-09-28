import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Simulated signed-in user for the session helpers (Better Auth's cookie layer is not under test here).
let currentUserId: string | null = null;
vi.mock("@/server/auth", () => ({
  auth: { api: { getSession: async () => (currentUserId ? { user: { id: currentUserId }, session: { token: "t" } } : null) } },
  internalSignupHeaders: () => new Headers(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { DEFAULT_ROLES, PERMISSIONS, type Permission } from "@/lib/permissions";
import { db } from "@/server/db";
import { coupons, orders, payments, permissions, purchases, receipts, rolePermissions, roles, staffProfiles, userRoles } from "@/server/db/schema";
import { requirePermission } from "@/server/session";
import { createOrder } from "@/server/services/orders";
import { verifyBankTransfer } from "@/server/services/payments";
import { createPosSale } from "@/server/services/pos";
import { receivePurchase, savePurchase } from "@/server/services/purchases";
import { makeCatalog, makeCoupon, makeUser, resetDb, stockOf } from "./support/fixtures";

async function seedRoles() {
  for (const [key, meta] of Object.entries(PERMISSIONS)) await db.insert(permissions).values({ key, module: meta.module, description: meta.description });
  const perms = new Map((await db.select().from(permissions)).map((p) => [p.key, p.id]));
  for (const r of DEFAULT_ROLES) {
    const [role] = await db.insert(roles).values({ slug: r.slug, name: r.name, isSystem: true }).returning();
    const list = r.permissions === "*" ? (Object.keys(PERMISSIONS) as Permission[]) : r.permissions;
    if (list.length) await db.insert(rolePermissions).values(list.map((k) => ({ roleId: role.id, permissionId: perms.get(k)! })));
  }
}

async function makeStaff(roleSlug: string | null, opts: { approval?: "approved" | "pending"; status?: "active" | "suspended" | "pending" } = {}) {
  const id = await makeUser({ userType: "staff", status: opts.status ?? "active" });
  await db.insert(staffProfiles).values({ userId: id, surname: "Staff", firstName: "Test", phone: "0800", approval: opts.approval ?? "approved" });
  if (roleSlug) {
    const [r] = await db.select().from(roles).where(eq(roles.slug, roleSlug));
    await db.insert(userRoles).values({ userId: id, roleId: r.id });
  }
  return id;
}

beforeEach(async () => {
  await resetDb();
  await seedRoles();
  currentUserId = null;
});

describe("role-based access control", () => {
  it("grants only the permissions of the assigned role", async () => {
    currentUserId = await makeStaff("sales-manager");
    await expect(requirePermission("orders.manage")).resolves.toBeTruthy();
    await expect(requirePermission("payments.verify_transfer")).rejects.toThrow(/permission/);
    await expect(requirePermission("staff.manage")).rejects.toThrow(/permission/);
  });

  it("gives the Super Admin every permission", async () => {
    currentUserId = await makeStaff("super-admin");
    const s = await requirePermission("staff.manage", "payments.configure", "security.manage");
    expect(s.isSuperAdmin).toBe(true);
  });

  it("blocks pending, suspended, anonymous and customer accounts", async () => {
    currentUserId = await makeStaff("admin", { approval: "pending", status: "pending" });
    await expect(requirePermission("orders.manage")).rejects.toThrow(/not active/);
    currentUserId = await makeStaff("admin", { status: "suspended" });
    await expect(requirePermission("orders.manage")).rejects.toThrow();
    currentUserId = null;
    await expect(requirePermission("orders.manage")).rejects.toThrow(/sign in/i);
    currentUserId = await makeUser();
    await expect(requirePermission("orders.manage")).rejects.toThrow(/sign in/i);
  });
});

describe("point of sale", () => {
  it("records an in-store sale atomically and idempotently", async () => {
    const { variant } = await makeCatalog({ price: 10_000_000, stock: 3 });
    const staffId = await makeStaff("pos-staff");
    const staff = { id: staffId, email: "pos@example.test", roleLabel: "POS Staff", permissions: new Set<Permission>(["pos.use"]) };
    const input = { lines: [{ variantId: variant.id, quantity: 2 }], paymentMethod: "cash" as const, amountTenderedNaira: "220000", idempotencyKey: "pos-key-0000000001" };
    const sale = await createPosSale(input, staff);
    const again = await createPosSale(input, staff);
    expect(again.orderId).toBe(sale.orderId);
    const [o] = await db.select().from(orders).where(eq(orders.id, sale.orderId));
    expect(o.status).toBe("collected");
    expect(o.grandTotal).toBe(20_000_000 + 1_500_000);
    expect(await db.select().from(receipts).where(eq(receipts.orderId, o.id))).toHaveLength(1);
    expect(await stockOf(variant.id)).toEqual({ onHand: 1, reserved: 0, sold: 2 });
    await expect(createPosSale({ ...input, discountNaira: "1000", idempotencyKey: "pos-key-0000000002" }, staff)).rejects.toThrow(/discount/);
  });
});

describe("purchases", () => {
  it("adds stock once when received", async () => {
    const { variant } = await makeCatalog({ stock: 1 });
    const staff = { id: await makeStaff("inventory-manager"), email: "inv@example.test", roleLabel: "Inventory" };
    const { id } = await savePurchase({ purchaseDate: "2026-09-01", status: "ordered", items: [{ variantId: variant.id, quantity: 5, unitCost: "300000" }] }, staff);
    const [p] = await db.select().from(purchases).where(eq(purchases.id, id));
    expect(p.totalCost).toBe(150_000_000);
    await receivePurchase(id, staff, true);
    await expect(receivePurchase(id, staff, true)).rejects.toThrow(/already/);
    expect((await stockOf(variant.id)).onHand).toBe(6);
  });
});

describe("coupons", () => {
  it("counts a coupon as used only after payment, once", async () => {
    const { variant } = await makeCatalog({ price: 10_000_000, stock: 5 });
    await makeCoupon({ code: "ONCE10", type: "percentage", value: 1000 });
    const customer = await makeUser();
    const res = await createOrder({
      userId: customer,
      lines: [{ variantId: variant.id, quantity: 1 }],
      couponCode: "ONCE10",
      fulfilment: { method: "delivery", state: "Oyo", city: "Ibadan" },
      contact: { name: "C", email: "c@example.test", phone: "08030000000" },
      paymentMethod: "bank_transfer",
      idempotencyKey: "coupon-order-1",
    });
    let [c] = await db.select().from(coupons).where(eq(coupons.code, "ONCE10"));
    expect(c.usedCount).toBe(0);
    const [p] = await db.select().from(payments).where(eq(payments.id, res.paymentId));
    const staff = { id: await makeStaff("finance-officer"), email: "f@example.test", roleLabel: "Finance" };
    await verifyBankTransfer(p.id, staff, { amountConfirmed: p.amountExpected });
    [c] = await db.select().from(coupons).where(eq(coupons.code, "ONCE10"));
    expect(c.usedCount).toBe(1);
  });
});
