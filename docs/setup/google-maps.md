# Google Maps setup

The site works without a key (it falls back to Google's keyless map embed), but a key uses the official
**Maps Embed API** and removes usage limits.

1. Go to <https://console.cloud.google.com/> and sign in with the business Google account.
2. Top bar → project picker → **New project** → name it `business-hub-website` → **Create**.
3. **Billing**: Menu → Billing → link a billing account (a card is required; the monthly free credit comfortably covers a small business website — the Embed API itself is free).
4. Menu → **APIs & Services → Library** → search and **Enable** both:
   * *Maps Embed API*
   * *Maps JavaScript API* (optional, for future interactive maps)
5. Menu → **APIs & Services → Credentials** → **Create credentials → API key**. Copy the key.
6. Click the new key → **Restrict key**:
   * *Application restrictions* → **Websites** → add
     `http://localhost:3000/*`, `https://*.vercel.app/*`, `https://businesshubcomputers.com/*`, `https://www.businesshubcomputers.com/*`
   * *API restrictions* → **Restrict key** → select *Maps Embed API* (and *Maps JavaScript API*).
   * Save.
7. In Vercel → Project → **Settings → Environment Variables** add
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` = your key (Production + Preview + Development). Redeploy.
8. Check Admin → **Security & health** → Google Maps shows *Connected*.

This is a **browser** key (it is visible in page HTML by design); the referrer restriction is what protects it.
