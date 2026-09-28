import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function StatusPage({ code, title, message, actions }: { code: string; title: string; message: string; actions?: ReactNode }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4 py-16">
      <div className="max-w-lg text-center">
        <Link href="/" aria-label="Home">
          <Image src="/brand/logo.jpeg" alt="Business Hub Computers" width={640} height={170} className="mx-auto h-12 w-auto" />
        </Link>
        <p className="mt-10 font-display text-7xl font-extrabold tracking-tight text-brand-100">{code}</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-ink">{title}</h1>
        <p className="mt-2 text-muted">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {actions ?? (
            <>
              <Link href="/" className="inline-flex h-11 items-center rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
                Go home
              </Link>
              <Link href="/support" className="inline-flex h-11 items-center rounded-xl border border-line px-5 font-semibold hover:bg-surface">
                Get help
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
