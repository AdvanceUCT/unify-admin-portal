import { expect, test } from "@playwright/test";
test("public welcome has clear audience actions and a responsive illustration", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your campus.In your pocket.");
  await expect(page.getByRole("link", { name: "Register your business" })).toHaveAttribute("href", "/vendor/sign-up");
  await expect(page.getByRole("link", { name: "Vendor sign in", exact: true })).toHaveAttribute("href", "/vendor/sign-in");
  await expect(page.getByRole("link", { name: "University staff sign in" })).toHaveAttribute("href", "/sign-in");
  await expect(page.getByText(/approved Android app/)).toBeVisible();
  expect(await page.locator('a[href$=".apk"]').count()).toBe(0);
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".welcome-art").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.screenshot({ path: info.outputPath(`welcome-${info.project.name}.png`), fullPage: true });
});
