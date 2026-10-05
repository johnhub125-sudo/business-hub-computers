"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const KEY = "bhc-install-dismissed";
const SNOOZE_DAYS = 14;

function snoozed() {
  try {
    const at = Number(localStorage.getItem(KEY) ?? 0);
    return Date.now() - at < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Invites visitors to install the shop as an app.
 *  - Chrome, Edge, Samsung Internet, Opera (Android & desktop): one-tap install via the browser's
 *    own install dialog.
 *  - iPhone/iPad: Apple does not allow a website to open the install dialog, so we show the two
 *    taps needed (Share → Add to Home Screen).
 * Hidden once installed, and for two weeks after being dismissed.
 */
export function InstallPrompt({ appName }: { appName: string }) {
  const [mode, setMode] = useState<"hidden" | "native" | "ios">("hidden");
  const deferred = useRef<InstallEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || snoozed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as InstallEvent;
      setMode("native");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iPhone / iPad (iPadOS reports itself as a Mac with a touch screen).
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const timer = ios ? window.setTimeout(() => setMode((m) => (m === "hidden" ? "ios" : m)), 4000) : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* private mode: just hide for this visit */
    }
    setMode("hidden");
  }

  async function install() {
    const e = deferred.current;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred.current = null;
    if (outcome === "accepted") setMode("hidden");
    else dismiss();
  }

  if (mode === "hidden") return null;
  return (
    <div role="dialog" aria-label={`Install the ${appName} app`} className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md animate-slide-up rounded-2xl border border-line bg-white p-4 shadow-2xl lg:inset-x-auto lg:bottom-6 lg:left-6 lg:mx-0">
      <button onClick={dismiss} className="absolute right-2 top-2 rounded-full p-1.5 text-muted hover:bg-surface" aria-label="Not now">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Image src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl ring-1 ring-line" />
        <div className="min-w-0">
          <p className="font-bold text-ink">Get the {appName} app</p>
          {mode === "native" ? (
            <p className="mt-0.5 text-sm text-muted">Faster shopping, order tracking and deals — right from your home screen. No app store needed.</p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">
              Tap <Share className="mx-0.5 inline size-4 align-text-bottom text-brand-600" aria-label="Share" /> in your browser, then{" "}
              <span className="whitespace-nowrap font-semibold text-ink">
                <SquarePlus className="mr-0.5 inline size-4 align-text-bottom text-brand-600" aria-hidden />
                Add to Home Screen
              </span>
              .
            </p>
          )}
        </div>
      </div>
      {mode === "native" && (
        <div className="mt-3 flex gap-2">
          <button onClick={install} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800">
            <Download className="size-4" aria-hidden /> Install app
          </button>
          <button onClick={dismiss} className="h-10 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-surface">
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
