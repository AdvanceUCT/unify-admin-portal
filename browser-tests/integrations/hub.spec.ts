import { expect, test } from "@playwright/test";
const screens = [
 ["verification", "/vendor/integrations"], ["payments", "/vendor/integrations/payments"], ["keys", "/vendor/integrations/keys?preset=payments&returnTo=payments"],
 ["empty", "/vendor/integrations?empty=1"], ["disabled", "/vendor/integrations/payments?disabled=1"], ["history-error", "/vendor/integrations?history-error=1"], ["config-error", "/vendor/integrations?config-error=1"], ["loading", "/vendor/integrations?screen=loading"], ["error", "/vendor/integrations?screen=error"]
];
for (const [name, path] of screens) test(`${name} uses production composition without overflow`, async ({ page }, info) => {
 const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); await page.goto(path);
 await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toHaveCount(1);
 const nav = page.getByRole("navigation", { name: "Integration sections" }); await expect(nav.getByRole("link")).toHaveCount(3); await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
 if (name === "history-error") { await expect(page.getByText(/Unable to load webhook history/)).toBeVisible(); await expect(page.getByRole("button", { name: "Save and replace secret" })).toBeEnabled(); }
 if (name === "config-error") { await expect(page.getByText(/Unable to load webhooks/)).toBeVisible(); await expect(page.getByText("checkout-001", { exact: true })).toBeVisible(); }
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(errors).toEqual([]);
 await page.screenshot({ path: info.outputPath(`integrations-${name}-${info.project.name}.png`), fullPage: true });
});
test("workflow routes survive refresh and browser back/forward", async ({ page }) => {
 await page.goto("/vendor/integrations"); const nav = page.getByRole("navigation", { name: "Integration sections" }); await nav.getByRole("link", { name: "Payments", exact: true }).click(); await expect(page).toHaveURL(/integrations\/payments$/); await page.reload(); await expect(nav.getByRole("link", { name: "Payments", exact: true })).toHaveAttribute("aria-current", "page"); await page.goBack(); await expect(nav.getByRole("link", { name: "Verification", exact: true })).toHaveAttribute("aria-current", "page"); await page.goForward(); await expect(nav.getByRole("link", { name: "Payments", exact: true })).toHaveAttribute("aria-current", "page");
});
test("legacy guide, webhook and endpoint bookmarks resolve within the matching workflow", async ({ page }) => {
 await page.goto("/vendor/integrations/guides/refunds#step-4"); await expect(page).toHaveURL(/integrations\/payments#refund-step-4$/); await expect(page.locator("#refund-step-4")).toBeFocused();
 await page.goto("/vendor/integrations/callbacks?type=payments"); await expect(page).toHaveURL(/integrations\/payments#webhooks$/); await expect(page.getByRole("heading", { name: "Webhooks", exact: true })).toBeVisible();
 await page.goto("/vendor/integrations/reference#refund-compatibility"); await expect(page).toHaveURL(/integrations\/payments#refund-compatibility$/); await expect(page.getByText("Compatibility: older refund POST").locator("..")).toHaveAttribute("open", ""); await expect(page.locator("#refund-compatibility")).toBeFocused();
});
test("visible section navigation reaches history and preserves focus below the header", async ({ page }, info) => {
 await page.goto("/vendor/integrations/payments");
 if (info.project.name === "mobile") await page.getByRole("combobox", { name: "Jump to integration section" }).selectOption("delivery-history"); else await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Delivery history", exact: true }).click();
 await expect(page.locator("#delivery-history")).toBeFocused(); const box = await page.getByRole("heading", { name: "Delivery history", exact: true }).boundingBox(); expect(box!.y).toBeGreaterThan(64);
 await page.getByRole("button", { name: "Refresh history" }).focus(); await expect(page.getByRole("button", { name: "Refresh history" })).toBeFocused();
});
test("key presets have a visible route back and one-time secrets clear on departure", async ({ page }) => {
 await page.goto("/vendor/integrations/payments"); await page.getByRole("link", { name: "Create payment key" }).click(); await expect(page.getByRole("link", { name: "Return to payment setup" })).toBeVisible();
 await page.getByLabel("Key name").fill("Synthetic till"); await page.getByRole("checkbox", { name: /Campus café/ }).check(); await page.getByRole("button", { name: "Create API key" }).click(); await expect(page.getByText("unify_vk_synthetic_once", { exact: true })).toBeVisible(); await page.getByRole("link", { name: "Return to payment setup" }).click(); await expect(page).toHaveURL(/integrations\/payments#setup$/); await page.getByRole("navigation", { name: "Integration sections" }).getByRole("link", { name: "API keys", exact: true }).click(); await expect(page.getByText("unify_vk_synthetic_once", { exact: true })).toHaveCount(0);
});
test("payment signature guidance stays beside settings and examples use selected targets", async ({ page }) => {
 await page.goto("/vendor/integrations/payments#webhooks"); await page.getByText("Node.js signature example", { exact: true }).click(); await expect(page.getByText('Payments use HMAC-SHA256 over timestamp + "." + the exact raw body, with a five-minute timestamp tolerance.')).toBeVisible();
 await page.goto("/vendor/integrations/payments#payment-create"); await page.getByRole("combobox", { name: "Example language" }).selectOption("node"); await expect(page.getByRole("button", { name: "Copy Create a sale Node.js request" })).toBeVisible(); await expect(page.locator("#payment-create")).toContainText("synthetic-campus-branch");
});
