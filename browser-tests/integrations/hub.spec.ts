import { expect, test } from "@playwright/test";
for (const screen of ["overview", "guides", "verification", "payments", "refunds", "keys", "callbacks", "reference", "loading", "error"]) {
  test(`${screen} is readable without page overflow`, async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/vendor/integrations?screen=${screen}`);
    await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
    if (screen === "callbacks") await expect(page.getByText("checkout-001", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Integration sections" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${screen}-${info.project.name}.png`), fullPage: true });
  });
}
test("deep links and endpoint search preserve accessible navigation", async ({ page }) => {
  await page.goto("/vendor/integrations");
  await page.getByRole("link", { name: "Setup guides", exact: true }).click();
  await expect(page.getByRole("link", { name: "Setup guides", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Open refunds and recovery guide" }).click();
  await expect(page.getByRole("heading", { name: "Refund and recovery guide" })).toBeVisible();
  await page.getByRole("link", { name: "API reference", exact: true }).click();
  await page.getByLabel("Search API endpoints").fill("Cancel a pending refund");
  await expect(page.getByRole("heading", { name: "Cancel a pending refund" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create a sale" })).toHaveCount(0);
  await page.getByLabel("Example language").selectOption("node");
  await expect(page.getByRole("button", { name: "Copy Cancel a pending refund Node.js request" })).toBeVisible();
  await page.getByLabel("Search API endpoints").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Verification", exact: true })).toBeFocused();
});
test("payment callback history has separate signature guidance", async ({ page }, info) => {
  await page.goto("/vendor/integrations/callbacks?type=payments");
  await expect(page.getByText("payment_request.paid", { exact: true })).toBeVisible();
  await page.getByText("Node.js signature example", { exact: true }).click();
  await expect(page.getByText('Payments use HMAC-SHA256 over timestamp + "." + the exact raw body, with a five-minute timestamp tolerance.')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`payment-callbacks-${info.project.name}.png`), fullPage: true });
});
