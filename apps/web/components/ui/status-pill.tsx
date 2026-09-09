import { cn } from "@/lib/utils";
import { getStatusConfig } from "@/lib/application-helpers";

/**
 * Per-status color tone for the elevated status chip. The label still comes
 * from getStatusConfig (single source of truth), so wording never diverges;
 * this only adds the color + dot so a staff queue reads at a glance instead of
 * as a wall of same-weight text. Colors are drawn from the existing brand
 * tokens — greens for progress, warn for "waiting on someone", campus garnet
 * for the lottery, error for terminal-negative, neutral for inactive.
 */
const STATUS_TONE: Record<string, { pill: string; dot: string }> = {
  draft: { pill: "bg-sunken text-stone-text", dot: "bg-stone" },
  submitted: { pill: "bg-info/10 text-[#3550c9]", dot: "bg-info" },
  needs_info: { pill: "bg-warn/15 text-warn-text", dot: "bg-warn" },
  verified: { pill: "bg-rooted-green/20 text-deep-green", dot: "bg-deep-green" },
  lottery_assigned: { pill: "bg-campus-neal/10 text-campus-neal", dot: "bg-campus-neal" },
  offered: { pill: "bg-warn/15 text-warn-text", dot: "bg-warn" },
  accepted: { pill: "bg-deep-green text-light-green", dot: "bg-light-green" },
  waitlisted: { pill: "bg-warn/15 text-warn-text", dot: "bg-warn" },
  registered: { pill: "bg-rooted-green/20 text-deep-green", dot: "bg-deep-green" },
  placement_review: { pill: "bg-rooted-green/15 text-deep-green", dot: "bg-rooted-green" },
  enrolled: { pill: "bg-deep-green text-light-green", dot: "bg-light-green" },
  declined: { pill: "bg-error/10 text-error", dot: "bg-error" },
  expired: { pill: "bg-error/10 text-error", dot: "bg-error" },
  rejected: { pill: "bg-error/10 text-error", dot: "bg-error" },
  withdrawn: { pill: "bg-sunken text-stone-text", dot: "bg-stone" },
};

const DEFAULT_TONE = { pill: "bg-sunken text-stone-text", dot: "bg-stone" };

/**
 * Elevated application-status chip: a tinted pill with a leading color dot,
 * keyed to the application status. Presentational only — no behavior, and the
 * label is the same one getStatusConfig already returns. Pass `label` to
 * override the wording (e.g. a family-facing label) while keeping the tone.
 */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = STATUS_TONE[status] ?? DEFAULT_TONE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone.pill,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
      {label ?? getStatusConfig(status).label}
    </span>
  );
}
