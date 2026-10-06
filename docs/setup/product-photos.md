# Real product photos (Brave Search)

Every product gets an automatic 3D picture the moment it is created. With a Brave Search key, the
site also looks for a **real photo** of each product — on the manufacturer's website first — and
swaps it in. This happens in the background, never while a customer is loading a page.

## 1. Get a Brave Search API key

1. Go to <https://api-dashboard.search.brave.com> and create an account.
2. Choose a plan that includes **image search**. There is a free plan (about 2,000 searches a month
   at the time of writing; Brave may ask for a card to verify the account). Check the current
   allowance and price on their pricing page.
3. Open **API Keys → Add API key** and copy the key.

Each product uses one or two searches, so the free allowance covers roughly 1,000 products a month.

## 2. Add it in Vercel

Vercel → your project → **Settings → Environment Variables**:

| Key | Value | Environments |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | the key you copied | Production and Preview |

Paste it only there, never into chat or code. Then **Deployments → ⋯ → Redeploy**.

File storage must also be connected (Cloudflare R2 or Vercel Blob), because found photos are saved
to your own storage — see [cloudflare-r2.md](cloudflare-r2.md).

## 3. Check it

- **Admin → Security & health** shows **Product photo search: Connected** and how many products are
  waiting.
- **Admin → Products** shows a bar: *N products waiting for a real photo → Find photos now*.

## How it behaves

- **When it runs:** right after an Excel import (the import screen shows progress and can be
  stopped), from **Find photos now** on the product list, and once a day for anything left over.
- **Where it looks:** the manufacturer's official site first (for example hp.com for an HP product).
  If nothing is found there, a matching photo from another shop's page may be used. To forbid that,
  switch on **Only use photos from the manufacturer's own website** in
  **Settings → Storefront & effects**.
- **Matching:** a photo is only accepted if its title or file name mentions the product's model
  number (for example `840` and `G8`). Logos, banners and tiny images are ignored. If nothing
  suitable is found, the product keeps its 3D picture.
- **Speed:** each photo is downloaded once, shrunk to at most 1000 px, converted to WebP and stored
  on your storage. The shop then serves it like any uploaded picture.
- **Allowance used up:** the search pauses and continues on the next run; nothing is lost.
- **Switch it off:** **Settings → Storefront & effects → Find real product photos automatically**.

## Staff control

On a product's edit page (needs the **Edit products** permission; Super Admin always has it):

- **Auto-found** pictures carry an amber badge that links to the page the photo came from.
- **Search for a different photo**, **Use the 3D picture instead**, or **paste a picture link**.
- Upload, reorder, rename (alt text) or remove any picture under **Images & video**. Uploaded photos
  are never replaced by the automatic search.

## Things to know

- A found photo shows the **model**, not the exact unit in your shop. For UK-used items, upload your
  own photos where the condition matters.
- Manufacturer photos belong to the manufacturer. Using them for products you sell is common
  practice, but it is the business's responsibility; remove any photo on request.
- Automatic matching is not perfect. Review **Auto-found** pictures, especially for look-alike
  models.
