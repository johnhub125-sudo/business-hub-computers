"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Slide = { id: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaUrl: string | null; desktopImage: string; mobileImage: string | null; kind: string };

const KIND_LABEL: Record<string, string> = { promotion: "Promotion", seasonal: "Seasonal", discount: "Discount", new_arrivals: "New arrivals", offer: "Special offer" };

export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    if (paused || n < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go(1), 6000);
    return () => clearInterval(t);
  }, [paused, n, go]);

  if (!n) return null;
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      className="relative overflow-hidden rounded-3xl bg-brand-900"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative aspect-[4/5] sm:aspect-[16/8] lg:aspect-[16/6.2]">
        {slides.map((s, idx) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${n}`}
            aria-hidden={idx !== i}
            className={cn("absolute inset-0 transition-opacity duration-700", idx === i ? "opacity-100" : "pointer-events-none opacity-0")}
          >
            <picture className="absolute inset-0">
              {s.mobileImage && <source media="(max-width: 639px)" srcSet={s.mobileImage} />}
              <Image src={s.desktopImage} alt="" fill priority={idx === 0} sizes="100vw" unoptimized={s.desktopImage.endsWith(".svg")} className="object-cover object-right sm:object-center" />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-brand-950/90 via-brand-950/40 to-transparent sm:bg-gradient-to-r sm:from-brand-950/85 sm:via-brand-950/45 sm:to-transparent" />
            <div className="absolute inset-0 flex items-end p-6 sm:items-center sm:p-10 lg:p-14">
              <div className="max-w-xl text-white">
                <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-100 ring-1 ring-white/20 backdrop-blur">{KIND_LABEL[s.kind] ?? "Featured"}</span>
                <h2 className="mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">{s.title}</h2>
                {s.subtitle && <p className="mt-3 max-w-md text-[15px] text-slate-200 sm:text-lg">{s.subtitle}</p>}
                {s.ctaUrl && (
                  <Link href={s.ctaUrl} tabIndex={idx === i ? 0 : -1} className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-accent-500 px-6 font-semibold text-white shadow-lg transition hover:bg-accent-600">
                    {s.ctaLabel ?? "Shop now"} <ChevronRight className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25 sm:grid" aria-label="Previous slide">
            <ChevronLeft className="size-5" />
          </button>
          <button onClick={() => go(1)} className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25 sm:grid" aria-label="Next slide">
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 right-4 flex items-center gap-2 sm:bottom-5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
            {slides.map((s, idx) => (
              <button key={s.id} onClick={() => setI(idx)} aria-label={`Go to slide ${idx + 1}`} aria-current={idx === i} className={cn("h-2 rounded-full transition-all", idx === i ? "w-7 bg-white" : "w-2 bg-white/50 hover:bg-white/80")} />
            ))}
            <button onClick={() => setPaused((p) => !p)} className="ml-1 grid size-7 place-items-center rounded-full bg-white/15 text-white" aria-label={paused ? "Play slideshow" : "Pause slideshow"}>
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
