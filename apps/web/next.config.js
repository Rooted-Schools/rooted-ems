const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { hostname: "szockdlohlmkyloubgtd.supabase.co" },
    ],
  },
  transpilePackages: [
    "@rooted-ems/database",
    "@rooted-ems/types",
    "@rooted-ems/utils",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://szockdlohlmkyloubgtd.supabase.co https://accounts.google.com",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://szockdlohlmkyloubgtd.supabase.co",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Sentry build-time options. Source-map upload only happens when
// SENTRY_AUTH_TOKEN (plus org/project) is set; without it the build
// proceeds normally and skips upload — it never fails or hangs.
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Only attempt source-map upload when an auth token is configured.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Skip release creation entirely when there is no auth token, so the
  // build never fails or hangs over Sentry upload steps.
  release: {
    create: Boolean(process.env.SENTRY_AUTH_TOKEN),
  },
  telemetry: false,
  disableLogger: true,
  widenClientFileUpload: false,
};

module.exports = withSentryConfig(nextConfig, sentryBuildOptions);
