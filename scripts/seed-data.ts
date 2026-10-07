/** Development/demo catalogue & content. Prices are in NAIRA here and converted to kobo on insert. */
import { POLICY_PAGES } from "./policy-texts";

export const CONDITIONS = [
  { name: "Brand New", slug: "brand-new", isCollection: true, sortOrder: 1, description: "Factory-sealed with full manufacturer warranty." },
  { name: "UK Used", slug: "uk-used", isCollection: true, sortOrder: 2, description: "Premium grade-A UK-used devices, tested and certified by our technicians." },
  { name: "Refurbished", slug: "refurbished", isCollection: false, sortOrder: 3, description: "Professionally restored to full working condition." },
  { name: "Open Box", slug: "open-box", isCollection: false, sortOrder: 4, description: "Unused items with opened packaging." },
  { name: "Pre-Owned", slug: "pre-owned", isCollection: false, sortOrder: 5, description: "Locally used, inspected and tested." },
];

export const CATEGORIES = [
  { name: "Computers", slug: "computers", icon: "laptop", sortOrder: 1, children: [
    { name: "Business Laptops", slug: "business-laptops", sortOrder: 1 },
    { name: "Gaming Systems", slug: "gaming-systems", sortOrder: 2 },
    { name: "Desktops", slug: "desktops", sortOrder: 3 },
    { name: "Workstations", slug: "workstations", sortOrder: 4 },
  ] },
  { name: "Monitors", slug: "monitors", icon: "monitor", sortOrder: 2, children: [] },
  { name: "Accessories", slug: "accessories", icon: "mouse", sortOrder: 3, children: [] },
  { name: "Printers", slug: "printers", icon: "printer", sortOrder: 4, children: [] },
  { name: "Projectors", slug: "projectors", icon: "projector", sortOrder: 5, children: [] },
  { name: "Power Station", slug: "power-station", icon: "battery", sortOrder: 6, children: [] },
];

export const BRANDS = ["HP", "Dell", "Lenovo", "Apple", "Asus", "Acer", "Logitech", "Canon", "Epson", "BenQ", "EcoFlow", "Bluetti", "APC", "Kingston", "Samsung"];

type V = { name: string; attributes: Record<string, string>; price: number; discountPrice?: number; stock: number };
export type SeedProduct = {
  name: string;
  brand: string;
  category: string;
  subcategory?: string;
  condition: string;
  price: number;
  discountPrice?: number;
  purchasePrice: number;
  stock: number;
  image: string;
  images?: string[];
  short: string;
  description: string;
  specs: Record<string, string>;
  warranty: string;
  warrantyMonths: number;
  flags?: Partial<Record<"isFeatured" | "isDeal" | "isNewArrival" | "isBestSeller" | "isClearance" | "isRecommended" | "isTrending", boolean>>;
  variants?: V[];
  weightGrams?: number;
};

const lap = (cpu: string, ram: string, ssd: string, screen: string, gpu = "Integrated graphics", os = "Windows 11 Pro") => ({
  Processor: cpu,
  RAM: ram,
  Storage: ssd,
  Screen: screen,
  Graphics: gpu,
  "Operating system": os,
});

export const PRODUCTS: SeedProduct[] = [
  // ───────────── Brand new computers ─────────────
  {
    name: "HP ProBook 450 G10 Business Laptop", brand: "HP", category: "computers", subcategory: "business-laptops", condition: "brand-new",
    price: 1_150_000, discountPrice: 1_089_000, purchasePrice: 960_000, stock: 8, image: "laptop-1",
    short: "13th-gen Intel Core i5, 16GB RAM, 512GB SSD — the dependable office workhorse.",
    description: "Built for busy professionals, the ProBook 450 G10 pairs a 13th-generation Intel Core i5 with fast DDR4 memory and NVMe storage. A full-size keyboard with numeric keypad, HD camera with privacy shutter and business-grade security make it ideal for accounting, admin and field teams.",
    specs: { ...lap("Intel Core i5-1335U (up to 4.6GHz, 10 cores)", "16GB DDR4", "512GB NVMe SSD", '15.6" FHD IPS anti-glare'), Battery: "51Wh, fast charge", Weight: "1.79kg", Ports: "USB-C, 2× USB-A, HDMI, RJ-45" },
    warranty: "1 year HP manufacturer warranty", warrantyMonths: 12, flags: { isFeatured: true, isBestSeller: true, isDeal: true }, weightGrams: 1790,
    variants: [
      { name: "i5 / 8GB / 256GB", attributes: { RAM: "8GB", Storage: "256GB SSD", Processor: "Core i5-1335U" }, price: 985_000, stock: 5 },
      { name: "i5 / 16GB / 512GB", attributes: { RAM: "16GB", Storage: "512GB SSD", Processor: "Core i5-1335U" }, price: 1_150_000, discountPrice: 1_089_000, stock: 8 },
      { name: "i7 / 16GB / 512GB", attributes: { RAM: "16GB", Storage: "512GB SSD", Processor: "Core i7-1355U" }, price: 1_390_000, stock: 3 },
    ],
  },
  {
    name: "Dell Latitude 5540 Laptop", brand: "Dell", category: "computers", subcategory: "business-laptops", condition: "brand-new",
    price: 1_280_000, purchasePrice: 1_090_000, stock: 5, image: "laptop-2",
    short: "Intel Core i7, 16GB RAM, 512GB SSD with enterprise security.",
    description: "Dell's Latitude 5540 is engineered for mobile professionals, with Intel vPro options, a spill-resistant keyboard, and ExpressCharge that gets you to 80% in about an hour.",
    specs: { ...lap("Intel Core i7-1355U", "16GB DDR4", "512GB NVMe SSD", '15.6" FHD'), Battery: "54Wh ExpressCharge", Weight: "1.64kg" },
    warranty: "1 year Dell warranty", warrantyMonths: 12, flags: { isFeatured: true, isNewArrival: true }, weightGrams: 1640,
  },
  {
    name: "Lenovo ThinkPad E14 Gen 5", brand: "Lenovo", category: "computers", subcategory: "business-laptops", condition: "brand-new",
    price: 1_045_000, discountPrice: 995_000, purchasePrice: 880_000, stock: 6, image: "laptop-3",
    short: "Legendary ThinkPad keyboard, Core i5, 16GB, 512GB SSD, 14\" WUXGA.",
    description: "The ThinkPad E14 Gen 5 brings the famous ThinkPad reliability and keyboard to small businesses, with a taller 16:10 display and MIL-STD tested durability.",
    specs: { ...lap("Intel Core i5-1335U", "16GB DDR4", "512GB SSD", '14" WUXGA 16:10'), Weight: "1.41kg" },
    warranty: "1 year Lenovo warranty", warrantyMonths: 12, flags: { isDeal: true, isRecommended: true }, weightGrams: 1410,
  },
  {
    name: "Apple MacBook Air 13\" M3", brand: "Apple", category: "computers", subcategory: "business-laptops", condition: "brand-new",
    price: 1_850_000, purchasePrice: 1_620_000, stock: 4, image: "laptop-1",
    short: "Apple M3 chip, 8GB unified memory, 256GB SSD, 18-hour battery.",
    description: "Strikingly thin and fast, the MacBook Air with M3 handles work, study and creative projects with ease while staying silent — it has no fan.",
    specs: { Processor: "Apple M3 (8-core CPU, 10-core GPU)", RAM: "8GB unified memory", Storage: "256GB SSD", Screen: '13.6" Liquid Retina', Graphics: "10-core GPU", "Operating system": "macOS", Battery: "Up to 18 hours", Weight: "1.24kg" },
    warranty: "1 year Apple limited warranty", warrantyMonths: 12, flags: { isFeatured: true, isNewArrival: true, isTrending: true }, weightGrams: 1240,
    variants: [
      { name: "8GB / 256GB", attributes: { RAM: "8GB", Storage: "256GB SSD", Colour: "Midnight" }, price: 1_850_000, stock: 4 },
      { name: "16GB / 512GB", attributes: { RAM: "16GB", Storage: "512GB SSD", Colour: "Starlight" }, price: 2_390_000, stock: 2 },
    ],
  },
  {
    name: "HP Victus 15 Gaming Laptop (RTX 4050)", brand: "HP", category: "computers", subcategory: "gaming-systems", condition: "brand-new",
    price: 1_480_000, discountPrice: 1_399_000, purchasePrice: 1_250_000, stock: 3, image: "gaming-1",
    short: "Core i5-13420H, RTX 4050 6GB, 16GB RAM, 144Hz display.",
    description: "Serious gaming performance without the serious price. NVIDIA RTX 4050 graphics, a 144Hz panel and improved cooling keep games smooth and responsive.",
    specs: { ...lap("Intel Core i5-13420H", "16GB DDR4", "512GB NVMe SSD", '15.6" FHD 144Hz', "NVIDIA GeForce RTX 4050 6GB", "Windows 11 Home"), Weight: "2.29kg" },
    warranty: "1 year HP warranty", warrantyMonths: 12, flags: { isFeatured: true, isDeal: true, isTrending: true }, weightGrams: 2290,
  },
  {
    name: "Lenovo LOQ 15 Gaming Laptop (RTX 4060)", brand: "Lenovo", category: "computers", subcategory: "gaming-systems", condition: "brand-new",
    price: 1_720_000, purchasePrice: 1_480_000, stock: 2, image: "gaming-2",
    short: "Ryzen 7 7840HS, RTX 4060 8GB, 16GB DDR5, 1TB SSD.",
    description: "The LOQ 15 delivers high-refresh gaming and creator performance with DDR5 memory, a 1TB SSD and Lenovo AI Engine+ tuning.",
    specs: { ...lap("AMD Ryzen 7 7840HS", "16GB DDR5", "1TB NVMe SSD", '15.6" FHD 144Hz', "NVIDIA GeForce RTX 4060 8GB", "Windows 11 Home") },
    warranty: "1 year Lenovo warranty", warrantyMonths: 12, flags: { isNewArrival: true }, weightGrams: 2400,
  },
  {
    name: "HP Pro Tower 290 G9 Desktop", brand: "HP", category: "computers", subcategory: "desktops", condition: "brand-new",
    price: 690_000, purchasePrice: 575_000, stock: 10, image: "desktop-1",
    short: "Core i5-12400, 8GB RAM, 512GB SSD — ideal for offices and CBT centres.",
    description: "An affordable, reliable desktop for offices, schools and CBT centres. Easy to service, energy efficient and ready for Windows 11.",
    specs: { Processor: "Intel Core i5-12400", RAM: "8GB DDR4", Storage: "512GB SSD", Graphics: "Intel UHD 730", "Operating system": "Windows 11 Pro", "Form factor": "Micro tower" },
    warranty: "1 year HP warranty", warrantyMonths: 12, flags: { isRecommended: true, isBestSeller: true }, weightGrams: 4800,
  },
  {
    name: "Dell OptiPlex 7010 SFF Desktop", brand: "Dell", category: "computers", subcategory: "desktops", condition: "brand-new",
    price: 820_000, purchasePrice: 690_000, stock: 6, image: "desktop-2",
    short: "Compact business desktop, Core i5-13500, 16GB, 512GB.",
    description: "Small form factor OptiPlex that saves desk space and energy while delivering 13th-gen performance.",
    specs: { Processor: "Intel Core i5-13500", RAM: "16GB DDR4", Storage: "512GB SSD", "Operating system": "Windows 11 Pro", "Form factor": "Small form factor" },
    warranty: "1 year Dell warranty", warrantyMonths: 12, weightGrams: 4200,
  },
  // ───────────── UK used computers ─────────────
  {
    name: "HP EliteBook 840 G6 (UK Used)", brand: "HP", category: "computers", subcategory: "business-laptops", condition: "uk-used",
    price: 420_000, discountPrice: 395_000, purchasePrice: 320_000, stock: 12, image: "laptop-2",
    short: "Core i5 8th Gen, 16GB RAM, 256GB SSD, 14\" FHD — grade A.",
    description: "A premium aluminium business laptop at a fraction of the new price. Every unit is tested, cleaned and certified by our technicians and comes with a fresh Windows installation.",
    specs: { ...lap("Intel Core i5-8365U", "16GB DDR4", "256GB SSD", '14" FHD IPS'), Condition: "Grade A — minimal signs of use", Battery: "Tested, 80%+ health" },
    warranty: "3 months Business Hub warranty", warrantyMonths: 3, flags: { isFeatured: true, isBestSeller: true, isDeal: true },
    variants: [
      { name: "8GB / 256GB", attributes: { RAM: "8GB", Storage: "256GB SSD" }, price: 380_000, stock: 6 },
      { name: "16GB / 256GB", attributes: { RAM: "16GB", Storage: "256GB SSD" }, price: 420_000, discountPrice: 395_000, stock: 12 },
      { name: "16GB / 512GB", attributes: { RAM: "16GB", Storage: "512GB SSD" }, price: 460_000, stock: 4 },
    ],
  },
  {
    name: "Dell Latitude 7490 (UK Used)", brand: "Dell", category: "computers", subcategory: "business-laptops", condition: "uk-used",
    price: 365_000, purchasePrice: 275_000, stock: 9, image: "laptop-3",
    short: "Core i7 8th Gen, 16GB RAM, 512GB SSD, backlit keyboard.",
    description: "Slim, light and powerful — the Latitude 7490 remains a favourite of banks and consultants. Tested and certified.",
    specs: { ...lap("Intel Core i7-8650U", "16GB DDR4", "512GB SSD", '14" FHD'), Condition: "Grade A" },
    warranty: "3 months Business Hub warranty", warrantyMonths: 3, flags: { isDeal: true },
  },
  {
    name: "Lenovo ThinkPad T480 (UK Used)", brand: "Lenovo", category: "computers", subcategory: "business-laptops", condition: "uk-used",
    price: 310_000, purchasePrice: 230_000, stock: 15, image: "laptop-1",
    short: "Core i5 8th Gen, 8GB RAM, 256GB SSD, dual batteries.",
    description: "Famous for its durability and hot-swappable dual battery system — perfect for students and field staff.",
    specs: { ...lap("Intel Core i5-8350U", "8GB DDR4", "256GB SSD", '14" FHD'), Condition: "Grade A" },
    warranty: "3 months Business Hub warranty", warrantyMonths: 3, flags: { isBestSeller: true, isRecommended: true },
  },
  {
    name: "Apple MacBook Pro 13\" 2019 (UK Used)", brand: "Apple", category: "computers", subcategory: "business-laptops", condition: "uk-used",
    price: 590_000, purchasePrice: 470_000, stock: 4, image: "laptop-2",
    short: "Core i5, 8GB, 256GB SSD, Touch Bar, Retina display.",
    description: "A clean, UK-used MacBook Pro with Retina display and Touch Bar. Battery health and keyboard fully tested.",
    specs: { Processor: "Intel Core i5 (quad-core)", RAM: "8GB", Storage: "256GB SSD", Screen: '13.3" Retina', "Operating system": "macOS", Condition: "Grade A" },
    warranty: "3 months Business Hub warranty", warrantyMonths: 3, flags: { isTrending: true },
  },
  {
    name: "Dell Precision 5530 Workstation (UK Used)", brand: "Dell", category: "computers", subcategory: "workstations", condition: "uk-used",
    price: 680_000, purchasePrice: 540_000, stock: 3, image: "laptop-3",
    short: "Core i7 8th Gen, 32GB RAM, 512GB SSD, NVIDIA Quadro P1000.",
    description: "Mobile workstation for engineers, architects and designers — ISV-certified Quadro graphics in a slim chassis.",
    specs: { ...lap("Intel Core i7-8850H", "32GB DDR4", "512GB SSD", '15.6" FHD', "NVIDIA Quadro P1000 4GB") },
    warranty: "3 months Business Hub warranty", warrantyMonths: 3, flags: { isRecommended: true },
  },
  {
    name: "HP EliteDesk 800 G4 SFF (UK Used)", brand: "HP", category: "computers", subcategory: "desktops", condition: "uk-used",
    price: 235_000, purchasePrice: 170_000, stock: 25, image: "desktop-3",
    short: "Core i5 8th Gen, 8GB RAM, 256GB SSD — bulk-ready for labs.",
    description: "Compact and reliable desktops that we supply in bulk for schools, offices and CBT centres. Volume pricing available.",
    specs: { Processor: "Intel Core i5-8500", RAM: "8GB DDR4", Storage: "256GB SSD", "Operating system": "Windows 11 Pro", Condition: "Grade A" },
    warranty: "3 months Business Hub warranty", warrantyMonths: 3, flags: { isBestSeller: true, isDeal: true },
  },
  {
    name: "Custom Gaming PC — Ryzen 5 / RTX 3060 (UK Used)", brand: "Asus", category: "computers", subcategory: "gaming-systems", condition: "uk-used",
    price: 950_000, purchasePrice: 780_000, stock: 2, image: "gaming-3",
    short: "Ryzen 5 5600X, RTX 3060 12GB, 16GB RAM, 1TB NVMe, RGB case.",
    description: "A tested UK-used gaming tower that runs modern titles at high settings in 1080p. Stress-tested before sale.",
    specs: { Processor: "AMD Ryzen 5 5600X", RAM: "16GB DDR4 3200", Storage: "1TB NVMe SSD", Graphics: "NVIDIA RTX 3060 12GB", "Power supply": "650W 80+ Bronze" },
    warranty: "3 months Business Hub warranty", warrantyMonths: 3, flags: { isTrending: true },
  },
  // ───────────── Monitors ─────────────
  { name: "Dell P2423H 24\" Monitor", brand: "Dell", category: "monitors", condition: "brand-new", price: 245_000, purchasePrice: 198_000, stock: 10, image: "monitor-1", short: '24" FHD IPS, height adjustable, USB hub.', description: "Comfort-focused professional monitor with ComfortView Plus and full ergonomic stand.", specs: { Size: '23.8"', Resolution: "1920×1080", Panel: "IPS", Ports: "HDMI, DP, VGA, USB" }, warranty: "3 years Dell warranty", warrantyMonths: 36, flags: { isNewArrival: true } },
  { name: "HP M24f 24\" FHD Monitor", brand: "HP", category: "monitors", condition: "brand-new", price: 165_000, discountPrice: 152_000, purchasePrice: 130_000, stock: 14, image: "monitor-2", short: "Ultra-slim 24\" IPS with AMD FreeSync.", description: "Stylish, eye-friendly display with 75Hz refresh — great for home and office.", specs: { Size: '23.8"', Resolution: "1920×1080", Refresh: "75Hz", Ports: "HDMI, VGA" }, warranty: "1 year HP warranty", warrantyMonths: 12, flags: { isDeal: true } },
  { name: "HP EliteDisplay E243 24\" (UK Used)", brand: "HP", category: "monitors", condition: "uk-used", price: 85_000, purchasePrice: 60_000, stock: 30, image: "monitor-3", short: '24" IPS, thin bezels, pivot stand.', description: "Grade-A UK-used business monitor, tested for dead pixels.", specs: { Size: '23.8"', Resolution: "1920×1080", Panel: "IPS" }, warranty: "1 month Business Hub warranty", warrantyMonths: 1, flags: { isBestSeller: true } },
  { name: "Dell P2419H 24\" (UK Used)", brand: "Dell", category: "monitors", condition: "uk-used", price: 90_000, purchasePrice: 64_000, stock: 18, image: "monitor-1", short: '24" FHD IPS, fully adjustable stand.', description: "A trusted office monitor, tested and cleaned.", specs: { Size: '23.8"', Resolution: "1920×1080" }, warranty: "1 month Business Hub warranty", warrantyMonths: 1 },
  // ───────────── Accessories ─────────────
  { name: "Logitech MK270 Wireless Keyboard & Mouse", brand: "Logitech", category: "accessories", condition: "brand-new", price: 32_000, purchasePrice: 24_000, stock: 40, image: "keyboard-1", short: "Reliable 2.4GHz wireless combo with long battery life.", description: "Full-size keyboard with media keys and a comfortable mouse, one tiny receiver.", specs: { Connection: "2.4GHz USB receiver", Battery: "Up to 36 months (keyboard)" }, warranty: "1 year", warrantyMonths: 12, flags: { isBestSeller: true } },
  { name: "Logitech H390 USB Headset", brand: "Logitech", category: "accessories", condition: "brand-new", price: 38_500, purchasePrice: 29_000, stock: 25, image: "headset-1", short: "Noise-cancelling mic, in-line controls — perfect for calls.", description: "Comfortable USB headset for Zoom, Teams and online classes.", specs: { Connection: "USB-A", Microphone: "Noise-cancelling" }, warranty: "1 year", warrantyMonths: 12, flags: { isNewArrival: true } },
  { name: "Kingston NV2 1TB NVMe SSD", brand: "Kingston", category: "accessories", condition: "brand-new", price: 78_000, purchasePrice: 61_000, stock: 20, image: "accessory-2", short: "Upgrade to fast PCIe 4.0 storage.", description: "Up to 3,500MB/s reads — the easiest upgrade for an older laptop.", specs: { Capacity: "1TB", Interface: "PCIe 4.0 NVMe", "Form factor": "M.2 2280" }, warranty: "3 years", warrantyMonths: 36 },
  { name: "HP 65W USB-C Laptop Charger", brand: "HP", category: "accessories", condition: "brand-new", price: 35_000, purchasePrice: 25_000, stock: 30, image: "accessory-1", short: "Original HP 65W USB-C power adapter.", description: "Genuine charger compatible with most HP USB-C laptops.", specs: { Output: "65W", Connector: "USB-C" }, warranty: "6 months", warrantyMonths: 6 },
  { name: "HP USB-C Dock G5 (UK Used)", brand: "HP", category: "accessories", condition: "uk-used", price: 55_000, purchasePrice: 38_000, stock: 12, image: "accessory-3", short: "One cable for power, displays, network and USB.", description: "Turn your laptop into a full desk setup. Tested and supplied with power adapter.", specs: { Ports: "2× DP, HDMI, RJ-45, 4× USB", Power: "Up to 100W" }, warranty: "1 month", warrantyMonths: 1, flags: { isClearance: true } },
  // ───────────── Printers ─────────────
  { name: "HP LaserJet Pro M404dn Printer", brand: "HP", category: "printers", condition: "brand-new", price: 465_000, purchasePrice: 390_000, stock: 5, image: "printer-1", short: "Fast mono laser with duplex and network printing.", description: "Up to 38 pages per minute with automatic two-sided printing — built for busy offices.", specs: { Type: "Mono laser", Speed: "38 ppm", Duplex: "Automatic", Connectivity: "Ethernet, USB" }, warranty: "1 year HP warranty", warrantyMonths: 12, flags: { isFeatured: true } },
  { name: "Canon PIXMA G3411 Ink Tank Printer", brand: "Canon", category: "printers", condition: "brand-new", price: 198_000, discountPrice: 185_000, purchasePrice: 160_000, stock: 8, image: "printer-2", short: "Print, scan & copy with ultra-low cost refillable ink.", description: "Wireless all-in-one ideal for schools and small offices printing in high volumes.", specs: { Type: "Ink tank all-in-one", Functions: "Print, scan, copy", Connectivity: "Wi-Fi, USB" }, warranty: "1 year", warrantyMonths: 12, flags: { isDeal: true } },
  { name: "HP LaserJet Pro M402dn (UK Used)", brand: "HP", category: "printers", condition: "uk-used", price: 185_000, purchasePrice: 130_000, stock: 6, image: "printer-3", short: "Reliable duplex mono laser, tested with page count report.", description: "Grade-A UK-used laser printer supplied with a working toner.", specs: { Type: "Mono laser", Speed: "38 ppm", Duplex: "Automatic" }, warranty: "1 month", warrantyMonths: 1 },
  // ───────────── Projectors ─────────────
  { name: "Epson EB-E01 XGA Projector", brand: "Epson", category: "projectors", condition: "brand-new", price: 385_000, purchasePrice: 320_000, stock: 4, image: "projector-1", short: "3,300 lumens, bright colour for classrooms and meetings.", description: "3LCD technology delivers equally bright colour and white light output.", specs: { Brightness: "3,300 lumens", Resolution: "XGA 1024×768", Inputs: "HDMI, VGA" }, warranty: "1 year", warrantyMonths: 12, flags: { isRecommended: true } },
  { name: "BenQ MS560 SVGA Projector", brand: "BenQ", category: "projectors", condition: "brand-new", price: 330_000, purchasePrice: 270_000, stock: 3, image: "projector-2", short: "4,000 lumens business projector with long lamp life.", description: "High-brightness projector for lecture halls and churches.", specs: { Brightness: "4,000 lumens", Resolution: "SVGA", "Lamp life": "Up to 10,000 hours" }, warranty: "1 year", warrantyMonths: 12, flags: { isNewArrival: true } },
  { name: "Epson EB-X41 Projector (UK Used)", brand: "Epson", category: "projectors", condition: "uk-used", price: 165_000, purchasePrice: 115_000, stock: 5, image: "projector-3", short: "3,600 lumens, tested lamp hours.", description: "UK-used Epson projector — lamp hours checked and reported.", specs: { Brightness: "3,600 lumens", Resolution: "XGA" }, warranty: "1 month", warrantyMonths: 1, flags: { isClearance: true } },
  // ───────────── Power stations ─────────────
  { name: "EcoFlow River 2 Pro Power Station", brand: "EcoFlow", category: "power-station", condition: "brand-new", price: 720_000, purchasePrice: 610_000, stock: 4, image: "power-1", short: "768Wh LiFePO4, 800W output, charges to 100% in 70 minutes.", description: "Keep laptops, routers, fans and TVs running through outages. Long-life LiFePO4 battery rated for 3,000+ cycles.", specs: { Capacity: "768Wh", Output: "800W (X-Boost 1600W)", Battery: "LiFePO4, 3,000+ cycles", Solar: "Up to 220W" }, warranty: "5 years EcoFlow warranty", warrantyMonths: 60, flags: { isFeatured: true, isTrending: true } },
  { name: "Bluetti EB70S Portable Power Station", brand: "Bluetti", category: "power-station", condition: "brand-new", price: 540_000, discountPrice: 499_000, purchasePrice: 440_000, stock: 5, image: "power-2", short: "716Wh LiFePO4 with 800W pure sine wave inverter.", description: "Compact and quiet solar-ready power for home offices.", specs: { Capacity: "716Wh", Output: "800W", Battery: "LiFePO4" }, warranty: "2 years", warrantyMonths: 24, flags: { isDeal: true } },
  { name: "APC Smart-UPS 1500VA (UK Used)", brand: "APC", category: "power-station", condition: "uk-used", price: 260_000, purchasePrice: 180_000, stock: 6, image: "ups-1", short: "Line-interactive UPS with new batteries fitted.", description: "Protect servers and workstations from outages and surges. Supplied with brand-new batteries.", specs: { Capacity: "1500VA / 1000W", Type: "Line-interactive", Batteries: "New" }, warranty: "3 months", warrantyMonths: 3 },
];

/** Logistics zones (naira). Pickup = collection at a motor park / agent in that state. */
export const LOGISTICS_ZONES: { zone: string; states: string[]; delivery: number; pickup: number; eta: [number, number] }[] = [
  { zone: "South-West", states: ["Lagos", "Ogun", "Osun", "Ondo", "Ekiti"], delivery: 9_000, pickup: 5_000, eta: [1, 3] },
  { zone: "South-South", states: ["Edo", "Delta", "Rivers", "Bayelsa", "Cross River", "Akwa Ibom"], delivery: 14_000, pickup: 8_500, eta: [2, 4] },
  { zone: "South-East", states: ["Anambra", "Enugu", "Imo", "Abia", "Ebonyi"], delivery: 14_000, pickup: 8_500, eta: [2, 4] },
  { zone: "North-Central", states: ["FCT", "Kwara", "Kogi", "Niger", "Benue", "Nasarawa", "Plateau"], delivery: 13_000, pickup: 8_000, eta: [2, 4] },
  { zone: "North-West", states: ["Kaduna", "Kano", "Katsina", "Sokoto", "Kebbi", "Zamfara", "Jigawa"], delivery: 18_000, pickup: 11_000, eta: [3, 6] },
  { zone: "North-East", states: ["Bauchi", "Gombe", "Adamawa", "Taraba", "Borno", "Yobe"], delivery: 20_000, pickup: 12_000, eta: [3, 7] },
];

export const SERVICES = [
  { title: "Computer repairs", description: "Diagnostics, screen and keyboard replacement, motherboard repair and data recovery by certified technicians.", icon: "wrench" },
  { title: "Maintenance & upgrades", description: "SSD and RAM upgrades, cleaning, thermal paste, battery replacement and performance tune-ups.", icon: "cpu" },
  { title: "Software installation", description: "Genuine Windows, Microsoft Office, antivirus, accounting and design software set up correctly.", icon: "download" },
  { title: "IT consultation", description: "Honest advice on the right devices, networks and budgets for your business or school.", icon: "messages" },
  { title: "Office setup", description: "End-to-end office IT: computers, printers, networking, power backup and staff onboarding.", icon: "building" },
  { title: "School & CBT centre setup", description: "Lab design, bulk computers, LAN, servers and exam software for schools and CBT centres.", icon: "graduation" },
];

export const WHY_US = [
  { title: "Quality Products", description: "Brand-new and grade-A UK-used devices, individually tested.", icon: "badge-check" },
  { title: "Competitive Prices", description: "Fair, transparent pricing with bulk discounts.", icon: "tag" },
  { title: "Warranty", description: "Every device is covered — manufacturer or our own.", icon: "shield" },
  { title: "Trusted Service", description: "Thousands of satisfied customers across Nigeria.", icon: "heart-handshake" },
  { title: "Professional Support", description: "Real technicians on phone, WhatsApp and in store.", icon: "headset" },
  { title: "Reliable Sourcing", description: "Direct from trusted UK and OEM suppliers.", icon: "globe" },
  { title: "Nationwide Service", description: "Delivery and motor-park collection to all 36 states + FCT.", icon: "truck" },
  { title: "Customer Satisfaction", description: "We're not done until you're happy with your purchase.", icon: "smile" },
];

export const TEAM = [
  { name: "Adebayo Akinkunmi", position: "Chief Executive Officer", bio: "Founder with over 15 years' experience supplying computers and IT solutions to businesses and schools across Nigeria." },
  { name: "Folake Adeyemi", position: "Head of Sales", bio: "Helps customers and institutions choose the right technology for their needs and budget." },
  { name: "Tunde Ogunleye", position: "Lead Technician", bio: "Certified hardware engineer leading repairs, refurbishment testing and setups." },
  { name: "Grace Okafor", position: "Customer Success Manager", bio: "Makes sure every order, delivery and warranty claim is handled smoothly." },
];

export const PROJECTS = [
  { title: "80-seat CBT Centre, Ogbomoso", category: "CBT centre setup", client: "Private CBT centre", location: "Ogbomoso, Oyo", services: ["80 desktops", "LAN & server", "UPS & inverter", "Exam software"], description: "Complete JAMB-ready CBT centre delivered in three weeks including networking, power backup and staff training." },
  { title: "Secondary School ICT Lab", category: "School setup", client: "Private secondary school", location: "Ibadan, Oyo", services: ["40 computers", "Projector", "Networking"], description: "Modern ICT lab with teacher station, projector and managed internet for 40 students." },
  { title: "Head Office IT Refresh", category: "Office setup", client: "Microfinance bank", location: "Lagos", services: ["25 business laptops", "Printers", "Wi-Fi"], description: "Replaced ageing desktops with business laptops, deployed secure Wi-Fi and shared printing." },
  { title: "Church Media Upgrade", category: "Installation", client: "Church", location: "Oyo", services: ["Projectors", "Media PC", "Power station"], description: "Dual-projector setup with dedicated media computer and silent power backup." },
];

export const TESTIMONIALS = [
  { name: "Mrs. Bola A.", role: "School Proprietor, Ibadan", content: "Business Hub set up our entire computer lab. The machines were in excellent condition and the team trained our teachers too.", rating: 5 },
  { name: "Chinedu O.", role: "Accountant, Lagos", content: "I bought a UK-used EliteBook. It looks brand new and the battery lasts all day. Delivery to Lagos was fast.", rating: 5 },
  { name: "Ibrahim S.", role: "CBT Centre Owner, Kano", content: "Professional from start to finish. They delivered 60 desktops and configured everything remotely with our staff.", rating: 5 },
  { name: "Tosin F.", role: "Graphic Designer", content: "Honest advice — they recommended a machine within my budget that runs all my design software smoothly.", rating: 4 },
];

export const FAQS = [
  { category: "Orders", question: "Do I need an account to buy?", answer: "You can browse and add items to your cart freely. To check out you'll create an account so we can send your receipt, tracking number and warranty details." },
  { category: "Payments", question: "What payment methods do you accept?", answer: "Secure card, bank and USSD payments through Paystack, or direct bank transfer to our business accounts. Bank transfers are confirmed by our finance team before dispatch." },
  { category: "Payments", question: "Is it safe to pay online?", answer: "Yes. Card payments are processed by Paystack — we never see or store your card details." },
  { category: "Delivery", question: "Do you deliver outside Ibadan?", answer: "Yes, to all 36 states and the FCT, by door delivery or collection at a motor park/agent close to you. The logistics cost is shown at checkout." },
  { category: "Delivery", question: "How do I track my order?", answer: "Use your tracking number (e.g. BHC-TRK-2026-000001) or order number on the Track Order page, or view it in your account." },
  { category: "Products", question: "What does UK Used mean?", answer: "Premium devices imported from the UK, previously used by businesses. We test, clean and certify each unit and back it with our warranty." },
  { category: "Warranty", question: "What warranty do I get?", answer: "Brand-new items carry the manufacturer's warranty. UK-used items carry our Business Hub warranty (shown on each product)." },
  { category: "Returns", question: "Can I return a product?", answer: "Faulty items reported within the warranty period are repaired or replaced. See our Returns Policy for full details." },
];

const policy = (title: string, body: string[]) => `# ${title}\n\n${body.join("\n\n")}`;

export const PAGES = [
  ...POLICY_PAGES,
  { slug: "about", title: "About Us", body: policy("About Business Hub Computers", [
    "Business-Hub Computers is a trusted supplier of new and UK-used laptops, computers, IT equipment, and accessories serving individuals, businesses, schools, offices, and organizations in Nigeria.",
    "The company is committed to providing quality, reliable, and affordable technology while helping customers choose the right technology for work, business, education and personal use.",
    "Products include everyday business laptops, professional computers, high-performance systems, gaming computers, monitors, accessories, printers, projectors, power stations and other IT equipment.",
    "Services also include computer repairs, maintenance, software installation, IT consultation, office setup, school setup and CBT centre setup.",
  ]) },
];

export const CAROUSEL = [
  { kind: "promotion", title: "Business laptops that work as hard as you do", subtitle: "Brand-new HP, Dell & Lenovo with full warranty. Save up to 10% this month.", ctaLabel: "Shop brand new", ctaUrl: "/brand-new", desktopImage: "/images/banners/hero-laptops.svg" },
  { kind: "offer", title: "Premium UK-used, tested & certified", subtitle: "Grade-A EliteBooks, Latitudes and ThinkPads from ₦310,000.", ctaLabel: "Shop UK used", ctaUrl: "/uk-used", desktopImage: "/images/banners/hero-uk-used.svg" },
  { kind: "new_arrivals", title: "Gaming rigs are here", subtitle: "RTX 40-series laptops and custom towers, ready to play.", ctaLabel: "See gaming systems", ctaUrl: "/categories/computers?sub=gaming-systems", desktopImage: "/images/banners/hero-gaming.svg" },
  { kind: "seasonal", title: "Beat the outages", subtitle: "Silent LiFePO4 power stations for your home office.", ctaLabel: "Shop power stations", ctaUrl: "/categories/power-station", desktopImage: "/images/banners/hero-power.svg" },
  { kind: "promotion", title: "Office, school & CBT centre setup", subtitle: "From 10 to 200 seats — computers, networking, power and training.", ctaLabel: "Talk to an expert", ctaUrl: "/contact?subject=Setup", desktopImage: "/images/banners/hero-setup.svg" },
];
