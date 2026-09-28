import type { Permission } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; perm?: Permission | Permission[] };
export type NavGroup = { label: string; items: NavItem[] };

/** Admin navigation (spec §66). Items are hidden when the user lacks the permission — and every page re-checks on the server. */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/admin/analytics", label: "Analytics", icon: "LineChart", perm: "reports.view" },
      { href: "/admin/reports", label: "Reports", icon: "FileBarChart", perm: "reports.view" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", icon: "ShoppingBag", perm: "orders.manage" },
      { href: "/admin/pos", label: "Point of sale", icon: "Calculator", perm: "pos.use" },
      { href: "/admin/payments", label: "Payments", icon: "CreditCard", perm: "payments.view" },
      { href: "/admin/receipts", label: "Receipts", icon: "Receipt", perm: ["payments.view", "orders.manage"] },
      { href: "/admin/customers", label: "Customers", icon: "Users", perm: "customers.manage" },
      { href: "/admin/coupons", label: "Coupons & discounts", icon: "TicketPercent", perm: "products.edit" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: "Package", perm: "products.view" },
      { href: "/admin/categories", label: "Categories", icon: "FolderTree", perm: "products.edit" },
      { href: "/admin/brands", label: "Brands & conditions", icon: "Tags", perm: "products.edit" },
      { href: "/admin/inventory", label: "Inventory", icon: "Boxes", perm: "inventory.manage" },
      { href: "/admin/purchases", label: "Purchases", icon: "Truck", perm: "purchases.manage" },
      { href: "/admin/reviews", label: "Reviews & Q&A", icon: "Star", perm: "reviews.manage" },
    ],
  },
  {
    label: "Fulfilment",
    items: [
      { href: "/admin/delivery", label: "Delivery", icon: "PackageCheck", perm: "delivery.manage" },
      { href: "/admin/logistics", label: "Logistics rates", icon: "Map", perm: "settings.manage" },
    ],
  },
  {
    label: "Website",
    items: [
      { href: "/admin/content", label: "Homepage & content", icon: "LayoutTemplate", perm: "content.manage" },
      { href: "/admin/carousel", label: "Carousel", icon: "GalleryHorizontal", perm: "content.manage" },
      { href: "/admin/gallery", label: "Gallery", icon: "Images", perm: "content.manage" },
      { href: "/admin/team", label: "Team", icon: "Contact", perm: "content.manage" },
      { href: "/admin/projects", label: "Projects", icon: "Briefcase", perm: "content.manage" },
    ],
  },
  {
    label: "Team & operations",
    items: [
      { href: "/admin/tasks", label: "Tasks", icon: "ListChecks" },
      { href: "/admin/support", label: "Support", icon: "Headset", perm: "support.manage" },
      { href: "/admin/staff", label: "Staff & roles", icon: "ShieldCheck", perm: "staff.manage" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", icon: "Settings", perm: "settings.manage" },
      { href: "/admin/audit-logs", label: "Audit logs", icon: "ScrollText", perm: "audit.view" },
      { href: "/admin/security", label: "Security & health", icon: "Shield" },
    ],
  },
];
