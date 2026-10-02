import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { BlobError, get, put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { mediaAssets } from "./db/schema";
import { appEnv, integrations } from "./env";
import { UserError } from "./errors";
import { log } from "./logger";

/**
 * File storage. New uploads go to S3-compatible storage (Cloudflare R2 etc.) when S3_* is configured,
 * otherwise to Vercel Blob. In local development with neither, files are written to disk
 * (public/uploads for public media, .data/uploads for private files) so the app is fully usable
 * before storage is connected. Production refuses to fall back.
 *
 * Stored `url` tells where a file lives: "https://…" Vercel Blob, "/media/<pathname>" public media in a
 * private bucket/store (served by /media/[...path]), "s3:<pathname>" private S3 file, "/uploads/…" and
 * "local-private:…" local development files.
 */

export type UploadKind = "image" | "document" | "proof";

const RULES: Record<UploadKind, { maxBytes: number; mimes: string[] }> = {
  image: { maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"] },
  document: { maxBytes: 10 * 1024 * 1024, mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/csv"] },
  proof: { maxBytes: 5 * 1024 * 1024, mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp"] },
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/csv": "csv",
};

/** Detects the real type from the file's first bytes — the browser-supplied type is not trusted. */
function sniff(buf: Uint8Array): string | null {
  const b = (i: number) => buf[i];
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return "image/gif";
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) return "image/avif";
  return null;
}

export function safeFilename(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/\.{2,}/g, ".")
      .slice(-80) || "file"
  );
}

export async function validateUpload(file: File, kind: UploadKind) {
  if (!(file instanceof File) || file.size === 0) throw new UserError("Please choose a file to upload.");
  const rule = RULES[kind];
  if (file.size > rule.maxBytes) throw new UserError(`File is too large. Maximum size is ${Math.round(rule.maxBytes / 1024 / 1024)}MB.`);
  const buf = new Uint8Array(await file.arrayBuffer());
  const detected = kind === "document" && file.type === "text/csv" && !sniff(buf) ? "text/csv" : sniff(buf);
  if (!detected || !rule.mimes.includes(detected)) {
    throw new UserError(`Unsupported file type. Allowed: ${rule.mimes.map((m) => EXT[m]?.toUpperCase()).join(", ")}.`);
  }
  return { buf, mime: detected, ext: EXT[detected] };
}

/**
 * Blob stores are either public or private. On a private store, public media are stored privately
 * and served by /media/[...path] (CDN-cached), so the site works with either store type.
 * Set BLOB_STORE_ACCESS=private to skip the first public attempt; otherwise it is detected once.
 */
let storeIsPrivate = process.env.BLOB_STORE_ACCESS === "private";
const MEDIA_PREFIX = "/media/";

async function putBlob(pathname: string, body: Buffer, access: "public" | "private", contentType: string): Promise<string> {
  if (access === "public" && !storeIsPrivate) {
    try {
      return (await put(pathname, body, { access: "public", contentType, addRandomSuffix: false })).url;
    } catch (err) {
      if (!(err instanceof BlobError && /private store/i.test(err.message))) throw err;
      storeIsPrivate = true;
    }
  }
  const res = await put(pathname, body, { access: "private", contentType, addRandomSuffix: false });
  return access === "public" ? `${MEDIA_PREFIX}${pathname}` : res.url;
}

/** Where a stored asset lives and how to fetch it from Blob. */
function blobTarget(asset: { url: string; pathname: string; access: string }) {
  if (asset.url.startsWith(MEDIA_PREFIX)) return { ref: asset.pathname, access: "private" as const };
  if (asset.url.startsWith("http")) return { ref: asset.url, access: asset.access === "private" ? ("private" as const) : ("public" as const) };
  return null; // local development file
}

/* ---------------- S3-compatible storage: one private bucket ---------------- */

const S3_PREFIX = "s3:";
let s3: S3Client | null = null;
function s3Client() {
  s3 ??= new S3Client({
    region: process.env.S3_REGION || "auto", // "auto" is what Cloudflare R2 expects
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  return s3;
}

async function putS3(pathname: string, body: Buffer, access: "public" | "private", contentType: string): Promise<string> {
  await s3Client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: pathname, Body: body, ContentType: contentType }));
  return access === "public" ? `${MEDIA_PREFIX}${pathname}` : `${S3_PREFIX}${pathname}`;
}

/** Returns null when the object does not exist. */
async function getS3(pathname: string): Promise<BodyInit | null> {
  try {
    const res = await s3Client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: pathname }));
    return res.Body ? (res.Body.transformToWebStream() as ReadableStream) : null;
  } catch (err) {
    if (err instanceof S3ServiceException && (err.name === "NoSuchKey" || err.$metadata.httpStatusCode === 404)) return null;
    throw err;
  }
}

/**
 * Fetches a stored asset's bytes from wherever it lives. "/media/…" rows may be in S3 or (if uploaded
 * before S3 was configured) in a private Vercel Blob store, so S3 is tried first, then Blob.
 */
async function readStored(asset: { url: string; pathname: string; access: string }): Promise<BodyInit | null> {
  if (asset.url.startsWith(S3_PREFIX)) return integrations.s3() ? getS3(asset.pathname) : null;
  if (asset.url.startsWith(MEDIA_PREFIX) && integrations.s3()) {
    const body = await getS3(asset.pathname);
    if (body || !integrations.vercelBlob()) return body;
  }
  const target = blobTarget(asset);
  if (!target || !integrations.vercelBlob()) return null;
  const res = await get(target.ref, { access: target.access });
  return res && res.statusCode === 200 ? res.stream : null;
}

export async function uploadFile(input: {
  file: File;
  kind: UploadKind;
  folder: string;
  access: "public" | "private";
  userId: string | null;
  entityType?: string;
  entityId?: string;
  alt?: string;
}) {
  const { buf, mime, ext } = await validateUpload(input.file, input.kind);
  const base = safeFilename(input.file.name).replace(/\.[^.]+$/, "");
  const pathname = `${input.folder.replace(/[^a-z0-9/-]/gi, "")}/${base}-${randomBytes(6).toString("hex")}.${ext}`;
  let url: string;

  if (integrations.blob()) {
    try {
      url = integrations.s3() ? await putS3(pathname, Buffer.from(buf), input.access, mime) : await putBlob(pathname, Buffer.from(buf), input.access, mime);
    } catch (err) {
      // Storage errors describe configuration problems (bucket, access mode, auth) and never contain secrets.
      if (err instanceof BlobError || err instanceof S3ServiceException) {
        log.error("Storage upload failed", { err, access: input.access, folder: input.folder });
        throw new UserError(`Upload failed — ${err instanceof S3ServiceException ? `${err.name}: ${err.message}` : err.message}`);
      }
      throw err;
    }
  } else if (appEnv() === "development") {
    const root = input.access === "public" ? path.join(process.cwd(), "public", "uploads") : path.join(process.cwd(), ".data", "uploads");
    const target = path.join(root, pathname);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buf);
    url = input.access === "public" ? `/uploads/${pathname}` : `local-private:${pathname}`;
  } else {
    throw new UserError("File storage is not configured. Please contact the site administrator.");
  }

  const [asset] = await db
    .insert(mediaAssets)
    .values({ url, pathname, filename: safeFilename(input.file.name), mimeType: mime, size: buf.byteLength, alt: input.alt, access: input.access, entityType: input.entityType, entityId: input.entityId, uploadedBy: input.userId })
    .returning();
  return { id: asset.id, url, pathname, mime, size: buf.byteLength };
}

/** Streams a private file (caller must have already authorised access). */
export async function readPrivateFile(pathname: string): Promise<{ body: BodyInit; contentType: string } | null> {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.pathname, pathname));
  if (!asset) return null;
  if (asset.url.startsWith("local-private:")) {
    const buf = await readFile(path.join(process.cwd(), ".data", "uploads", pathname)).catch(() => null);
    return buf ? { body: new Uint8Array(buf), contentType: asset.mimeType } : null;
  }
  const body = await readStored(asset);
  return body ? { body, contentType: asset.mimeType } : null;
}

/** Streams a PUBLIC asset that was stored in a private bucket/store. Never returns private files. */
export async function readPublicMedia(pathname: string): Promise<{ body: BodyInit; contentType: string } | null> {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.pathname, pathname));
  if (!asset || asset.access !== "public" || !asset.url.startsWith(MEDIA_PREFIX)) return null;
  const body = await readStored(asset);
  return body ? { body, contentType: asset.mimeType } : null;
}

export async function deleteFile(pathname: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.pathname, pathname));
  if (!asset) return;
  // Best effort in both stores: a "/media/…" row may live in either (see readStored).
  if (integrations.s3() && (asset.url.startsWith(S3_PREFIX) || asset.url.startsWith(MEDIA_PREFIX))) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: asset.pathname })).catch(() => {});
  }
  const target = blobTarget(asset);
  if (integrations.vercelBlob() && target) await del(target.ref).catch(() => {});
  await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
}
