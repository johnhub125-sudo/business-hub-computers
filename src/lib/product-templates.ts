/**
 * Department templates for the Excel product upload. Each one fixes the shop category (and, for
 * computers, the condition), so a product uploaded with it can only land in the right place, and
 * asks for the specifications that matter for that kind of product.
 *
 * Spec `key` is the name stored in the product's specifications. "Processor", "RAM", "Storage" and
 * "Screen" are the names the shop filters search, so computer templates use exactly those.
 */
export type SpecColumn = { key: string; header?: string; help: string; options?: string[]; width?: number };

export type ProductTemplate = {
  id: string;
  label: string;
  blurb: string;
  icon: string; // DynamicIcon name
  /** Top-level shop category: the first existing one whose name matches, otherwise created with `name`. */
  category: { name: string; slug: string; match: RegExp; icon: string };
  /** Forced condition (computers). Other templates keep a Condition column defaulting to Brand New. */
  condition?: "Brand New" | "UK Used";
  /** Offered in the Subcategory dropdown; created under the category when first used. */
  subcategories: string[];
  specs: SpecColumn[];
  example: Record<string, string | number>;
};

const PROCESSORS = ["Core i3", "Core i5", "Core i7", "Core i9", "Core Ultra 5", "Core Ultra 7", "Ryzen 3", "Ryzen 5", "Ryzen 7", "Ryzen 9", "Apple M1", "Apple M2", "Apple M3", "Apple M4", "Celeron", "Pentium", "Xeon"];
const computerSpecs = (used: boolean): SpecColumn[] => [
  { key: "Model", header: "Model / series", help: "E.g. EliteBook 840 G8, Latitude 5420, ThinkPad T14. Keeps similar models together.", width: 24 },
  { key: "Processor", help: "Pick from the list or type it, e.g. Core i7.", options: PROCESSORS, width: 16 },
  { key: "Generation", help: "E.g. 11th Gen, 13th Gen.", options: ["6th Gen", "7th Gen", "8th Gen", "10th Gen", "11th Gen", "12th Gen", "13th Gen", "14th Gen"], width: 13 },
  { key: "RAM", help: "Memory, e.g. 16GB.", options: ["4GB", "8GB", "12GB", "16GB", "24GB", "32GB", "64GB"], width: 10 },
  { key: "Storage", help: "E.g. 512GB SSD.", options: ["128GB SSD", "256GB SSD", "512GB SSD", "1TB SSD", "2TB SSD", "500GB HDD", "1TB HDD", "1TB HDD + 256GB SSD"], width: 16 },
  { key: "Screen", header: "Screen size", help: "E.g. 14 inch.", options: ["11.6 inch", "12.5 inch", "13.3 inch", "14 inch", "15.6 inch", "16 inch", "17.3 inch", "21.5 inch", "24 inch", "27 inch"], width: 13 },
  { key: "Graphics", help: "E.g. Intel Iris Xe, NVIDIA RTX 4060 8GB.", width: 22 },
  { key: "Operating system", help: "Pick from the list.", options: ["Windows 11 Pro", "Windows 11 Home", "Windows 10 Pro", "macOS", "ChromeOS", "No OS"], width: 17 },
  { key: "Keyboard", help: "E.g. Backlit, Touchscreen, Fingerprint.", width: 16 },
  ...(used
    ? [
        { key: "Grade", help: "A = like new, B = light marks.", options: ["Grade A", "Grade A-", "Grade B"], width: 11 },
        { key: "Battery health", help: "E.g. 85%.", width: 14 },
      ]
    : []),
];

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: "brand-new-computers",
    label: "Brand New Computers",
    blurb: "Laptops, desktops, all-in-ones and workstations — factory sealed.",
    icon: "laptop",
    category: { name: "Computers", slug: "computers", match: /^computers?$|^laptops?( & | and )?(desktops?)?$/i, icon: "laptop" },
    condition: "Brand New",
    subcategories: ["Laptops", "Business Laptops", "Gaming Laptops", "Desktops", "All-in-One PCs", "Workstations", "MacBooks", "Monitors"],
    specs: computerSpecs(false),
    example: { name: "HP ProBook 450 G10 Core i5 13th Gen 16GB 512GB SSD", subcategory: "Business Laptops", brand: "HP", price: 785000, Model: "ProBook 450 G10", Processor: "Core i5", Generation: "13th Gen", RAM: "16GB", Storage: "512GB SSD", Screen: "15.6 inch" },
  },
  {
    id: "uk-used-computers",
    label: "UK Used Computers",
    blurb: "Tested, grade-A UK used laptops and desktops.",
    icon: "laptop",
    category: { name: "Computers", slug: "computers", match: /^computers?$|^laptops?( & | and )?(desktops?)?$/i, icon: "laptop" },
    condition: "UK Used",
    subcategories: ["Laptops", "Business Laptops", "Gaming Laptops", "Desktops", "All-in-One PCs", "Workstations", "MacBooks", "Monitors"],
    specs: computerSpecs(true),
    example: { name: "Dell Latitude 5420 Core i7 11th Gen 16GB 512GB SSD", subcategory: "Business Laptops", brand: "Dell", price: 420000, Model: "Latitude 5420", Processor: "Core i7", Generation: "11th Gen", RAM: "16GB", Storage: "512GB SSD", Screen: "14 inch", Grade: "Grade A" },
  },
  {
    id: "printers",
    label: "Printers, Toner, Ink & Cartridges",
    blurb: "Printers, scanners, photocopiers and their consumables.",
    icon: "printer",
    category: { name: "Printers", slug: "printers", match: /printer|toner|cartridge|^ink/i, icon: "printer" },
    subcategories: ["Printers", "Toner", "Ink", "Cartridges", "Scanners", "Photocopiers", "Printer parts"],
    specs: [
      { key: "Print technology", help: "Pick from the list.", options: ["Laser", "Inkjet", "Ink tank", "Dot matrix", "Thermal", "—"], width: 16 },
      { key: "Colour", help: "Mono (black only) or Colour.", options: ["Mono", "Colour"], width: 10 },
      { key: "Functions", help: "What the printer does.", options: ["Print only", "Print, Scan, Copy", "Print, Scan, Copy, Fax"], width: 20 },
      { key: "Connectivity", help: "E.g. USB, Wi-Fi.", options: ["USB", "USB + Wi-Fi", "USB + Wi-Fi + Ethernet", "USB + Ethernet"], width: 20 },
      { key: "Cartridge code", help: "For toner, ink and cartridges: the code on the box, e.g. 85A, CF283A, 664.", width: 16 },
      { key: "Compatible printers", help: "For consumables: printers it fits, e.g. LaserJet P1102, M1132.", width: 30 },
      { key: "Page yield", help: "Pages per cartridge, e.g. 1,600 pages.", width: 13 },
    ],
    example: { name: "HP 85A Black Toner Cartridge (CE285A)", subcategory: "Toner", brand: "HP", price: 28500, "Print technology": "Laser", Colour: "Mono", "Cartridge code": "85A / CE285A", "Compatible printers": "LaserJet P1102, M1132, M1212" },
  },
  {
    id: "accessories",
    label: "Accessories",
    blurb: "Keyboards, mice, bags, chargers, storage, headsets and more.",
    icon: "mouse",
    category: { name: "Accessories", slug: "accessories", match: /accessor/i, icon: "mouse" },
    subcategories: ["Keyboards & Mice", "Bags & Sleeves", "Chargers & Adapters", "Storage & Flash Drives", "Headsets & Speakers", "Cables & Hubs", "Webcams", "Laptop Batteries & Parts", "Monitors"],
    specs: [
      { key: "Type", header: "Accessory type", help: "E.g. Wireless mouse, 65W charger, 1TB external drive.", width: 22 },
      { key: "Compatible with", help: "E.g. HP EliteBook, USB-C laptops, all laptops.", width: 24 },
      { key: "Connectivity", help: "Pick from the list.", options: ["Wired (USB)", "Wireless (2.4GHz)", "Bluetooth", "USB-C", "Wired + Wireless"], width: 18 },
      { key: "Capacity", header: "Capacity / size", help: "E.g. 1TB, 65W, 15.6 inch.", width: 15 },
      { key: "Colour", help: "E.g. Black.", width: 10 },
    ],
    example: { name: "Logitech M185 Wireless Mouse", subcategory: "Keyboards & Mice", brand: "Logitech", price: 9500, Type: "Wireless mouse", Connectivity: "Wireless (2.4GHz)", Colour: "Grey" },
  },
  {
    id: "solar",
    label: "Solar & Power",
    blurb: "Power stations, solar panels, inverters, batteries and UPS.",
    icon: "sun",
    category: { name: "Solar & Power", slug: "solar-power", match: /solar|power|inverter|energy/i, icon: "sun" },
    subcategories: ["Power Stations", "Solar Panels", "Inverters", "Batteries", "UPS", "Solar Generators", "Charge Controllers"],
    specs: [
      { key: "Capacity", help: "Battery capacity, e.g. 1024Wh, 200Ah.", width: 13 },
      { key: "Output power", help: "E.g. 1800W, 3.5kVA.", width: 13 },
      { key: "Battery type", help: "Pick from the list.", options: ["LiFePO4", "Lithium-ion", "Tubular (lead-acid)", "AGM", "Gel", "—"], width: 18 },
      { key: "Voltage", help: "E.g. 12V, 24V, 48V.", options: ["12V", "24V", "48V", "220V AC"], width: 10 },
      { key: "Panel wattage", help: "For solar panels, e.g. 450W.", width: 13 },
      { key: "Charging", help: "E.g. AC 1.5 hrs, Solar 600W input.", width: 22 },
      { key: "Outlets", help: "E.g. 4 AC, 2 USB-C, 2 USB-A.", width: 20 },
    ],
    example: { name: "EcoFlow DELTA 2 Portable Power Station 1024Wh", subcategory: "Power Stations", brand: "EcoFlow", price: 950000, Capacity: "1024Wh", "Output power": "1800W", "Battery type": "LiFePO4", Outlets: "4 AC, 2 USB-C, 2 USB-A" },
  },
  {
    id: "networking",
    label: "Networking",
    blurb: "Routers, switches, access points, MiFi and cabling.",
    icon: "router",
    category: { name: "Networking", slug: "networking", match: /network/i, icon: "router" },
    subcategories: ["Routers", "Switches", "Access Points", "MiFi & 4G/5G Modems", "Network Cables & Connectors", "Racks & Accessories"],
    specs: [
      { key: "Type", header: "Device type", help: "E.g. Wi-Fi 6 router, 24-port gigabit switch.", width: 22 },
      { key: "Speed", help: "E.g. AX3000, 1Gbps.", width: 12 },
      { key: "Wi-Fi standard", help: "Pick from the list.", options: ["Wi-Fi 4 (N)", "Wi-Fi 5 (AC)", "Wi-Fi 6 (AX)", "Wi-Fi 6E", "Wi-Fi 7", "—"], width: 15 },
      { key: "Ports", help: "E.g. 4 LAN + 1 WAN, 24 PoE.", width: 18 },
      { key: "Network", header: "SIM / network", help: "For MiFi and modems.", options: ["4G LTE", "5G", "—"], width: 13 },
      { key: "Coverage", help: "E.g. up to 3 bedrooms, 300m outdoor.", width: 18 },
    ],
    example: { name: "TP-Link Archer AX55 Wi-Fi 6 Router", subcategory: "Routers", brand: "TP-Link", price: 98000, Type: "Wi-Fi 6 router", Speed: "AX3000", "Wi-Fi standard": "Wi-Fi 6 (AX)", Ports: "4 LAN + 1 WAN" },
  },
  {
    id: "phones",
    label: "Phones & Accessories",
    blurb: "Smartphones, tablets, smartwatches, chargers and power banks.",
    icon: "smartphone",
    category: { name: "Phones & Accessories", slug: "phones-accessories", match: /phone|mobile|tablet/i, icon: "smartphone" },
    subcategories: ["Smartphones", "Tablets", "Smartwatches", "Chargers & Cables", "Power Banks", "Earbuds & Headphones", "Cases & Screen Guards"],
    specs: [
      { key: "Storage", help: "E.g. 128GB.", options: ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"], width: 11 },
      { key: "RAM", help: "E.g. 8GB.", options: ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB"], width: 9 },
      { key: "Screen", header: "Screen size", help: "E.g. 6.7 inch.", width: 12 },
      { key: "Battery", help: "E.g. 5000mAh.", width: 12 },
      { key: "Network", help: "Pick from the list.", options: ["4G", "5G", "Wi-Fi only", "—"], width: 11 },
      { key: "SIM", help: "Pick from the list.", options: ["Single SIM", "Dual SIM", "eSIM", "Dual SIM + eSIM", "—"], width: 15 },
      { key: "Colour", help: "E.g. Midnight Black.", width: 14 },
    ],
    example: { name: "Samsung Galaxy A55 5G 256GB", subcategory: "Smartphones", brand: "Samsung", price: 520000, Storage: "256GB", RAM: "8GB", Screen: "6.6 inch", Battery: "5000mAh", Network: "5G", SIM: "Dual SIM" },
  },
];

export const templateById = (id: string | null | undefined) => PRODUCT_TEMPLATES.find((t) => t.id === id);
