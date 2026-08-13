"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconAlertTriangle } from "@/components/ui/icons";

/**
 * Error boundary for everything under /staff. Most staff routes run a live
 * Supabase read with no error.tsx above them, so a transient DB blip or a
 * failed query previously fell through to Next's raw framework error screen
 * — no branding, no way back in, and (worse) React's default overlay can
 * surface the thrown error's message, which here may carry database detail.
 * This boundary is intentionally silent about what broke: it never renders
 * `error.message`, only a flat, honest "something went wrong."
 *
 * Next requires error.tsx to be a Client Component, and it receives
 * {error, reset} directly from the framework rather than server-fetched
 * props.
 */
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged for our own diagnostics only — never shown to the staff member.
    console.error("[staff/error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center text-error mb-4">
          <IconAlertTriangle size={40} />
        </div>
        <h1 className="text-xl font-bold text-ink">Something went wrong</h1>
        <p className="text-sm text-stone-text mt-2">
          This page couldn&apos;t load. It might be a temporary connection issue.
          Try again, or head back to Today.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] px-6 text-sm font-semibold text-white bg-rooted-green hover:bg-deep-green transition-colors"
          >
            Try again
          </button>
          <Link
            href="/staff/today"
            className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] border border-line bg-white px-6 text-sm font-medium text-ink hover:bg-sunken transition-colors"
          >
            Back to Today
          </Link>
        </div>
      </div>
    </div>
  );
}
