import { beforeEach, describe, expect, it, vi } from "vitest";

// Simulated PRIVATE Vercel Blob store: public puts are rejected exactly as the real service does.
const blobs = new Map<string, { access: string; body: Buffer }>();
vi.mock("@vercel/blob", () => {
  class BlobError extends Error {
    constructor(message: string) {
      super(`Vercel Blob: ${message}`);
    }
  }
  return {
    BlobError,
    put: vi.fn(async (pathname: string, body: Buffer, opts: { access: string }) => {
      if (opts.access === "public") throw new BlobError("Cannot use public access on a private store. The store is configured with private access.");
      blobs.set(pathname, { access: opts.access, body });
      return { url: `https://store.private.blob.vercel-storage.com/${pathname}`, pathname };
    }),
    get: vi.fn(async (ref: string, opts: { access: string }) => {
      const key = ref.replace(/^https:\/\/[^/]+\//, "");
      const b = blobs.get(key);
      if (!b || opts.access !== "private") return null;
      return { statusCode: 200, stream: new Uint8Array(b.body) };
    }),
    del: vi.fn(async (ref: string) => void blobs.delete(ref.replace(/^https:\/\/[^/]+\//, ""))),
  };
});

import { deleteFile, readPrivateFile, readPublicMedia, uploadFile } from "@/server/storage";
import { resetDb } from "./support/fixtures";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.4 test");

describe("storage on a private Blob store", () => {
  beforeEach(async () => {
    await resetDb();
    blobs.clear();
    vi.stubEnv("BLOB_STORE_ID", "store_test");
  });

  it("stores public images privately and serves them via /media", async () => {
    const up = await uploadFile({ file: new File([PNG], "Team Photo.png", { type: "image/png" }), kind: "image", folder: "team", access: "public", userId: null });
    expect(up.url).toMatch(/^\/media\/team\/Team-Photo-[0-9a-f]{12}\.png$/);
    expect(blobs.get(up.pathname)?.access).toBe("private");

    const media = await readPublicMedia(up.pathname);
    expect(media?.contentType).toBe("image/png");

    await deleteFile(up.pathname);
    expect(blobs.has(up.pathname)).toBe(false);
    expect(await readPublicMedia(up.pathname)).toBeNull();
  });

  it("never serves private files through /media", async () => {
    const up = await uploadFile({ file: new File([PDF], "proof.pdf", { type: "application/pdf" }), kind: "proof", folder: "proofs", access: "private", userId: null });
    expect(up.url).toMatch(/^https:\/\//);
    expect(await readPublicMedia(up.pathname)).toBeNull();
    expect((await readPrivateFile(up.pathname))?.contentType).toBe("application/pdf");
  });
});
