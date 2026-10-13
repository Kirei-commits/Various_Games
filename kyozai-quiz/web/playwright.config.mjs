import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:4173/", trace: "retain-on-failure" },
  webServer: { command: "node tests/serve.mjs", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI },
});
