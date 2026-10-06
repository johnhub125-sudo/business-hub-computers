"use client";

import { Box, ImageDown, Link2, Loader2, RefreshCw, Search, Square } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addPhotoFromLinkAction, findPhotosAction, keepGeneratedPictureAction, refindPhotoAction, requeuePhotosAction } from "@/app/admin/actions/products";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Find real photos" progress bar. Works through the waiting products a few at a time, so it can be
 * stopped at any moment and never blocks the shop. Whatever is left is picked up by the daily job.
 */
export function PhotoFinder({ waiting, ready, autoStart = false, className }: { waiting: number; ready: boolean; autoStart?: boolean; className?: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(waiting);
  const [found, setFound] = useState(0);
  const [checked, setChecked] = useState(0);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stop = useRef(false);
  const started = useRef(false);

  async function run() {
    stop.current = false;
    setRunning(true);
    setNote(null);
    for (let guard = 0; guard < 400 && !stop.current; guard++) {
      const r = await findPhotosAction();
      if (!r.ok) {
        setNote(r.error);
        break;
      }
      setLeft(r.data.remaining);
      setFound((n) => n + r.data.found);
      setChecked((n) => n + r.data.processed);
      if (r.data.message) setNote(r.data.message);
      if (!r.data.ready || r.data.message || r.data.remaining === 0 || r.data.processed === 0) break;
    }
    setRunning(false);
    router.refresh();
  }

  // Right after an import, start by itself (once).
  useEffect(() => {
    if (!autoStart || !ready || waiting <= 0) return;
    const t = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void run();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function requeue() {
    const r = await requeuePhotosAction();
    if (!r.ok) return void toast.error(r.error);
    setLeft(r.data.waiting);
    setFound(0);
    setChecked(0);
    toast.success(r.data.count ? `${r.data.count} product(s) queued for a new search` : "Nothing to search again");
  }

  if (!ready) {
    return (
      <div className={cn("rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900", className)}>
        <strong>Real photos are not switched on yet.</strong> Products show their 3D picture. To find real photos automatically, add a Brave Search key (<code>BRAVE_SEARCH_API_KEY</code>) in Vercel and connect file storage — see <code>docs/setup/product-photos.md</code>.
      </div>
    );
  }
  const total = checked + left;
  return (
    <div className={cn("rounded-xl border border-line bg-white p-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <ImageDown className="size-5 shrink-0 text-brand-600" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">
          {running ? (
            <>
              <strong>Finding real photos…</strong> {checked} checked, {found} found, {left} to go.
            </>
          ) : left > 0 ? (
            <>
              <strong>{left} product{left === 1 ? "" : "s"}</strong> waiting for a real photo{checked ? ` (${found} found so far)` : ""}. They show the 3D picture meanwhile.
            </>
          ) : checked ? (
            <>
              <strong>Finished.</strong> {found} photo{found === 1 ? "" : "s"} found for {checked} product{checked === 1 ? "" : "s"}. The rest keep their 3D picture.
            </>
          ) : (
            <>Every product has been checked for a real photo.</>
          )}
        </p>
        {running ? (
          <Button type="button" size="sm" variant="outline" onClick={() => (stop.current = true)}>
            <Square className="size-3.5" aria-hidden /> Stop
          </Button>
        ) : left > 0 ? (
          <Button type="button" size="sm" onClick={run}>
            <Search className="size-4" aria-hidden /> Find photos now
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={requeue}>
            <RefreshCw className="size-4" aria-hidden /> Search again for products without a photo
          </Button>
        )}
      </div>
      {(running || checked > 0) && total > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={checked}>
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.round((checked / total) * 100)}%` }} />
        </div>
      )}
      {note && <p className="mt-2 text-xs text-amber-700">{note}</p>}
    </div>
  );
}

/** Picture controls on a product's edit page. */
export function ProductPictureTools({
  productId,
  picture,
  kind,
  searchReady,
  status,
}: {
  productId: string;
  picture: string;
  kind: "photo" | "auto" | "generated";
  searchReady: boolean;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState("");

  const act = (name: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(name);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (!r.ok) toast.error(r.error, { duration: 9000 });
      else {
        toast.success(r.message);
        if (name === "link") setLink("");
      }
      router.refresh();
    });
  };

  const label = kind === "photo" ? "Photo uploaded by staff" : kind === "auto" ? "Real photo found automatically" : "Automatic 3D picture";
  const hint =
    kind === "auto"
      ? "Check it is the right product. If not, search again, upload your own, or go back to the 3D picture."
      : kind === "generated"
        ? status === "not_found"
          ? "No suitable photo was found on the web, so the 3D picture is shown."
          : status === "off"
            ? "You chose to keep the 3D picture for this product."
            : searchReady
              ? "A real photo will be looked for automatically. You can also do it now."
              : "Upload a photo below, or paste a picture link."
        : "This is the main picture customers see. Manage all pictures under “Images & video” below.";

  return (
    <section className="mb-6 rounded-2xl border border-line bg-white p-5" aria-label="Product picture">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative size-32 shrink-0 overflow-hidden rounded-xl border border-line bg-surface">
          <Image src={picture} alt="" fill unoptimized className="object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Product picture</h2>
          <p className="mt-0.5 text-sm">
            <span className={cn("mr-2 rounded-md px-2 py-0.5 text-xs font-bold", kind === "photo" ? "bg-emerald-50 text-emerald-700" : kind === "auto" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700")}>{label}</span>
            <span className="text-muted">{hint}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {searchReady && kind !== "photo" && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act("find", () => refindPhotoAction(productId))}>
                {busy === "find" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
                {kind === "auto" ? "Search for a different photo" : "Find a real photo now"}
              </Button>
            )}
            {kind === "auto" && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => confirm("Remove the found photo and show the 3D picture instead?") && act("generated", () => keepGeneratedPictureAction(productId))}>
                {busy === "generated" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Box className="size-4" aria-hidden />}
                Use the 3D picture instead
              </Button>
            )}
          </div>
          <form
            className="mt-3 flex max-w-xl flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) act("link", () => addPhotoFromLinkAction(productId, link));
            }}
          >
            <label className="sr-only" htmlFor="picture-link">
              Picture link
            </label>
            <input
              id="picture-link"
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Or paste a picture link from the manufacturer’s website (https://…)"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-brand-500"
            />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !link.trim()}>
              {busy === "link" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
              Add picture
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">Pictures added here are resized and stored on your own storage, so they load fast. To upload, reorder or remove pictures, use “Images &amp; video” below.</p>
        </div>
      </div>
    </section>
  );
}
