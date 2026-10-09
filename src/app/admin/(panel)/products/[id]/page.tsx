import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/product-editor";
import { ProductPictureTools } from "@/components/admin/product-photos";
import { ProductSerials } from "@/components/admin/product-serials";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { productSerials } from "@/server/db/schema";
import { photoSearchReady } from "@/server/services/product-photos";
import { AdminHeader } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { requireStaffPage } from "@/server/session";
import { editorOptions, productForm, productPicture } from "../editor-data";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireStaffPage("products.edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [form, opts, sp] = await Promise.all([productForm(id), editorOptions(), searchParams]);
  if (!form) notFound();
  const [picture, serials] = await Promise.all([
    productPicture(id),
    db.select({ id: productSerials.id, serial: productSerials.serial, status: productSerials.status }).from(productSerials).where(eq(productSerials.productId, id)).orderBy(asc(productSerials.status), asc(productSerials.serial)),
  ]);
  return (
    <div>
      <AdminHeader
        title={form.name}
        description={sp.created ? "Product created with its picture. Review the details below." : `SKU ${form.sku}`}
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
      <ProductPictureTools productId={form.id!} picture={picture.url} kind={picture.kind} searchReady={photoSearchReady()} status={picture.status} />
      <ProductSerials serials={serials} />
      <ProductEditor key={form.id} initial={form} {...opts} />
    </div>
  );
}
