import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function AdminAuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 px-4 py-10">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-6 text-center">
          <Link href="/" className="inline-block rounded-xl bg-white px-3 py-2">
            <Image src="/brand/logo.jpeg" alt="Business Hub Computers" width={640} height={170} className="h-9 w-auto" priority />
          </Link>
          <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-brand-200">Admin & staff portal</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="font-display text-2xl font-extrabold">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-brand-200">Access is restricted to authorised staff. All activity is logged.</p>
      </div>
    </div>
  );
}
