# File storage on Cloudflare R2

Uploaded files (product, team and brand images, payment proofs, attachments) are stored in an
S3-compatible bucket. Cloudflare R2 is recommended: about 10 GB free and no download fees. Any other
S3-compatible service (Backblaze B2, Supabase Storage, AWS S3) works with the same four variables.

The bucket stays **private**. Public images are served through the site at `/media/...` (cached by the
CDN); private files are only served after a permission check at `/api/files/...`.

## 1. Create the bucket

1. Sign up or log in at <https://dash.cloudflare.com>.
2. In the left menu open **R2 Object Storage**. The first time, Cloudflare asks you to enable R2 and may
   ask for a payment card, even though the free allowance costs nothing.
3. Click **Create bucket**. Name it e.g. `business-hub-files`, leave the location as **Automatic**, and
   create it. Do **not** enable public access.

## 2. Create an access key

1. On the R2 overview page click **Manage R2 API Tokens** (or **API → Manage API tokens**).
2. **Create API token** (an *Account* or *User* token both work):
   - Permission: **Object Read & Write**
   - Apply to: **Specific bucket only** → your bucket
3. Create it. Cloudflare shows these **once**, so keep the page open:
   - **Access Key ID**
   - **Secret Access Key**
   - the **S3 endpoint**, like `https://<account-id>.r2.cloudflarestorage.com`

## 3. Add the variables in Vercel

Vercel → your project → **Settings → Environment Variables**. Add each for **Production** and
**Preview**. Paste the values only there, never into chat or code.

| Key | Value |
|---|---|
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` (no bucket name at the end) |
| `S3_BUCKET` | your bucket name, e.g. `business-hub-files` |
| `S3_ACCESS_KEY_ID` | the Access Key ID |
| `S3_SECRET_ACCESS_KEY` | the Secret Access Key |

`S3_REGION` is not needed for R2. Then **Deployments → ⋯ → Redeploy**.

## 4. Check it

- **Admin → Security & health** shows **File storage (Cloudflare R2): Connected**.
- Upload an image (for example a team photo) and confirm it appears on the public page.

## Notes

- New uploads go to R2 as soon as the four variables are set. Files uploaded earlier to Vercel Blob keep
  working while the Blob store stays connected. To retire Blob, re-upload those images in the admin and
  then disconnect the Blob store in Vercel → Storage.
- Local development needs none of this: without the variables, files are written to disk.
- If Security & health shows an error: `InvalidAccessKeyId` / `SignatureDoesNotMatch` means a key was
  pasted wrongly; `NoSuchBucket` means `S3_BUCKET` doesn't match the bucket name; `AccessDenied` means the
  token isn't allowed on that bucket.
