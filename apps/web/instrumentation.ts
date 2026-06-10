import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports request errors from nested React Server Components (no-op
// without a DSN since Sentry.init is never called in that case).
export const onRequestError = Sentry.captureRequestError;
