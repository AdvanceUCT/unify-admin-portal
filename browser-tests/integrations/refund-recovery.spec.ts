import { expect, test } from "@playwright/test";

for (const screen of ["refund-pending", "refund-error", "refund-unacknowledged", "refund-list"]) {
  test(`${screen} shows production refund controls without overflow`, async ({ page }, info) => {
    await page.goto(`/vendor/payments?screen=${screen}`);
    await expect(page.getByRole("button", { name: "Retry refund", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel pending refund" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh status" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Refresh status" }).click();
    expect(await page.evaluate(() => window.__refundRequests.filter(request => request.method !== "GET"))).toEqual([]);
    if (screen === "refund-error") {
      await page.getByRole("button", { name: "Retry refund", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Keep the original reference");
      await expect(page.getByRole("button", { name: "Retry refund", exact: true })).toBeEnabled();
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("unify.refund-registration.v1:")))).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`${screen}-${info.project.name}.png`), fullPage: true });
  });
}

test("retry executes once and refreshes authoritative totals and balance", async ({ page }) => {
  await page.goto("/vendor/payments?screen=refund-pending");
  await page.getByRole("button", { name: "Retry refund", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel pending refund" })).toBeDisabled();
  await expect(page.getByText("Fully refunded", { exact: true })).toBeVisible();
  await expect(page.getByTestId("server-refreshes")).toHaveText("1");
  await expect(page.getByTestId("wallet-balance")).toContainText("100");
  expect(await page.evaluate(() => window.__refundRequests.filter(request => request.path.endsWith("/execute")))).toHaveLength(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("unify.refund-registration.v1:")))).toEqual([]);
});

test("cancellation is explicit, terminal and never executes", async ({ page }) => {
  await page.goto("/vendor/payments?screen=refund-pending");
  await page.getByRole("button", { name: "Cancel pending refund" }).click();
  await expect(page.getByText("Refund cancelled.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__refundRequests.filter(request => request.path.endsWith("/execute")))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("unify.refund-registration.v1:")))).toEqual([]);
});
