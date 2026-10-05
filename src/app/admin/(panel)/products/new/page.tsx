import type { Metadata } from "next";
import { ProductEditor } from "@/components/admin/product-editor";
import { ProductImport } from "@/components/admin/product-import";
import { AdminHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/session";
import { editorOptions, emptyProduct } from "../editor-data";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireStaffPage("products.create");
  const opts = await editorOptions();
  return (
    <div>
      <AdminHeader title="Add products" description="Upload many with Excel, or fill the form for one. Every product gets a 3D picture automatically." back={{ href: "/admin/products", label: "Products" }} />
      <ProductImport className="mb-6" />
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Or add a single product</h2>
      <ProductEditor initial={emptyProduct()} {...opts} />
    </div>
  );
}
