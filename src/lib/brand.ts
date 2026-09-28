/**
 * White-label defaults. For a new client, edit this file (or change the values in
 * Admin → Settings, which override these at runtime). See docs/REBRAND.md.
 */
export const BRAND_DEFAULTS = {
  company: {
    name: "Business Hub Computers",
    legalName: "Business-Hub Computers",
    shortName: "BHC",
    tagline: "Quality Technology. Trusted Service.",
    rcNumber: "RC: 3001886",
    about:
      "Business-Hub Computers is a trusted supplier of new and UK-used laptops, computers, IT equipment, and accessories serving individuals, businesses, schools, offices, and organizations in Nigeria.",
    aboutLong:
      "The company is committed to providing quality, reliable, and affordable technology while helping customers choose the right technology for work, business, education and personal use. Products include everyday business laptops, professional computers, high-performance systems, gaming computers, monitors, accessories, printers, projectors, power stations and other IT equipment. Services also include computer repairs, maintenance, software installation, IT consultation, office setup, school setup and CBT centre setup.",
    vision: "To be Nigeria's most trusted technology partner for individuals, businesses and institutions.",
    mission:
      "To provide quality, reliable and affordable technology, backed by honest advice and professional support.",
    values: ["Integrity", "Quality", "Customer first", "Reliability", "Professionalism"],
    logo: "/brand/logo.jpeg",
    logoWidth: 640,
    logoHeight: 170,
    poweredBy: "Fodan Softnet Inc.",
  },
  contact: {
    phone: "+234 803 394 1858",
    phoneHref: "+2348033941858",
    whatsapp: "2348033941858",
    whatsappDisplay: "0803 394 1858",
    email: "businesshubby@gmail.com",
  },
  social: [
    { platform: "YouTube", url: "https://www.youtube.com/@Business-HubComputers" },
    { platform: "TikTok", url: "https://www.tiktok.com/@bizhubb" },
  ],
  locale: {
    currency: "NGN",
    currencySymbol: "₦",
    locale: "en-NG",
    country: "NG",
    timezone: "Africa/Lagos",
  },
  domain: "businesshubcomputers.com",
  orderPrefix: "BHC",
} as const;

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;
