"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tilt } from "@/components/ui/tilt";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Slide = { id: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaUrl: string | null; desktopImage: string; mobileImage: string | null; kind: string };
export type ShowcaseProduct = { id: string; name: string; slug: string; image: string; price: number; brand: string | null };
export type CarouselOptions = { effect: "cube" | "slide" | "zoom" | "fade"; autoplay: boolean; seconds: number };

const KIND_LABEL: Record<string, string> = { promotion: "Promotion", seasonal: "Seasonal", discount: "Discount", new_arrivals: "New arrivals", offer: "Special offer" };

/**
 * Animated hero. Slides, texts, timing and the animation style are all managed in the admin
 * (Content → Carousel, Settings → Storefront & effects). The 3D look is CSS transforms only.
 */
export function HeroCarousel({ slides, showcase = [], options = { effect: "cube", autoplay: true, seconds: 6 } }: { slides: Slide[]; showcase?: ShowcaseProduct[]; options?: CarouselOptions }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(!options.autoplay);
  const [hover, setHover] = useState(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  const running = !paused && !hover && n > 1;

  useEffect(() => {
    if (!running) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go(1), options.seconds * 1000);
    return () => clearInterval(t);
  }, [running, go, options.seconds, i]);

  if (!n) return null;
  const product = showcase.length ? showcase[i % showcase.length] : null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      className="hero relative overflow-hidden rounded-3xl bg-brand-950"
      data-effect={options.effect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="hero-stage relative aspect-[4/5] sm:aspect-[16/8] lg:aspect-[16/6.2]">
        {slides.map((s, idx) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${n}`}
            aria-hidden={idx !== i}
            data-pos={idx === i ? "0" : idx < i ? "-1" : "1"}
            className="hero-slide absolute inset-0"
          >
            <picture className="hero-bg absolute inset-0">
              {s.mobileImage && <source media="(max-width: 639px)" srcSet={s.mobileImage} />}
              <Image src={s.desktopImage} alt="" fill priority={idx === 0} loading={idx === 0 ? undefined : "lazy"} sizes="100vw" unoptimized={s.desktopImage.endsWith(".svg")} className="object-cover object-right sm:object-center" />
            </picture>
            <div className={cn("absolute inset-0 bg-gradient-to-t from-brand-950/95 via-brand-950/55 to-brand-950/10 sm:bg-gradient-to-r sm:from-brand-950/90 sm:via-brand-950/55", product ? "sm:to-brand-950/70" : "sm:to-transparent")} />
            <div className="absolute inset-0 flex items-end p-6 sm:items-center sm:p-10 lg:p-14">
              <div className="max-w-xl text-white">
                <span className="hero-in inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-100 ring-1 ring-white/20 backdrop-blur" style={{ animationDelay: "120ms" }}>
                  {KIND_LABEL[s.kind] ?? "Featured"}
                </span>
                <h2 className="hero-in mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl" style={{ animationDelay: "220ms" }}>
                  {s.title}
                </h2>
                {s.subtitle && (
                  <p className="hero-in mt-3 max-w-md text-[15px] text-slate-200 sm:text-lg" style={{ animationDelay: "320ms" }}>
                    {s.subtitle}
                  </p>
                )}
                {s.ctaUrl && (
                  <Link
                    href={s.ctaUrl}
                    tabIndex={idx === i ? 0 : -1}
                    className="hero-in btn-3d mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-accent-500 px-6 font-semibold text-white hover:bg-accent-600"
                    style={{ animationDelay: "420ms" }}
                  >
                    {s.ctaLabel ?? "Shop now"} <ChevronRight className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Floating 3D product: cycles through Featured products, one per slide. */}
        {product && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-end pr-4 sm:inset-y-0 sm:left-auto sm:right-[4%] sm:top-0 sm:w-[38%] sm:items-center sm:justify-center sm:pr-0 lg:right-[7%] lg:w-[30%]">
            <Link key={product.id} href={`/products/${product.slug}`} className="hero-product pointer-events-auto block w-[36%] max-w-[140px] sm:w-full sm:max-w-[340px]" aria-label={`${product.name} — ${formatMoney(product.price)}`}>
              <Tilt max={14} className="rounded-[2rem]">
                <div className="float-3d relative">
                  <div className="absolute inset-[8%] -z-10 rounded-full bg-accent-500/40 blur-3xl" aria-hidden />
                  <Image src={product.image} alt="" width={400} height={400} unoptimized={product.image.endsWith(".svg")} priority className="w-full rounded-[1.6rem] shadow-2xl ring-1 ring-white/20" />
                  <span className="tilt-pop absolute -bottom-3 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-sm font-extrabold text-brand-800 shadow-xl sm:block">{formatMoney(product.price)}</span>
                </div>
              </Tilt>
            </Link>
          </div>
        )}
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
              <button key={s.id} onClick={() => setI(idx)} aria-label={`Go to slide ${idx + 1}`} aria-current={idx === i} className={cn("relative h-2 overflow-hidden rounded-full transition-all", idx === i ? "w-9 bg-white/35" : "w-2 bg-white/50 hover:bg-white/80")}>
                {idx === i && <span key={`${i}-${running}`} className={cn("absolute inset-y-0 left-0 rounded-full bg-white", running ? "hero-progress" : "w-full")} style={{ animationDuration: `${options.seconds}s` }} />}
              </button>
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
