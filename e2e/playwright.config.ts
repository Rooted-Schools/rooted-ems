import { defineConfig, devices } from "@playwright/test";

/**
 * Production smoke suite.
 *
 * Targets a LIVE deployment via BASE_URL (defaults to production).
 * All tests are strictly read-only/unauthenticated: no form submissions
 * that create data, no login attempts beyond loading the pages.
 */
export const BASE_URL = process.env.BASE_URL ?? "https://enroll.rootedschool.org";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
