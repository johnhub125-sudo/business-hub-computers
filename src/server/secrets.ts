import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { appSecrets } from "./db/schema";
import { log } from "./logger";

/**
 * Encrypted vault for credentials entered in the admin (Paystack keys).
 *
 * - AES-256-GCM, key derived (HKDF-SHA256) from BETTER_AUTH_SECRET, which lives only in the hosting
 *   environment. The database holds ciphertext, so a database leak alone reveals nothing.
 * - Values are write-only from the admin's point of view: the UI only ever gets a masked hint.
 * - Reads are cached in memory for a few seconds so payments do not add a query per request.
 */

export type SecretName = "paystack.test.public" | "paystack.test.secret" | "paystack.live.public" | "paystack.live.secret";

const TTL_MS = 15_000;
const cache = new Map<string, { value: string | null; at: number }>();

function vaultKey() {
  const master = process.env.BETTER_AUTH_SECRET;
  if (!master || master.length < 16) throw new Error("BETTER_AUTH_SECRET must be set before credentials can be stored.");
  return Buffer.from(hkdfSync("sha256", master, "business-hub.app-secrets", "vault-v1", 32));
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

function decrypt(blob: string) {
  const [version, iv, tag, body] = blob.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** sk_live_abc…wxyz → "sk_live_••••wxyz" */
export function maskHint(value: string) {
  const prefix = value.match(/^(sk|pk)_(test|live)_/)?.[0] ?? "";
  return `${prefix}••••${value.slice(-4)}`;
}

/** Returns the stored value, or null when nothing is stored (callers then fall back to environment variables). */
export async function getSecret(name: SecretName): Promise<string | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: string | null = null;
  try {
    const [row] = await db.select({ ciphertext: appSecrets.ciphertext }).from(appSecrets).where(eq(appSecrets.key, name));
    value = row ? decrypt(row.ciphertext) : null;
  } catch (err) {
    // Never take payments down because the vault is unreadable; environment variables still apply.
    log.error("Could not read stored credential", { name, err: err instanceof Error ? err.message : String(err) });
    value = null;
  }
  cache.set(name, { value, at: Date.now() });
  return value;
}

export async function setSecret(name: SecretName, value: string, userId: string | null) {
  const ciphertext = encrypt(value);
  const hint = maskHint(value);
  await db
    .insert(appSecrets)
    .values({ key: name, ciphertext, hint, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSecrets.key, set: { ciphertext, hint, updatedBy: userId, updatedAt: new Date() } });
  cache.set(name, { value, at: Date.now() });
}

export async function deleteSecrets(names: SecretName[]) {
  if (!names.length) return;
  await db.delete(appSecrets).where(inArray(appSecrets.key, names));
  for (const n of names) cache.delete(n);
}

/** Masked hints for display. Never returns the values themselves. */
export async function secretHints(names: SecretName[]) {
  const rows = names.length ? await db.select({ key: appSecrets.key, hint: appSecrets.hint, updatedAt: appSecrets.updatedAt }).from(appSecrets).where(inArray(appSecrets.key, names)) : [];
  return new Map(rows.map((r) => [r.key as SecretName, { hint: r.hint, updatedAt: r.updatedAt }]));
}
