/**
 * Renders the PDF receipt for an order to a local file (for checking the design).
 *   node --conditions=react-server --import tsx scripts/preview-receipt.tsx <orderId> <out.pdf>
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { readFileSync, writeFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { closeDb } from "../src/server/db";
import { ReceiptDocument } from "../src/server/pdf/receipt-document";
import { receiptData } from "../src/server/services/receipts";

async function main() {
  const [orderId, out = "receipt-preview.pdf"] = process.argv.slice(2);
  if (!orderId) throw new Error("Usage: preview-receipt <orderId> [out.pdf]");
  const data = await receiptData(orderId);
  if (!data) throw new Error("No receipt for that order");
  const pdf = await renderToBuffer(createElement(ReceiptDocument, { data, logo: readFileSync("public/brand/logo.jpeg") }) as Parameters<typeof renderToBuffer>[0]);
  writeFileSync(out, pdf);
  console.log(`✓ wrote ${out} (${pdf.length} bytes)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
