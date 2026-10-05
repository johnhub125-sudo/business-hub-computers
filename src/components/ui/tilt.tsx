"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tilts its content in 3D towards the pointer, with a moving highlight. Pure CSS transforms driven
 * by two CSS variables — no 3D library, nothing to download. Does nothing on touch-only devices,
 * for visitors who prefer reduced motion, or when an ancestor has data-tilt="off" (admin setting).
 */
export function Tilt({ children, className, max = 8, glare = true, drag = false }: { children: ReactNode; className?: string; max?: number; glare?: boolean; drag?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function allowed(el: HTMLElement) {
    return !el.closest('[data-tilt="off"]') && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    // Mouse: follow the hover. Touch: only while dragging, and only where the caller asked for it.
    if (!el || (e.pointerType !== "mouse" && !(drag && e.buttons > 0)) || !allowed(el)) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--ry", `${(x * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-y * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
      el.dataset.active = "true";
    });
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
    delete el.dataset.active;
  }

  return (
    <div ref={ref} className={cn("tilt", drag && "touch-pan-y", className)} onPointerMove={move} onPointerLeave={reset} onPointerUp={drag ? reset : undefined} onPointerCancel={reset}>
      {children}
      {glare && <span className="tilt-glare" aria-hidden />}
    </div>
  );
}
