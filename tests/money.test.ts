import { describe, expect, it } from "vitest";
import { applyBps, discountPercent, formatMoney, koboToNairaString, nairaToKobo } from "@/lib/money";
import { passwordIssues, passwordScore } from "@/lib/validation/auth";

describe("money", () => {
  it("parses naira into integer kobo without float drift", () => {
    expect(nairaToKobo("125,000.50")).toBe(12_500_050);
    expect(nairaToKobo("0.1")).toBe(10);
    expect(nairaToKobo("₦ 19.99")).toBe(1999);
    expect(() => nairaToKobo("12.345")).toThrow();
    expect(() => nairaToKobo("abc")).toThrow();
  });

  it("computes 7.5% VAT with half-up rounding in integer arithmetic", () => {
    expect(applyBps(10_000, 750)).toBe(750);
    expect(applyBps(1, 750)).toBe(0); // 0.075 kobo → 0
    expect(applyBps(7, 750)).toBe(1); // 0.525 → 1
    expect(applyBps(50_000_000, 750)).toBe(3_750_000);
  });

  it("formats and converts", () => {
    expect(koboToNairaString(12_500_050)).toBe("125000.50");
    expect(formatMoney(50_000_000)).toContain("500,000");
    expect(discountPercent(100_000, 75_000)).toBe(25);
    expect(discountPercent(100_000, null)).toBe(0);
  });
});

describe("password policy", () => {
  it("requires 10+ chars, upper, lower, number and symbol", () => {
    expect(passwordIssues("short")).toContain("At least 10 characters");
    expect(passwordIssues("alllowercase1!")).toContain("An uppercase letter");
    expect(passwordIssues("NoNumbersHere!")).toContain("A number");
    expect(passwordIssues("NoSymbols1234")).toContain("A special symbol");
    expect(passwordIssues("Str0ng!Passw0rd")).toEqual([]);
    expect(passwordScore("Str0ng!Passw0rd")).toBe(4);
  });
});
