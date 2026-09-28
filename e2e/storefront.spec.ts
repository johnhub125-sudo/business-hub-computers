import { expect, test } from "@playwright/test";

test("homepage renders key sections without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /shop by category/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /featured products/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("search, filter and open a product", async ({ page }) => {
  await page.goto("/search?q=elitebook");
  await expect(page.getByText(/product/)).toBeVisible();
  await page.getByRole("link", { name: /EliteBook 840 G6/i }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("EliteBook");
  await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
});

test("guest can add to cart; checkout requires sign-in", async ({ page }) => {
  await page.goto("/products/lenovo-thinkpad-t480-uk-used");
  await page.getByRole("button", { name: /^add to cart$/i }).click();
  await expect(page.getByLabel(/cart, 1 item/i)).toBeVisible();
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
});

test("admin area is protected", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("order tracking requires matching contact details", async ({ page }) => {
  await page.goto("/track-order?number=BHC-2026-000001&contact=wrong@example.com");
  await expect(page.getByRole("alert")).toContainText(/no order matches/i);
});
