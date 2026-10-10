import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests/integrations", timeout: 30_000,
  reporter: [["list"], ["html", { outputFolder: "integration-browser-report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: { command: "node scripts/integration-preview/serve.mjs", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});
