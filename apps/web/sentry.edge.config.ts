import * as Sentry from "@sentry/nextjs";

// Inert unless a DSN is configured. Set NEXT_PUBLIC_SENTRY_DSN to enable.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    // FERPA: this is a student-data system. Never send PII by default.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.Authorization;
        }
      }
      return event;
    },
  });
}
