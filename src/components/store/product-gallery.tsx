"use client";

import { PlayCircle } from "lucide-react";
import { useState } from "react";
import { Tilt } from "@/components/ui/tilt";
import { isProductArt } from "@/lib/product-kind";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

type Img = { id: string; url: string; alt: string | null };
type Video = { id: string; url: string; title: string | null };

function embedUrl(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  return null;
}

export function ProductGallery({ images, videos, name, variantImage }: { images: Img[]; videos: Video[]; name: string; variantImage?: string | null }) {
  const all = variantImage && !images.some((i) => i.url === variantImage) ? [{ id: "variant", url: variantImage, alt: name }, ...images] : images;
  const [active, setActive] = useState(0);
  const [video, setVideo] = useState<Video | null>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = all[active] ?? { id: "x", url: null as unknown as string, alt: name };

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      <div className="flex gap-2 overflow-x-auto scrollbar-none sm:w-20 sm:flex-col" role="list" aria-label="Product images">
        {all.map((img, i) => (
          <button
            key={img.id}
            role="listitem"
            onClick={() => {
              setActive(i);
              setVideo(null);
            }}
            aria-label={`Show image ${i + 1}`}
            aria-current={!video && i === active}
            className={cn("relative size-16 shrink-0 overflow-hidden rounded-xl border-2 bg-surface sm:size-20", !video && i === active ? "border-brand-600" : "border-transparent hover:border-line")}
          >
            <ProductImage src={img.url} alt="" fill sizes="80px" className="p-1" />
          </button>
        ))}
        {videos.map((v) => (
          <button
            key={v.id}
            onClick={() => setVideo(v)}
            aria-label={`Play video${v.title ? `: ${v.title}` : ""}`}
            className={cn("grid size-16 shrink-0 place-items-center rounded-xl border-2 bg-brand-950 text-white sm:size-20", video?.id === v.id ? "border-brand-600" : "border-transparent")}
          >
            <PlayCircle className="size-7" />
          </button>
        ))}
      </div>
      <div className="relative aspect-square flex-1 overflow-hidden rounded-3xl border border-line bg-surface">
        {video ? (
          embedUrl(video.url) ? (
            <iframe src={embedUrl(video.url)!} title={video.title ?? `${name} video`} className="size-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <video src={video.url} controls className="size-full bg-black object-contain" />
          )
        ) : (
          isProductArt(current.url) ? (
            // Automatic 3D picture: tilt it with the mouse, or drag on a phone.
            <Tilt max={16} drag className="size-full cursor-grab active:cursor-grabbing">
              <ProductImage src={current.url} alt={current.alt ?? name} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="p-5 drop-shadow-xl" />
              <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-950/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">3D preview · move to tilt</span>
            </Tilt>
          ) : (
          <div
            className="relative size-full cursor-zoom-in"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
          >
            <ProductImage
              src={current.url}
              alt={current.alt ?? name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="p-6 transition-transform duration-150"
              style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
          </div>
          )
        )}
      </div>
    </div>
  );
}
