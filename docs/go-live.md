# Going live: what changed and how to use it

## Payments
Enter Paystack keys in **Admin → Settings → Payments → Paystack keys** — see [setup/paystack.md](setup/paystack.md).

## Products
- The demo products are **placeholders**. As soon as you add your first real product (form or Excel), the untouched placeholders are removed from the shop, carts and wishlists and their stock is zeroed. A placeholder you edited is treated as yours and kept. Nothing is hard-deleted, so reports and history stay intact.
- **Stock follows your sheet.** A number in *Stock quantity* becomes the product's stock, for new and existing products. Leave it blank to keep the current stock. Sales, reservations and refunds adjust stock automatically as before.

## Dropshipping
- Mark a product as **Dropship** on its edit page (*Supply* section) or fill *Dropship partner* in the Excel template.
- Dropship goods are kept out of the normal shop and search. They are listed on **/dropshipping** for signed-in customers; visitors see an explanation and a sign-in prompt. Ordering one without signing in is refused on the server.
- On an order, each dropship line shows **Dropship — order from <partner>** so staff know what to request from the partner.

## Quick sign-in (passkeys)
- Customers and staff can switch on **Quick sign-in** per device under *Security*. It uses the device's fingerprint, face or screen lock.
- On the sign-in page the browser then offers the accounts saved on that device and the person picks one. Nothing is automatic until they switch it on.
- The passkey is tied to the site's address. If the site moves to a new domain, people switch it on again.

## Security settings (Admin → Settings → Security)
- **Staff must use two-factor authentication** is now enforced: staff without 2FA are sent to set it up. Set up your own first; the switch refuses to turn on otherwise.
- **Staff are signed out after (hours)**: default 12.
- Passwords found in known data breaches are refused at sign-up and password change.
- Changing payment keys re-checks the password.

No website can be guaranteed unhackable. Keep 2FA on for every staff account, give each person the least access they need, and review **Security & health** regularly.

## Policies
Warranty, Terms, Privacy, Shipping, Returns, Refund and Cookie pages have fuller default texts (`scripts/policy-texts.ts`). On deploy, a page is updated only if nobody has edited it. They are a starting point, not legal advice: review them, and edit in **Admin → Content → Pages**. Warranty lengths are set per product.

## Local development
The local test database runs on port **5435** (`PGLITE_PORT=5435 PGLITE_DIR=./.data/pglite-dev5 npm run db:local`), and `.env.development.local` points `next dev` at it.
