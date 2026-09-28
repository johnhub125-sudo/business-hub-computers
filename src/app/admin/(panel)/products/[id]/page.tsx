import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/product-editor";
import { AdminHeader } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { requireStaffPage } from "@/server/session";
import { editorOptions, productForm } from "../editor-data";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireStaffPage("products.edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [form, opts, sp] = await Promise.all([productForm(id), editorOptions(), searchParams]);
  if (!form) notFound();
  return (
    <div>
      <AdminHeader
        title={form.name}
        description={sp.created ? "Product created. Now upload images and review the details." : `SKU ${form.sku}`}
        back={{ href: "/admin/products", label: "Products" }}
        actions={
          <>
            <ButtonLink href={`/admin/inventory?q=${encodeURIComponent(form.sku)}`} variant="outline" size="sm">
              Stock & history
            </ButtonLink>
            <ButtonLink href={`/products/${form.slug}`} target="_blank" variant="outline" size="sm">
              View on store
            </ButtonLink>
          </>
        }
      />
      <ProductEditor key={form.id} initial={form} {...opts} />
    </div>
  );
}
