import { afterAll } from "vitest";
import { closeDb } from "@/server/db";

// The test Postgres accepts one connection at a time; release it when each file finishes.
afterAll(async () => {
  await closeDb();
});
