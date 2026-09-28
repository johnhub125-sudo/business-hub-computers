import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { mediaAssets } from "./db/schema";
import { appEnv, integrations } from "./env";
import { UserError } from "./errors";

/**
 * File storage: Vercel Blob in preview/production. In local development without a Blob token,
 * files are written to disk (public/uploads for public media, .data/uploads for private files)
 * so the app is fully usable before storage is connected. Production refuses to fall back.
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
    const res = await put(pathname, Buffer.from(buf), { access: input.access, contentType: mime, addRandomSuffix: false });
    url = res.url;
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
  const res = await get(asset.url, { access: asset.access === "private" ? "private" : "public" });
  if (!res || res.statusCode !== 200) return null;
  return { body: res.stream, contentType: asset.mimeType };
}

export async function deleteFile(pathname: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.pathname, pathname));
  if (!asset) return;
  if (integrations.blob() && asset.url.startsWith("http")) await del(asset.url).catch(() => {});
  await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
}
