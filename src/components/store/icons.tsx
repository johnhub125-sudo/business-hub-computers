import {
  BadgeCheck,
  Battery,
  Building2,
  Cpu,
  Download,
  Globe,
  GraduationCap,
  HeartHandshake,
  Headset,
  Laptop,
  MessagesSquare,
  Monitor,
  Mouse,
  Printer,
  Projector,
  Shield,
  Smile,
  Tag,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  "badge-check": BadgeCheck,
  battery: Battery,
  building: Building2,
  cpu: Cpu,
  download: Download,
  globe: Globe,
  graduation: GraduationCap,
  "heart-handshake": HeartHandshake,
  headset: Headset,
  laptop: Laptop,
  messages: MessagesSquare,
  monitor: Monitor,
  mouse: Mouse,
  printer: Printer,
  projector: Projector,
  shield: Shield,
  smile: Smile,
  tag: Tag,
  truck: Truck,
  wrench: Wrench,
};

export function DynamicIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && MAP[name]) || BadgeCheck;
  return <Icon className={className} aria-hidden />;
}

export const CATEGORY_ART: Record<string, string> = {
  computers: "/images/catalog/laptop-1.svg",
  monitors: "/images/catalog/monitor-2.svg",
  accessories: "/images/catalog/headset-1.svg",
  printers: "/images/catalog/printer-1.svg",
  projectors: "/images/catalog/projector-2.svg",
  "power-station": "/images/catalog/power-1.svg",
  "business-laptops": "/images/catalog/laptop-2.svg",
  "gaming-systems": "/images/catalog/gaming-1.svg",
  desktops: "/images/catalog/desktop-1.svg",
  workstations: "/images/catalog/laptop-3.svg",
};
