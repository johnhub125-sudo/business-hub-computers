/**
 * Brings the policy pages (warranty, terms, privacy, shipping, returns, refunds, cookies) up to the
 * current default text — but ONLY where the page still holds an earlier default, word for word.
 * A page that anyone has edited in Admin → Content → Pages is never touched. Safe to run repeatedly;
 * Vercel runs it before each build (`vercel-build`).
 *
 *   npx tsx scripts/upgrade-content.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { contentPages } from "../src/server/db/schema/content";
import { POLICY_PAGES } from "./policy-texts";

/** SHA-256 of every default body that has shipped before. A page matching one of these was never edited. */
const EARLIER_DEFAULTS: Record<string, string[]> = {
  terms: ["3b70ec59afe89c912bc1d4f7ff0ffdcd9929fa54bbbc30ab2db9b5358ee04c19"],
  privacy: ["6390b596d811c94858e12d244584c17d68bb93e4450c8048b3496baffd66202e"],
  shipping: ["27a6555b6710d2c00cde0df603717ea6f5411ddd7e1ccc869e7e5f0fad47078f"],
  returns: ["582fc3c69ce9a5f7e20f83a54143ceb8ad2f153f7a31b0501bb36b5b61d42600"],
  "refund-policy": ["898249f9e7241b9ca390c1bbaf94340601eccf9cec4128983b7d3a44c62dfeea"],
  warranty: ["ca59483aa7ab06951c9adff3af5434c7e44fadf6e8aee9b3ed7292556bd7861e"],
  cookies: ["b9ce08206932eb08d4153cabceb938e4ac226903b49869477045aa4a2c217ff5"],
};

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.argv.includes("--if-configured")) return void console.warn("• DATABASE_URL is not set — skipping content upgrade");
    throw new Error("DATABASE_URL is not set");
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({ connectionString: url, max: 1, ssl: isLocal ? undefined : { rejectUnauthorized: true } });
  const db = drizzle({ client: pool, casing: "snake_case" });
  try {
    let updated = 0;
    let kept = 0;
    for (const page of POLICY_PAGES) {
      const [current] = await db.select().from(contentPages).where(eq(contentPages.slug, page.slug));
      if (!current) {
        await db.insert(contentPages).values({ ...page, status: "published" }).onConflictDoNothing();
        updated++;
      } else if (current.body === page.body) {
        // already current
      } else if ((EARLIER_DEFAULTS[page.slug] ?? []).includes(sha(current.body))) {
        await db.update(contentPages).set({ title: page.title, body: page.body, version: current.version + 1, updatedAt: new Date() }).where(eq(contentPages.id, current.id));
        updated++;
      } else {
        kept++; // edited by the business: leave it alone
      }
    }
    console.log(`✓ policy pages: ${updated} updated, ${kept} left as edited`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // Content is never a reason to block a deployment.
  console.error("• content upgrade skipped:", err instanceof Error ? err.message : err);
});
