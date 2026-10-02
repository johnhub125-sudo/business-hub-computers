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

// Simulated S3-compatible bucket (Cloudflare R2).
const bucket = new Map<string, Buffer>();
let s3Fails = false;
vi.mock("@aws-sdk/client-s3", () => {
  class S3ServiceException extends Error {
    $metadata: { httpStatusCode?: number };
    constructor(o: { name: string; message: string; status?: number }) {
      super(o.message);
      this.name = o.name;
      this.$metadata = { httpStatusCode: o.status };
    }
  }
  class Command {
    constructor(public input: { Key?: string; Body?: Buffer }) {}
  }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  class HeadBucketCommand extends Command {}
  class S3Client {
    async send(cmd: Command) {
      if (s3Fails) throw new S3ServiceException({ name: "InvalidAccessKeyId", message: "The access key is not valid.", status: 403 });
      const key = cmd.input.Key!;
      if (cmd instanceof PutObjectCommand) return void bucket.set(key, cmd.input.Body!);
      if (cmd instanceof DeleteObjectCommand) return void bucket.delete(key);
      if (cmd instanceof GetObjectCommand) {
        const b = bucket.get(key);
        if (!b) throw new S3ServiceException({ name: "NoSuchKey", message: "Not found", status: 404 });
        return { Body: { transformToWebStream: () => new Blob([new Uint8Array(b)]).stream() } };
      }
      return {};
    }
  }
  return { S3Client, S3ServiceException, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand };
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

describe("storage on S3-compatible storage (Cloudflare R2)", () => {
  beforeEach(async () => {
    await resetDb();
    blobs.clear();
    bucket.clear();
    s3Fails = false;
    vi.unstubAllEnvs();
    vi.stubEnv("S3_ENDPOINT", "https://account.r2.cloudflarestorage.com");
    vi.stubEnv("S3_BUCKET", "bhc-test");
    vi.stubEnv("S3_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "test-secret");
  });

  it("stores public images in the bucket and serves them via /media", async () => {
    const up = await uploadFile({ file: new File([PNG], "Team Photo.png", { type: "image/png" }), kind: "image", folder: "team", access: "public", userId: null });
    expect(up.url).toBe(`/media/${up.pathname}`);
    expect(bucket.has(up.pathname)).toBe(true);
    expect(blobs.size).toBe(0);
    expect((await readPublicMedia(up.pathname))?.contentType).toBe("image/png");

    await deleteFile(up.pathname);
    expect(bucket.has(up.pathname)).toBe(false);
    expect(await readPublicMedia(up.pathname)).toBeNull();
  });

  it("keeps private files out of /media", async () => {
    const up = await uploadFile({ file: new File([PDF], "proof.pdf", { type: "application/pdf" }), kind: "proof", folder: "proofs", access: "private", userId: null });
    expect(up.url).toBe(`s3:${up.pathname}`);
    expect(await readPublicMedia(up.pathname)).toBeNull();
    expect((await readPrivateFile(up.pathname))?.contentType).toBe("application/pdf");
  });

  it("still serves images uploaded to Vercel Blob before the switch", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("BLOB_STORE_ID", "store_test");
    const old = await uploadFile({ file: new File([PNG], "old.png", { type: "image/png" }), kind: "image", folder: "team", access: "public", userId: null });
    expect(blobs.has(old.pathname)).toBe(true);

    vi.stubEnv("S3_ENDPOINT", "https://account.r2.cloudflarestorage.com");
    vi.stubEnv("S3_BUCKET", "bhc-test");
    vi.stubEnv("S3_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "test-secret");
    expect((await readPublicMedia(old.pathname))?.contentType).toBe("image/png");
  });

  it("reports the storage error instead of a generic failure", async () => {
    s3Fails = true;
    await expect(uploadFile({ file: new File([PNG], "x.png", { type: "image/png" }), kind: "image", folder: "team", access: "public", userId: null })).rejects.toThrow(
      "Upload failed — InvalidAccessKeyId: The access key is not valid.",
    );
  });
});
