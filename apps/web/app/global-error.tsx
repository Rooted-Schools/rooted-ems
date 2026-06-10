"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No-op unless NEXT_PUBLIC_SENTRY_DSN is configured.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8faf8",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          color: "#1f2937",
        }}
      >
        <main
          style={{
            maxWidth: "28rem",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "#4b5563",
              marginBottom: "1.5rem",
            }}
          >
            We&apos;re sorry — something unexpected happened on our end. Please
            try again. If the problem continues, reach out to your school
            office and we&apos;ll help you get back on track.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.625rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: "#4f7a4e",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
