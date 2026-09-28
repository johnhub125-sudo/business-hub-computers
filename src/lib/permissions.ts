/**
 * Permission catalogue. The database (roles/permissions tables) is the source of truth at runtime;
 * this list seeds it and gives type-safe keys to server code. UI may use it to hide controls,
 * but every server action re-checks on the server.
 */
export const PERMISSIONS = {
  "products.view": { module: "Products", description: "View products" },
  "products.create": { module: "Products", description: "Create products" },
  "products.edit": { module: "Products", description: "Edit products and prices" },
  "products.delete": { module: "Products", description: "Delete/archive products" },
  "inventory.manage": { module: "Inventory", description: "Adjust stock and view inventory" },
  "purchases.manage": { module: "Purchases", description: "Record and receive purchases" },
  "orders.manage": { module: "Orders", description: "View and update orders" },
  "customers.manage": { module: "Customers", description: "View and manage customers" },
  "payments.view": { module: "Payments", description: "View payments and reconciliation" },
  "payments.manage": { module: "Payments", description: "Reconcile, flag and annotate payments" },
  "payments.verify_transfer": { module: "Payments", description: "Verify bank transfers" },
  "refunds.process": { module: "Payments", description: "Approve and process refunds" },
  "pos.use": { module: "Sales", description: "Use the point-of-sale" },
  "delivery.manage": { module: "Delivery", description: "Manage delivery and collection" },
  "reviews.manage": { module: "Reviews", description: "Moderate reviews and questions" },
  "content.manage": { module: "Content", description: "Manage CMS, homepage, gallery, team, projects" },
  "staff.manage": { module: "Staff", description: "Approve staff, assign roles and permissions" },
  "tasks.manage": { module: "Tasks", description: "Create and assign tasks" },
  "support.manage": { module: "Support", description: "Handle support tickets and messages" },
  "reports.view": { module: "Reports", description: "View reports and analytics" },
  "reports.export": { module: "Reports", description: "Export reports and data" },
  "settings.manage": { module: "Settings", description: "Manage system settings (VAT, logistics, banks)" },
  "payments.configure": { module: "Settings", description: "Configure Paystack mode and payment settings" },
  "audit.view": { module: "Security", description: "View audit logs" },
  "security.manage": { module: "Security", description: "Manage security, sessions and system health" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SUPER_ADMIN = "super-admin";

export const DEFAULT_ROLES: { slug: string; name: string; description: string; permissions: Permission[] | "*" }[] = [
  { slug: SUPER_ADMIN, name: "Super Admin", description: "Full control of the platform", permissions: "*" },
  {
    slug: "admin",
    name: "Admin",
    description: "Day-to-day administration",
    permissions: ALL_PERMISSIONS.filter(
      (p) => !["staff.manage", "payments.configure", "security.manage", "refunds.process"].includes(p),
    ),
  },
  {
    slug: "sales-manager",
    name: "Sales Manager",
    description: "Orders, customers and POS",
    permissions: ["products.view", "orders.manage", "customers.manage", "pos.use", "reports.view", "payments.view"],
  },
  {
    slug: "inventory-manager",
    name: "Inventory Manager",
    description: "Stock and purchasing",
    permissions: ["products.view", "products.create", "products.edit", "inventory.manage", "purchases.manage", "reports.view"],
  },
  {
    slug: "finance-officer",
    name: "Finance Officer",
    description: "Payments, transfers and refunds",
    permissions: [
      "payments.view",
      "payments.manage",
      "payments.verify_transfer",
      "refunds.process",
      "orders.manage",
      "reports.view",
      "reports.export",
    ],
  },
  {
    slug: "customer-support",
    name: "Customer Support",
    description: "Tickets, messages and reviews",
    permissions: ["support.manage", "orders.manage", "customers.manage", "reviews.manage", "products.view"],
  },
  {
    slug: "delivery-manager",
    name: "Delivery Manager",
    description: "Dispatch and collection",
    permissions: ["delivery.manage", "orders.manage"],
  },
  {
    slug: "content-manager",
    name: "Content Manager",
    description: "Website content",
    permissions: ["content.manage", "reviews.manage", "products.view"],
  },
  {
    slug: "marketing-manager",
    name: "Marketing Manager",
    description: "Promotions and content",
    permissions: ["content.manage", "products.view", "products.edit", "reports.view"],
  },
  { slug: "pos-staff", name: "POS Staff", description: "In-store sales", permissions: ["pos.use", "products.view"] },
  { slug: "staff", name: "Staff", description: "Basic staff access (tasks only)", permissions: [] },
];

export const DEPARTMENTS = ["Management", "Sales", "Inventory", "Finance", "Support", "Logistics", "Content", "Marketing", "Technical"];
