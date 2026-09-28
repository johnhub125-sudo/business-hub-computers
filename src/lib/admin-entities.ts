/**
 * Field definitions for config-driven admin CRUD screens. Shared by the client (form rendering)
 * and the server (validation). The server-side registry (src/server/admin/crud.ts) maps each
 * entity to its table and permission — the client can never choose those.
 */
import { NIGERIAN_STATES } from "./brand";

export type FieldType = "text" | "textarea" | "number" | "money" | "percent" | "boolean" | "select" | "date" | "datetime" | "image" | "tags" | "keyvalue" | "ref" | "refs";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: [string, string][];
  /** For ref/refs: which option list the server should load. */
  ref?: "categories" | "products" | "brands";
  full?: boolean;
  defaultValue?: string | number | boolean;
  max?: number;
};

export type EntityMeta = {
  key: string;
  title: string;
  singular: string;
  description?: string;
  fields: FieldDef[];
  columns: { name: string; label: string; type?: FieldType }[];
  searchable?: string[];
};

const bool = (name: string, label: string, def = true): FieldDef => ({ name, label, type: "boolean", defaultValue: def });
const order: FieldDef = { name: "sortOrder", label: "Display order", type: "number", defaultValue: 0, hint: "Lower numbers appear first" };
const states: [string, string][] = NIGERIAN_STATES.map((s) => [s, s]);

export const ENTITY_META: Record<string, EntityMeta> = {
  brands: {
    key: "brands",
    title: "Brands",
    singular: "brand",
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "logo", label: "Logo", type: "image" }, { name: "description", label: "Description", type: "textarea", full: true }, order, bool("isActive", "Active")],
    columns: [{ name: "name", label: "Name" }, { name: "slug", label: "Slug" }, { name: "sortOrder", label: "Order" }, { name: "isActive", label: "Active", type: "boolean" }],
    searchable: ["name"],
  },
  conditions: {
    key: "conditions",
    title: "Product conditions",
    singular: "condition",
    description: "Conditions flagged as collections appear as top-level menus (e.g. /brand-new, /uk-used).",
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "description", label: "Description", type: "textarea", full: true }, bool("isCollection", "Show as storefront collection", false), order, bool("isActive", "Active")],
    columns: [{ name: "name", label: "Name" }, { name: "slug", label: "Slug" }, { name: "isCollection", label: "Collection", type: "boolean" }, { name: "isActive", label: "Active", type: "boolean" }],
  },
  categories: {
    key: "categories",
    title: "Categories",
    singular: "category",
    description: "Top-level categories and sub-categories. Add new ones any time — they appear in menus automatically.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "parentId", label: "Parent category", type: "ref", ref: "categories", hint: "Leave empty for a top-level category" },
      { name: "image", label: "Image", type: "image" },
      { name: "description", label: "Description", type: "textarea", full: true },
      { name: "seoTitle", label: "SEO title", type: "text" },
      { name: "seoDescription", label: "SEO description", type: "text" },
      order,
      bool("showInMenu", "Show in menus"),
      bool("isActive", "Active"),
    ],
    columns: [{ name: "name", label: "Name" }, { name: "slug", label: "Slug" }, { name: "parentName", label: "Parent" }, { name: "sortOrder", label: "Order" }, { name: "isActive", label: "Active", type: "boolean" }],
    searchable: ["name"],
  },
  suppliers: {
    key: "suppliers",
    title: "Suppliers",
    singular: "supplier",
    fields: [
      { name: "name", label: "Company name", type: "text", required: true },
      { name: "contactName", label: "Contact person", type: "text" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "address", label: "Address", type: "textarea", full: true },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      bool("isActive", "Active"),
    ],
    columns: [{ name: "name", label: "Name" }, { name: "contactName", label: "Contact" }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }, { name: "isActive", label: "Active", type: "boolean" }],
    searchable: ["name", "email", "phone"],
  },
  logistics: {
    key: "logistics",
    title: "Logistics rates",
    singular: "rate",
    description: "Rates are calculated on the server. A city-specific rate overrides the state-wide rate for the same method.",
    fields: [
      { name: "state", label: "State", type: "select", options: states, required: true },
      { name: "city", label: "City", type: "text", hint: "Leave empty to apply to the whole state" },
      { name: "zone", label: "Zone", type: "text" },
      { name: "method", label: "Method", type: "select", options: [["delivery", "Door delivery"], ["pickup", "Pickup / motor park / agent"]], required: true },
      { name: "label", label: "Label shown to customers", type: "text", required: true, full: true },
      { name: "price", label: "Price (₦)", type: "money", required: true },
      { name: "etaDaysMin", label: "ETA min (days)", type: "number", defaultValue: 1 },
      { name: "etaDaysMax", label: "ETA max (days)", type: "number", defaultValue: 3 },
      { name: "notes", label: "Notes (e.g. collection address)", type: "text", full: true },
      bool("isSpecial", "Special rate", false),
      order,
      bool("isActive", "Active"),
    ],
    columns: [{ name: "state", label: "State" }, { name: "city", label: "City" }, { name: "method", label: "Method" }, { name: "label", label: "Label" }, { name: "price", label: "Price", type: "money" }, { name: "isActive", label: "Active", type: "boolean" }],
    searchable: ["state", "city", "label", "zone"],
  },
  bankAccounts: {
    key: "bankAccounts",
    title: "Bank accounts",
    singular: "bank account",
    description: "Shown to customers who pay by bank transfer. Changes are audited.",
    fields: [{ name: "bankName", label: "Bank", type: "text", required: true }, { name: "accountNumber", label: "Account number", type: "text", required: true, max: 20 }, { name: "accountName", label: "Account name", type: "text", required: true }, order, bool("isActive", "Active")],
    columns: [{ name: "bankName", label: "Bank" }, { name: "accountNumber", label: "Account number" }, { name: "accountName", label: "Account name" }, { name: "isActive", label: "Active", type: "boolean" }],
  },
  coupons: {
    key: "coupons",
    title: "Coupons",
    singular: "coupon",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, hint: "Letters, numbers, - and _ only" },
      { name: "description", label: "Description", type: "text" },
      { name: "type", label: "Type", type: "select", options: [["percentage", "Percentage"], ["fixed", "Fixed amount"]], required: true },
      { name: "value", label: "Value (% or ₦)", type: "text", required: true, hint: "e.g. 10 for 10%, or 5000 for ₦5,000" },
      { name: "minOrderAmount", label: "Minimum order (₦)", type: "money", defaultValue: 0 },
      { name: "maxDiscountAmount", label: "Maximum discount (₦)", type: "money" },
      { name: "startsAt", label: "Starts", type: "datetime" },
      { name: "endsAt", label: "Ends", type: "datetime" },
      { name: "usageLimit", label: "Total usage limit", type: "number" },
      { name: "perCustomerLimit", label: "Uses per customer", type: "number", defaultValue: 1 },
      { name: "productIds", label: "Only these products", type: "refs", ref: "products", full: true },
      { name: "categoryIds", label: "Only these categories", type: "refs", ref: "categories", full: true },
      bool("isActive", "Active"),
    ],
    columns: [{ name: "code", label: "Code" }, { name: "type", label: "Type" }, { name: "valueLabel", label: "Value" }, { name: "usedCount", label: "Used" }, { name: "endsAt", label: "Ends", type: "datetime" }, { name: "isActive", label: "Active", type: "boolean" }],
    searchable: ["code", "description"],
  },
  discounts: {
    key: "discounts",
    title: "Automatic discounts",
    singular: "discount",
    description: "Applied automatically (no code) to matching products while active.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "type", label: "Type", type: "select", options: [["percentage", "Percentage"], ["fixed", "Fixed amount per unit"]], required: true },
      { name: "value", label: "Value (% or ₦)", type: "text", required: true },
      { name: "appliesTo", label: "Applies to", type: "select", options: [["all", "All products"], ["category", "Categories"], ["product", "Products"], ["brand", "Brands"]], required: true },
      { name: "targetCategories", label: "Categories", type: "refs", ref: "categories", full: true },
      { name: "targetProducts", label: "Products", type: "refs", ref: "products", full: true },
      { name: "targetBrands", label: "Brands", type: "refs", ref: "brands", full: true },
      { name: "startsAt", label: "Starts", type: "datetime" },
      { name: "endsAt", label: "Ends", type: "datetime" },
      bool("isActive", "Active"),
    ],
    columns: [{ name: "name", label: "Name" }, { name: "appliesTo", label: "Applies to" }, { name: "valueLabel", label: "Value" }, { name: "endsAt", label: "Ends", type: "datetime" }, { name: "isActive", label: "Active", type: "boolean" }],
  },
  carousel: {
    key: "carousel",
    title: "Hero carousel",
    singular: "slide",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, full: true },
      { name: "subtitle", label: "Subtitle", type: "textarea", full: true },
      { name: "kind", label: "Type", type: "select", options: [["promotion", "Promotional banner"], ["seasonal", "Seasonal campaign"], ["discount", "Discount"], ["new_arrivals", "New arrivals"], ["offer", "Special offer"]], required: true },
      { name: "ctaLabel", label: "Button text", type: "text" },
      { name: "ctaUrl", label: "Button link", type: "text", hint: "e.g. /deals or /uk-used" },
      { name: "desktopImage", label: "Desktop image (16:6)", type: "image", required: true },
      { name: "mobileImage", label: "Mobile image (4:5)", type: "image" },
      { name: "startsAt", label: "Start date", type: "datetime" },
      { name: "endsAt", label: "End date", type: "datetime" },
      order,
      bool("isActive", "Active"),
    ],
    columns: [{ name: "desktopImage", label: "Image", type: "image" }, { name: "title", label: "Title" }, { name: "kind", label: "Type" }, { name: "sortOrder", label: "Order" }, { name: "endsAt", label: "Ends", type: "datetime" }, { name: "isActive", label: "Active", type: "boolean" }],
  },
  team: {
    key: "team",
    title: "Team",
    singular: "team member",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "position", label: "Position", type: "text", required: true },
      { name: "photo", label: "Photo", type: "image" },
      { name: "bio", label: "Biography", type: "textarea", full: true },
      { name: "socials", label: "Social links", type: "keyvalue", full: true, hint: "One per line, e.g. linkedin: https://…" },
      order,
      bool("isActive", "Active"),
    ],
    columns: [{ name: "photo", label: "Photo", type: "image" }, { name: "name", label: "Name" }, { name: "position", label: "Position" }, { name: "sortOrder", label: "Order" }, { name: "isActive", label: "Active", type: "boolean" }],
    searchable: ["name", "position"],
  },
  gallery: {
    key: "gallery",
    title: "Gallery",
    singular: "image",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "category", label: "Category", type: "select", options: [["company", "Company photos"], ["products", "Products"], ["events", "Events"], ["installations", "Installations"], ["projects", "Projects"], ["office", "Office"], ["team", "Team activities"], ["training", "Training"]], required: true },
      { name: "imageUrl", label: "Image", type: "image", required: true },
      { name: "alt", label: "Alt text (accessibility)", type: "text", full: true },
      order,
      bool("isActive", "Active"),
    ],
    columns: [{ name: "imageUrl", label: "Image", type: "image" }, { name: "title", label: "Title" }, { name: "category", label: "Category" }, { name: "isActive", label: "Active", type: "boolean" }],
    searchable: ["title"],
  },
  projects: {
    key: "projects",
    title: "Projects",
    singular: "project",
    fields: [
      { name: "title", label: "Project title", type: "text", required: true, full: true },
      { name: "client", label: "Client", type: "text" },
      { name: "category", label: "Category", type: "text", hint: "e.g. CBT centre setup" },
      { name: "location", label: "Location", type: "text" },
      { name: "completedAt", label: "Completion date", type: "date" },
      { name: "images", label: "Cover image", type: "image" },
      { name: "services", label: "Services provided", type: "tags", full: true, hint: "Comma separated" },
      { name: "description", label: "Description", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: [["published", "Published"], ["draft", "Draft"], ["archived", "Archived"]], required: true, defaultValue: "published" },
      order,
    ],
    columns: [{ name: "title", label: "Title" }, { name: "category", label: "Category" }, { name: "location", label: "Location" }, { name: "completedAt", label: "Completed", type: "date" }, { name: "status", label: "Status" }],
    searchable: ["title", "client", "location"],
  },
  testimonials: {
    key: "testimonials",
    title: "Testimonials",
    singular: "testimonial",
    description: "Customer comments are never published automatically — approve them here.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "role", label: "Role / company", type: "text" },
      { name: "content", label: "Testimonial", type: "textarea", required: true, full: true },
      { name: "rating", label: "Rating (1–5)", type: "number", defaultValue: 5 },
      { name: "photo", label: "Photo", type: "image" },
      { name: "status", label: "Status", type: "select", options: [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]], required: true, defaultValue: "approved" },
      order,
    ],
    columns: [{ name: "name", label: "Name" }, { name: "role", label: "Role" }, { name: "rating", label: "Rating" }, { name: "status", label: "Status" }],
  },
  faqs: {
    key: "faqs",
    title: "FAQs",
    singular: "FAQ",
    fields: [{ name: "question", label: "Question", type: "text", required: true, full: true }, { name: "answer", label: "Answer", type: "textarea", required: true, full: true }, { name: "category", label: "Category", type: "text", defaultValue: "General" }, order, bool("isActive", "Active")],
    columns: [{ name: "question", label: "Question" }, { name: "category", label: "Category" }, { name: "isActive", label: "Active", type: "boolean" }],
  },
  branches: {
    key: "branches",
    title: "Locations",
    singular: "location",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "phone", label: "Phone", type: "text" },
      { name: "address", label: "Address", type: "textarea", required: true, full: true },
      { name: "mapsQuery", label: "Google Maps search / plus code", type: "text", required: true, full: true },
      { name: "hours", label: "Opening hours", type: "text" },
      bool("isPrimary", "Primary location", false),
      order,
      bool("isActive", "Active"),
    ],
    columns: [{ name: "name", label: "Name" }, { name: "address", label: "Address" }, { name: "isPrimary", label: "Primary", type: "boolean" }, { name: "isActive", label: "Active", type: "boolean" }],
  },
  socials: {
    key: "socials",
    title: "Social links",
    singular: "social link",
    fields: [{ name: "platform", label: "Platform", type: "text", required: true }, { name: "url", label: "URL", type: "text", required: true, full: true }, order, bool("isActive", "Active")],
    columns: [{ name: "platform", label: "Platform" }, { name: "url", label: "URL" }, { name: "isActive", label: "Active", type: "boolean" }],
  },
};

export type EntityKey = keyof typeof ENTITY_META;
