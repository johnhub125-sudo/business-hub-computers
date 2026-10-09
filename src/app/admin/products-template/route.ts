import { audit } from "@/server/audit";
import { buildProductTemplate } from "@/server/services/product-sheet";
import { getStaffContext } from "@/server/session";

export const dynamic = "force-dynamic";

/** Downloads the Excel template for adding many products at once (dropdowns reflect the live catalogue). */
export async function GET(req: Request) {
  const staff = await getStaffContext();
  if (!staff || staff.status !== "active" || staff.approval !== "approved") return new Response("Unauthorized", { status: 401 });
  if (!staff.permissions.has("products.create")) return new Response("Forbidden", { status: 403 });
  // ?products=1 → the same sheet filled with the current products, to edit and import back.
  const withProducts = new URL(req.url).searchParams.get("products") === "1";
  const file = await buildProductTemplate({ withProducts });
  await audit({ actor: staff, action: "product.template_downloaded", module: "Products", description: withProducts ? "Exported the products to Excel" : "Downloaded the product import template" });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${withProducts ? "business-hub-products" : "business-hub-products-template"}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
