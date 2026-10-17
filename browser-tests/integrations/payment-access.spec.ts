import { expect, test } from "@playwright/test";
for (const screen of ["overview", "setup", "saved", "pending", "rejected", "reconfirm", "approved", "paused", "admin", "admin-reconfirm", "admin-queue"]) {
  test(`payment access ${screen} is readable`, async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/vendor/payments/access?screen=access-${screen}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`payment-access-${screen}-${info.project.name}.png`), fullPage: true });
  });
}
test("owner can select a bank, save, acknowledge and submit on one page", async ({ page }) => {
  await page.goto("/vendor/payments/access?screen=access-setup");
  await page.getByLabel("Account holder name").fill("Campus Cafe");
  await page.getByLabel("Search banks").fill("Synthetic");
  await page.getByLabel("Bank", { exact: true }).selectOption("001");
  await page.getByLabel("Account number").fill("1234567890");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving account…" })).toBeDisabled();
  await expect(page.getByText("Payout account saved.")).toBeVisible();
  await expect(page.getByLabel("Account number")).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit for review" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Request saved. It is awaiting university review.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test("unknown submission blocks another submission and offers authoritative reload", async ({ page }) => {
  await page.goto("/vendor/payments/access?screen=access-saved&unknown-submit=1");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("button", { name: "Reload request status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
});
test("bank errors are recoverable without revealing provider fields", async ({ page }) => {
  await page.goto("/vendor/payments/access?screen=access-setup&bank-error=1");
  await expect(page.getByText("Banks could not be loaded. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save account", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry bank list" })).toBeVisible();
  await expect(page.getByLabel("Paystack bank code")).toHaveCount(0);
});
test("account changes block admin approval and show owner reconfirmation", async ({ page }) => {
  await page.goto("/vendor/payments/access?screen=access-admin-reconfirm");
  await expect(page.getByRole("button", { name: "Approve branch" })).toBeDisabled();
  await expect(page.getByText("Owner confirmation required")).toBeVisible();
  await page.goto("/vendor/payments/access?screen=access-reconfirm");
  await expect(page.getByRole("button", { name: "Confirm updated account" })).toBeVisible();
});
test("admin queue filters vendor, branch and review status", async ({ page }) => {
  await page.goto("/vendor/payments/access?screen=access-admin-queue");
  await page.getByLabel("Request status").selectOption("ALL");
  await page.getByLabel("Search vendors or branches").fill("Library");
  await expect(page.getByText("Library Eats", { exact: true })).toBeVisible();
  await expect(page.getByText("Campus Cafe", { exact: true })).toHaveCount(0);
  await page.getByLabel("Request status").selectOption("PENDING");
  await expect(page.getByText("No matching payment-access requests.")).toBeVisible();
});
