import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import { ProductsTable } from "@/components/admin/products-table";
import { AdminHeader, FilterBar, FilterInput, FilterSelect, one, pageOf, qsWith, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/misc";
import { db } from "@/server/db";
import { brands, categories, productConditions, products } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Products" };
const PER = 25;

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const staff = await requireStaffPage("products.view");
  const sp = (await searchParams) as SP;
  const q = one(sp, "q")?.trim();
  const status = one(sp, "status");
  const cat = one(sp, "category");
  const cond = one(sp, "condition");
  const stock = one(sp, "stock");
  const page = pageOf(sp);

  const stockExpr = sql<number>`coalesce((SELECT sum(i.on_hand - i.reserved) FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.product_id = ${products.id} AND v.is_active),0)::int`;
  const where: (SQL | undefined)[] = [isNull(products.deletedAt)];
  if (q) where.push(or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.barcode, `%${q}%`), sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = ${products.id} AND v.sku ILIKE ${"%" + q + "%"})`));
  if (status === "draft" || status === "active" || status === "archived") where.push(eq(products.status, status));
  if (cat) where.push(or(eq(products.categoryId, cat), eq(products.subcategoryId, cat)));
  if (cond) where.push(eq(products.conditionId, cond));
  if (stock === "out") where.push(sql`${stockExpr} <= 0`);
  if (stock === "low") where.push(sql`${stockExpr} <= ${products.minStockLevel}`);

  const cond2 = and(...where);
  const [rows, [{ total }], cats, conds] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        slug: products.slug,
        status: products.status,
        price: products.price,
        discountPrice: products.discountPrice,
        isFeatured: products.isFeatured,
        isDeal: products.isDeal,
        category: categories.name,
        condition: productConditions.name,
        brand: brands.name,
        stock: stockExpr,
        minStock: products.minStockLevel,
        image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${products.id} ORDER BY sort_order LIMIT 1)`,
        variants: sql<number>`(SELECT count(*) FROM product_variants v WHERE v.product_id = ${products.id} AND v.is_active)::int`,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(cond2)
      .orderBy(desc(products.updatedAt))
      .limit(PER)
      .offset((page - 1) * PER),
    db.select({ total: sql<number>`count(*)::int` }).from(products).where(cond2),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
    db.select({ id: productConditions.id, name: productConditions.name }).from(productConditions).orderBy(asc(productConditions.sortOrder)),
  ]);

  return (
    <div>
      <AdminHeader
        title="Products"
        description={`${total} product(s)`}
        actions={
          <>
            {can(staff, "reports.export") && (
              <ButtonLink href="/admin/export/products" variant="outline" size="sm">
                <Download aria-hidden /> Export CSV
              </ButtonLink>
            )}
            {can(staff, "products.create") && (
              <ButtonLink href="/admin/products/new" size="sm">
                <Plus aria-hidden /> Add product
              </ButtonLink>
            )}
          </>
        }
      />
      <FilterBar action="/admin/products">
        <FilterInput name="q" label="Search" defaultValue={q} placeholder="Name, SKU or barcode" className="min-w-56 flex-1" />
        <FilterSelect name="status" label="Status" defaultValue={status} options={[["active", "Active"], ["draft", "Draft"], ["archived", "Archived"]]} />
        <FilterSelect name="category" label="Category" defaultValue={cat} options={cats.map((c) => [c.id, c.name])} />
        <FilterSelect name="condition" label="Condition" defaultValue={cond} options={conds.map((c) => [c.id, c.name])} />
        <FilterSelect name="stock" label="Stock" defaultValue={stock} options={[["low", "Low stock"], ["out", "Out of stock"]]} />
      </FilterBar>
      <ProductsTable rows={rows} categories={cats} canEdit={can(staff, "products.edit")} canDelete={can(staff, "products.delete")} canImport={can(staff, "products.create")} />
      <Pagination page={page} pages={Math.ceil(total / PER)} hrefFor={(p) => qsWith("/admin/products", sp, { page: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
