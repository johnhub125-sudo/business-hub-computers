/**
 * Default policy pages (Markdown). Editable afterwards in Admin → Content → Pages.
 *
 * These are sensible starting texts for a Nigerian computer retailer, not legal advice. The business
 * should have them reviewed, and should change any period or commitment that differs from how it
 * actually trades. Warranty lengths are deliberately not stated here: they are set per product and
 * printed on the product page and the receipt.
 */
const CONTACT = "Call or WhatsApp **+234 803 394 1858**, email **businesshubby@gmail.com**, or open a ticket from the [Support](/support) page.";

const page = (title: string, sections: string[]) => `# ${title}\n\n${sections.join("\n\n")}`;

export const POLICY_PAGES = [
  {
    slug: "warranty",
    title: "Warranty Policy",
    body: page("Warranty Policy", [
      "Every device we sell is tested before it leaves our store, and every sale is backed by a written warranty. This page explains what is covered, what is not, and how to make a claim.",
      "## Your warranty at a glance\n- **Brand-new products** carry the manufacturer's warranty. We help you claim it.\n- **UK-used, refurbished, open-box and pre-owned products** carry the Business Hub Computers warranty.\n- **The length of your warranty** is shown on the product page when you buy and is printed on your receipt. The receipt is your proof of warranty, so please keep it.\n- The warranty starts on the date of delivery or collection.",
      "## What the warranty covers\n- Faults in the hardware that appear during normal use and were not caused by damage or misuse, for example a failed motherboard, screen, keyboard, storage drive, memory or charging circuit.\n- A device that arrives not working, or not matching the description on your receipt.\n- Accessories supplied in the box (such as the charger), for faults present within the warranty period stated for accessories on your receipt.",
      "## What the warranty does not cover\n- Physical damage: cracked or pressure-marked screens, broken hinges or casing, dents, bent ports.\n- Liquid damage, corrosion, or damage from dust, insects, fire or smoke.\n- Electrical damage from power surges, unstable supply, generators without protection, or the wrong charger. We strongly recommend a surge protector or UPS.\n- Software problems: viruses, forgotten passwords, operating-system or application faults, and loss of data. **Please back up your data** — we are not responsible for data on a device handed in for repair.\n- Normal wear of consumable parts: batteries losing capacity with age, keyboard and trackpad wear, printer ink, toner and drums, projector lamps.\n- A device that has been opened, repaired, upgraded or modified by anyone other than our technicians, or whose warranty seal or serial number has been removed or altered.\n- Damage in transit when you arrange your own courier.",
      "## How to make a claim\n1. Contact us as soon as you notice the fault. " + CONTACT + "\n2. Give us your **receipt or order number** and describe the fault. A short video helps.\n3. Bring the device to our store, or send it to us with its charger. We will tell you how.\n4. Our technicians inspect it, normally within 48 hours of receiving it, and tell you the outcome.",
      "## What we will do\n- **Repair** the fault at no charge, or\n- **Replace** the device with the same model or one of equal or better specification if it cannot be repaired, or\n- **Refund** you under our [Refund Policy](/refund-policy) if neither is possible.\n\nA repaired or replaced device keeps the remainder of the original warranty period.",
      "## Faults outside the warranty\nIf the fault is not covered, or the warranty has ended, we can still repair the device. We will give you a quote first and do nothing until you agree.",
      "## Dropship products\nProducts marked **Dropship** are supplied by a partner company but are sold and warranted by Business Hub Computers. Claims are made to us in exactly the same way; a repair or replacement may take longer because the partner is involved.",
      "## Your legal rights\nThis warranty is in addition to your rights under the Federal Competition and Consumer Protection Act 2018 and does not limit them.",
    ]),
  },
  {
    slug: "terms",
    title: "Terms and Conditions",
    body: page("Terms and Conditions", [
      "These terms apply when you use this website and when you buy from Business Hub Computers (RC: 3001886), Ibadan, Oyo State, Nigeria. By placing an order you agree to them. Please read them with our [Privacy](/privacy), [Shipping](/shipping), [Returns](/returns), [Refund](/refund-policy) and [Warranty](/warranty) policies, which form part of these terms.",
      "## 1. Your account\n- You need an account to check out. Give accurate details and keep them up to date.\n- Keep your password private. You are responsible for activity on your account; tell us at once if you think someone else has used it.\n- We may suspend an account that is used for fraud, abuse or in breach of these terms.",
      "## 2. Products and descriptions\n- We describe products and their condition (Brand New, UK Used, Refurbished, Open Box, Pre-Owned) as accurately as we can. Used items may show light cosmetic marks that do not affect how they work.\n- Pictures are for illustration. Some are generated illustrations or manufacturer images of the model and may differ slightly from the unit you receive; the written specification is what counts.\n- Stock shown on the site is updated continuously but is not a guarantee until your order is confirmed.",
      "## 3. Prices\n- Prices are in Nigerian Naira (₦). VAT at the current rate and delivery charges are added at checkout and shown before you pay.\n- If a price is obviously wrong we may cancel the order and refund you in full.",
      "## 4. Orders\n- Your order is an offer to buy. It is accepted when your payment has been confirmed and we send you an order confirmation.\n- Items in your cart are held for a limited time during checkout and are released if payment is not completed.\n- We may refuse or cancel an order, for example if an item is unavailable, payment cannot be verified, or we suspect fraud. Any money paid is refunded.",
      "## 5. Payment\n- **Card, bank and USSD payments** are processed by Paystack. We never see or store your card number, CVV, PIN or OTP.\n- **Bank transfers** must be made to the company accounts shown at checkout, quoting your order number. The order is processed after our finance team confirms the money has arrived.\n- We will never ask you to pay into a personal account or to share your PIN, OTP or password.",
      "## 6. Delivery and collection\nDelivery is described in our [Shipping Policy](/shipping). Delivery times are estimates. Responsibility for the goods passes to you when they are delivered to you, collected by you, or handed to a courier you arranged.",
      "## 7. Dropship products\nProducts marked **Dropship** are supplied and shipped by a partner company after your payment is confirmed. They are available to signed-in customers, take longer to deliver (the usual time is shown on the product), and are sold, receipted and warranted by Business Hub Computers.",
      "## 8. Returns, refunds and warranty\nSee our [Returns](/returns), [Refund](/refund-policy) and [Warranty](/warranty) policies.",
      "## 9. Using this website\nYou agree not to misuse the site: no attempts to break its security, copy it in bulk, interfere with other customers, or place false orders or reviews. Reviews must be honest and about a product you bought.",
      "## 10. Our responsibility to you\nWe are responsible for supplying goods that match their description and work as they should. To the extent the law allows, we are not responsible for indirect losses such as lost data, lost profit or business interruption. Nothing in these terms removes rights you have under Nigerian consumer law.",
      "## 11. Changes\nWe may update these terms. The version on this page when you place your order applies to that order.",
      "## 12. Law and disputes\nThese terms are governed by the laws of the Federal Republic of Nigeria. Please contact us first so we can put things right; if we cannot agree, the courts of Oyo State have jurisdiction.",
      "## Contact\n" + CONTACT,
    ]),
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    body: page("Privacy Policy", [
      "Business Hub Computers respects your privacy and handles personal data in line with the Nigeria Data Protection Act 2023 (NDPA). This policy explains what we collect, why, and the choices you have.",
      "## What we collect\n- **Account details:** your name, email address, phone and WhatsApp number.\n- **Order details:** delivery addresses, the products you buy, payments and receipts, and messages about your orders.\n- **Support:** tickets, product questions, reviews and any files you send us (such as proof of a bank transfer).\n- **Technical data:** the device and browser you use, your IP address and security events such as sign-ins, used to protect accounts and prevent fraud.",
      "## What we do not collect\nWe never see or store your card number, CVV, PIN or OTP. Card payments are handled entirely by Paystack. If you use quick sign-in, your fingerprint or face never leaves your device.",
      "## Why we use your data\n- To process and deliver your orders and send receipts and updates (performance of our contract with you).\n- To provide warranty and support.\n- To keep the site and your account secure and to prevent fraud (our legitimate interest).\n- To keep financial records the law requires.\n- To send offers by email or WhatsApp **only if you agreed** — you can unsubscribe at any time.",
      "## Who we share it with\nOnly organisations that help us serve you, and only what they need: Paystack (payments), delivery companies and agents (your name, phone and address), dropship partners for goods they ship to you, and the providers that host this website and send our emails. We do not sell your data.",
      "## How long we keep it\nAccount data is kept while your account is open. Order and payment records are kept for the period required by tax and accounting law even if you close your account.",
      "## Keeping it safe\nPasswords are stored only in hashed form. Sensitive credentials are encrypted. Staff access is limited by role and recorded. Connections to this site are encrypted.",
      "## Your rights\nYou may ask for a copy of your data, ask us to correct it, object to marketing, or ask us to delete your account. Use the **Security & privacy** page in your account or contact us. You may also complain to the Nigeria Data Protection Commission.",
      "## Cookies\nSee our [Cookie Policy](/cookies).",
      "## Contact\n" + CONTACT,
    ]),
  },
  {
    slug: "shipping",
    title: "Shipping Policy",
    body: page("Shipping Policy", [
      "We deliver to all 36 states and the FCT, by door delivery or by collection from a motor park or agent near you. You can also collect from our store in Ibadan.",
      "## Cost\nThe delivery charge depends on your state and city and is calculated automatically at checkout, before you pay.",
      "## When your order is sent\nOrders are processed once payment is confirmed. Card payments confirm immediately; bank transfers are confirmed by our finance team.",
      "## Estimated delivery times\n- **Ibadan:** same or next day.\n- **South-West:** 1–3 working days.\n- **Other regions:** 2–7 working days.\n- **Dropship products:** shipped by our partner; the usual time is shown on each product.\n\nThese are estimates. Weather, road conditions, public holidays and events outside our control can cause delays; we will keep you informed.",
      "## Motor-park and agent collection\nOur agent contacts you by phone or WhatsApp with the collection point and expected date. Please bring a valid ID and your order number.",
      "## Tracking\nEvery order has a tracking number. Follow it on the [Track Order](/track-order) page or in your account.",
      "## When you receive your order\nCheck the package before the courier leaves where you can. If it arrives damaged, or something is missing or wrong, tell us **within 48 hours of delivery** — see our [Returns Policy](/returns).",
      "## If delivery fails\nIf we cannot reach you or the address is wrong, we will contact you to rearrange. A second delivery may carry an extra charge.",
    ]),
  },
  {
    slug: "returns",
    title: "Returns Policy",
    body: page("Returns Policy", [
      "We want you to be happy with what you buy. If something is wrong, tell us quickly and we will put it right.",
      "## When you can return an item\n- It arrived **faulty or damaged**.\n- It is **not what you ordered** or does not match its description.\n- Something is **missing** from the box.\n\nPlease report the problem **within 48 hours of delivery or collection**. Faults that appear later are handled under the [Warranty Policy](/warranty).",
      "## Conditions\n- Return the item with all accessories, manuals, free gifts and the original packaging where possible.\n- The item must not have physical or liquid damage that happened after delivery.\n- Please remove your passwords and accounts (for example Windows, Apple ID, Google) and back up your data before sending a device back.",
      "## Items that cannot be returned\n- Items damaged through misuse, drops, liquid or power surges.\n- Software, licence keys and items with a broken seal that are not faulty.\n- Consumables that have been opened or used, such as ink and toner.\n- Items specially ordered or configured for you, unless they are faulty.",
      "## How to return\n1. " + CONTACT + "\n2. Give your order number and describe the problem. Photos or a short video help.\n3. We will tell you how to send the item back or arrange collection. If the fault is ours, we pay the return delivery.\n4. Our technicians inspect the item, normally within 48 hours of receiving it.",
      "## What happens next\nDepending on the problem and what you prefer, we will **repair**, **replace** or **refund** the item. Refunds follow our [Refund Policy](/refund-policy).",
      "## Dropship products\nThe same rules apply. Returns are made to Business Hub Computers, not to the partner company.",
    ]),
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    body: page("Refund Policy", [
      "A refund is given when a return is approved under our [Returns Policy](/returns), when we cannot supply an item you paid for, or when an order is cancelled before it is sent.",
      "## How refunds are paid\nRefunds go back to the **original payment method**:\n- **Card, bank or USSD payments through Paystack** are refunded through Paystack to the card or account you paid with.\n- **Bank transfers** are refunded to the account the money came from.\n\nFor your protection we do not refund to a different person's account.",
      "## How long it takes\n- **Paystack refunds** usually reflect within **5–10 working days**, depending on your bank.\n- **Bank transfer refunds** are paid within **3 working days** of approval.\n\nWe send you a message when the refund is issued. If it has not arrived after these times, contact us with your order number.",
      "## Partial refunds\nWhere only part of an order is affected, we refund that part. A partial refund may also be offered if you choose to keep an item with a minor issue.",
      "## Delivery charges\nIf the fault is ours, the delivery charge is refunded too. If you cancel after an order has been sent, or return an item that is not faulty where we have agreed to accept it, the delivery cost is not refunded.",
      "## Cancelling an order\nYou can cancel free of charge before your order is sent. Contact us as soon as possible with your order number.",
      "## Contact\n" + CONTACT,
    ]),
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    body: page("Cookie Policy", [
      "Cookies are small files a website stores in your browser. We use as few as we can.",
      "## Essential cookies\nThese keep you signed in, remember your cart and protect your account and our checkout against fraud. The site cannot work without them, so they are always on.",
      "## Analytics\nWe use privacy-friendly analytics that count visits and measure page speed without identifying you personally. You can decline these in the cookie banner; the site works the same either way.",
      "## What we do not use\nWe do not use advertising cookies and we do not sell data about your browsing.",
      "## Managing cookies\nYou can clear or block cookies in your browser settings. Blocking essential cookies will sign you out and empty your cart.",
      "See also our [Privacy Policy](/privacy).",
    ]),
  },
];
