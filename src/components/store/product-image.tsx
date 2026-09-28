import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

/** next/image wrapper: optimises raster images, serves SVG illustrations as-is. */
export function ProductImage({ src, alt, className, ...rest }: Omit<ImageProps, "src"> & { src: string | null | undefined }) {
  const url = src || "/images/catalog/accessory-1.svg";
  return <Image src={url} alt={alt} unoptimized={url.endsWith(".svg")} className={cn("object-contain", className)} {...rest} />;
}
