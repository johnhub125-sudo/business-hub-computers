# Adding products fast: Excel import and automatic pictures

## Add many products with Excel

**Admin → Products → Add product** (the panel is also behind **Import** on the product list).

1. **Download Excel template.** The file has three sheets:
   - **Products** – fill one row per product. Red headings (marked `*`) are required.
   - **Lists** – feeds the dropdowns; it is rebuilt from your live categories, brands and conditions
     every time you download, so download a fresh copy after adding a category.
   - **How to use** – the same instructions, plus a guide to every column.
2. **Choose file → Check file.** The whole file is validated and every problem is listed with its
   Excel row number. Nothing is saved at this stage.
3. **Import.** All rows are saved together (or none, if anything fails).

| Column | Notes |
|---|---|
| SKU `*` | Your unique code. A SKU that already exists **updates** that product. |
| Product name `*`, Price (₦) `*` | Price in naira, numbers only. |
| Category `*`, Subcategory | Decide the shop menu. The subcategory must belong to the category. |
| Condition `*` | Brand New / UK Used… puts the product under that menu. |
| Brand | Pick one or type a new one; new brands are created automatically. |
| Discount price, Cost price | Optional. Cost price is never shown to customers. |
| Stock quantity | Used for **new** products only. Change existing stock under Inventory. |
| Specifications | `Name: value; Name: value`, e.g. `Processor: Core i5; RAM: 8GB; Storage: 256GB SSD`. |
| Featured, Deal, New arrival, Best seller | `Yes` / `No`. Add the product to those sections. Featured products also appear as the floating 3D product in the home carousel. |
| Status | `Active` (default, visible immediately) or `Draft`. |

When updating an existing SKU, blank Yes/No and Specifications cells are left as they were.
CSV files with the same column names (`sku, name, category, …`) are accepted too. Limit: 2,000 rows.

## Automatic product pictures

Every product without an uploaded photo shows a generated 3D-style picture of its device type
(laptop, gaming laptop, desktop, monitor, printer, projector, power station, UPS, keyboard, mouse,
headset, phone, storage, router, accessory). The type is worked out from the product name first, then
the category. The product page version also prints the brand, name, condition and the first three
specifications; cards use a compact version.

- Nothing to do: it applies to the Add product form, Excel imports and all existing products.
- It is an illustration, not a photograph of the item. Upload real photos on the product's edit page
  and they replace it everywhere.
- Each picture is a few KB of SVG, drawn without a database query and cached permanently
  (`src/lib/product-art.ts`, `src/server/product-art-url.ts`, `src/app/product-art/[id]/route.ts`).

## Storefront motion

**Admin → Settings → Storefront & effects** controls the carousel animation (3D turn, slide, zoom,
fade), seconds per slide, autoplay, the floating 3D product, card tilt, scroll effects and the
"install as app" banner. Slides themselves are edited under **Content → Carousel**. All effects are
CSS only (no 3D library is downloaded) and are disabled for visitors who prefer reduced motion.

## Install as an app

The site is installable (`src/app/manifest.ts`, `public/sw.js`). The banner offers a one-tap install
on Chrome, Edge, Samsung Internet and Opera (Android and desktop). On iPhone/iPad, Apple does not let
a website open the install dialog, so the banner shows the two taps (Share → Add to Home Screen).
Firefox on desktop cannot install web apps, so no banner is shown there.

## Local development note

`next dev` reads `.env.development.local` before `.env.local`. Keep
`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` there so local testing never
writes to the live database, even if `.env.local` points at Neon for running setup scripts.
