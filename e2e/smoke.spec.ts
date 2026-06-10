import { test, expect } from "@playwright/test";
import { BASE_URL } from "./playwright.config";

/**
 * Production smoke suite — runs against a LIVE deployment (BASE_URL).
 *
 * Strictly read-only and unauthenticated:
 * - no form submissions that create data
 * - no login attempts beyond loading the login pages
 */

const IS_PRODUCTION_DOMAIN = BASE_URL.startsWith("https://enroll.rootedschool.org");

test.describe("public pages", () => {
  test("home page renders with heading and Apply call-to-action", async ({ page }) => {
    await page.goto("/");
    // Hero heading: "Enroll at a rootedschool"
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Enroll/i);
    // Apply CTA: "Apply Now" button when a window is open; the "Apply" step
    // in "How Enrollment Works" is always rendered, so match either.
    await expect(page.getByText(/Apply/).first()).toBeVisible();
  });

  test("family login page renders the login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Family Portal/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("staff login page renders the login form", async ({ page }) => {
    await page.goto("/staff-login");
    await expect(page.getByRole("heading", { name: /Staff Console/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("non-existent route returns the 404 page, not a 500", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-smoke-check");
    expect(response, "expected a navigation response").toBeTruthy();
    expect(response!.status()).toBe(404);
  });
});

test.describe("auth boundaries", () => {
  test("unauthenticated /family/dashboard redirects to family login", async ({ page }) => {
    await page.goto("/family/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated /staff/dashboard redirects to a login page", async ({ page }) => {
    const response = await page.goto("/staff/dashboard");
    const finalUrl = page.url();
    const redirectedToLogin = /login/.test(finalUrl);
    const blocked = response !== null && [401, 403].includes(response.status());
    expect(
      redirectedToLogin || blocked,
      `expected redirect to login or 401/403, got ${response?.status()} at ${finalUrl}`,
    ).toBe(true);
    // Must not be serving dashboard content at the dashboard URL.
    expect(finalUrl).not.toMatch(/\/staff\/dashboard$/);
  });
});

test.describe("security", () => {
  test("security headers are present on /", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toBeTruthy();
  });

  test("HTTP redirects to HTTPS", async ({ playwright }) => {
    test.skip(!IS_PRODUCTION_DOMAIN, "HTTP→HTTPS redirect only enforced on the production domain");
    const httpUrl = BASE_URL.replace(/^https:/, "http:");
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      const response = await context.get(httpUrl);
      expect([301, 302, 307, 308]).toContain(response.status());
      const location = response.headers()["location"] ?? "";
      expect(location).toMatch(/^https:\/\//);
    } finally {
      await context.dispose();
    }
  });

  test("/api/cron/expire-offers without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/cron/expire-offers");
    expect(response.status()).toBe(401);
  });

  test("/api/cron/offer-reminders without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/cron/offer-reminders");
    // NOTE: this route exists in the latest commits but may not be deployed yet.
    // Tolerate 404 as a temporary pass; tighten to 401-only after the next deploy.
    expect([401, 404]).toContain(response.status());
    if (response.status() === 404) {
      test.info().annotations.push({
        type: "warning",
        description: "offer-reminders returned 404 (not deployed yet) — tighten to 401 after deploy",
      });
    }
  });
});
