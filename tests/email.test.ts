import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { outboxMessages } from "@/server/db/schema";
import { emailDelivery, lastDelivery, sendTemplateNow } from "@/server/email";
import { resetDb } from "./support/fixtures";

describe("auth email delivery log", () => {
  beforeEach(async () => {
    await resetDb();
    vi.unstubAllEnvs();
  });

  it("records the outcome without storing the one-time link", async () => {
    const since = new Date(Date.now() - 1000);
    const r = await sendTemplateNow("verifyEmail", "ada@example.com", { name: "Ada", url: "https://x.test/verify?token=SECRET" });
    expect(r.status).toBe("not_configured");
    const [row] = await db.select().from(outboxMessages).where(eq(outboxMessages.recipient, "ada@example.com"));
    expect(row.status).toBe("skipped");
    expect(JSON.stringify(row)).not.toContain("SECRET");
    expect(await lastDelivery("ada@example.com", "verifyEmail", since)).toMatchObject({ status: "skipped" });
  });

  it("classifies the sender", () => {
    expect(emailDelivery()).toBe("off");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Business Hub <onboarding@resend.dev>");
    expect(emailDelivery()).toBe("limited");
    vi.stubEnv("EMAIL_FROM", "Business Hub <orders@mail.example.com>");
    expect(emailDelivery()).toBe("live");
  });
});
