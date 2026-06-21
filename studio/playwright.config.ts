import { defineConfig, devices } from "@playwright/test";

const config = {
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list" as const,
  use: {
    baseURL: "http://127.0.0.1:3099",
    trace: "on-first-retry" as const,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3099",
    url: "http://127.0.0.1:3099",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
};

if (process.env.CI) {
  Object.assign(config, { workers: 1 });
}

export default defineConfig(config);
