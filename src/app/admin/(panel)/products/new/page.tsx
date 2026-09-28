import type { Metadata } from "next";
import { ProductEditor } from "@/components/admin/product-editor";
import { AdminHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/session";
import { editorOptions, emptyProduct } from "../editor-data";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireStaffPage("products.create");
  const opts = await editorOptions();
  return (
    <div>
      <AdminHeader title="Add product" back={{ href: "/admin/products", label: "Products" }} />
      <ProductEditor initial={emptyProduct()} {...opts} />
    </div>
  );
}
