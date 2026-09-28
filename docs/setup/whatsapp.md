# WhatsApp (optional)

Without credentials the site uses click-to-chat links (`wa.me/2348033941858`) everywhere — nothing is faked.

To send automated order updates:
1. Create a Meta Business account and a WhatsApp Business **Cloud API** app at <https://developers.facebook.com>.
2. Add and verify the business phone number; create a permanent **System User token** with `whatsapp_business_messaging`.
3. Set `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_API_TOKEN` (and optionally `WHATSAPP_API_URL`) in Vercel.
4. Business-initiated messages outside a 24-hour customer session require **approved message templates** in Meta Business Manager; the app currently sends plain text (works inside open sessions). Add templates before relying on it for cold notifications.
