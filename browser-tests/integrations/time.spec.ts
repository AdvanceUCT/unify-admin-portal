import { expect, test } from "@playwright/test";
for (const timezoneId of ["UTC", "America/Los_Angeles"]) test(`SAST display, export and scheduling in ${timezoneId}`, async ({ browser }) => {
  const context = await browser.newContext({ timezoneId });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/vendor/integrations?screen=time");
  await expect(page.getByTestId("timestamp")).toContainText("00:30");
  await expect(page.getByTestId("export")).toHaveText("2027-01-01T00:30:00.000+02:00");
  await expect(page.getByTestId("date")).toHaveText("2027-01-01");
  await page.getByLabel("Suspension ends (SAST)").fill("2027-01-01T00:30");
  await expect(page.locator("#scheduled-result")).toHaveText("2026-12-31T22:30:00.000Z");
  await context.close();
});
