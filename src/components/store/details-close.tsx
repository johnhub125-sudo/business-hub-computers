"use client";

import type { ReactNode } from "react";

/** Closes the <details> panel it sits in (the mobile filter sheet). */
export function DetailsClose({ className, label, children }: { className?: string; label: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      onClick={(e) => {
        const d = e.currentTarget.closest("details");
        if (d) d.open = false;
      }}
    >
      {children}
    </button>
  );
}
