import { Fragment } from "react";
import { cn } from "@/lib/utils";

export interface JourneyTimelineProps {
  /** Translated step labels in journey order, e.g. ["Applied", "Verified", "Offered", "Accepted", "Registered"] */
  steps: string[];
  /**
   * 0-based index of the current step. Steps before it render as completed
   * (filled rooted-green), the current step is highlighted, later steps are
   * muted. Pass `steps.length` (or greater) to render the whole journey as
   * complete.
   */
  currentIndex: number;
  /** "sm" for compact dashboard cards, "md" for detail pages (e.g. the offer page). */
  size?: "sm" | "md";
  /**
   * Fully translated description of the current position, e.g.
   * "Step 3 of 5: Offered". Announced to screen readers in place of the
   * visual stepper.
   */
  ariaLabel: string;
  className?: string;
}

/**
 * Compact horizontal stepper showing an applicant's journey through
 * enrollment. Pure server-renderable component (no hooks).
 *
 * At narrow widths (< 640px) only the current step's label is shown so the
 * stepper never overflows a 375px viewport; all labels appear at sm and up.
 */
export function JourneyTimeline({
  steps,
  currentIndex,
  size = "md",
  ariaLabel,
  className,
}: JourneyTimelineProps) {
  const isComplete = currentIndex >= steps.length;
  const dotSize = size === "sm" ? "w-5 h-5 text-[10px]" : "w-7 h-7 text-xs";
  const lineOffset = size === "sm" ? "mt-[9px]" : "mt-[13px]";
  const labelSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      <div className="flex items-start" aria-hidden="true">
        {steps.map((label, i) => {
          const done = isComplete || i < currentIndex;
          const current = !isComplete && i === currentIndex;
          return (
            <Fragment key={i}>
              {i > 0 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 min-w-2",
                    lineOffset,
                    done ? "bg-rooted-green" : "bg-stone/30"
                  )}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full font-semibold shrink-0",
                    dotSize,
                    done
                      ? "bg-rooted-green text-white"
                      : current
                        ? "bg-deep-green text-white ring-2 ring-rooted-green/40"
                        : "bg-white border border-stone/40 text-stone"
                  )}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span
                  className={cn(
                    labelSize,
                    "leading-tight text-center max-w-16",
                    current
                      ? "block font-semibold text-deep-green"
                      : done
                        ? "hidden sm:block text-ink/60"
                        : "hidden sm:block text-stone"
                  )}
                >
                  {label}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
