import type { BadgeProps } from "@/components/ui/badge";
import { tx, type Locale, type TranslationKey } from "@/lib/i18n/translations";

/**
 * Maps application status enum values to display labels and badge variants.
 *
 * These are the PRECISE, staff-facing labels — use them as-is on staff
 * surfaces. Family surfaces should not read `.label` directly; use
 * `getFamilyStatusLabel()` below instead, which renders the parent-language
 * wording from lib/i18n/translations.ts.
 */
export const APPLICATION_STATUS_CONFIG: Record<
  string,
  { label: string; variant: BadgeProps["variant"] }
> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Submitted", variant: "default" },
  needs_info: { label: "Needs Info", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  lottery_assigned: { label: "Lottery", variant: "default" },
  offered: { label: "Offered", variant: "success" },
  accepted: { label: "Accepted", variant: "success" },
  waitlisted: { label: "Waitlisted", variant: "warning" },
  registered: { label: "Registered", variant: "success" },
  placement_review: { label: "Placement Review", variant: "default" },
  enrolled: { label: "Enrolled", variant: "success" },
  declined: { label: "Declined", variant: "destructive" },
  expired: { label: "Expired", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
};

export function getStatusConfig(status: string) {
  return (
    APPLICATION_STATUS_CONFIG[status] ?? {
      label: status,
      variant: "outline" as const,
    }
  );
}

/**
 * Family-facing, plain-language status label (EN+ES). This is the single
 * source of truth for how a parent reads an application/offer status —
 * e.g. `lottery_assigned` renders as "In the lottery" / "En el sorteo"
 * instead of the precise staff term "Lottery Assigned". Falls back to the
 * staff label (English only) for any status without a `status.*` key in
 * translations.ts, so nothing ever renders blank.
 */
export function getFamilyStatusLabel(status: string, locale: Locale): string {
  const key = `status.${status}` as TranslationKey;
  const localized = tx(key, locale);
  return localized === key ? getStatusConfig(status).label : localized;
}

/**
 * Grade level display labels
 */
export const GRADE_LABELS: Record<string, string> = {
  "6": "6th Grade",
  "7": "7th Grade",
  "8": "8th Grade",
  "9": "9th Grade",
  "10": "10th Grade",
  "11": "11th Grade",
  "12": "12th Grade",
};

export function getGradeLabel(code: string) {
  return GRADE_LABELS[code] ?? `Grade ${code}`;
}

/**
 * Phase 3 Pipeline stage tabs — collapses the application_status enum
 * (12 lifecycle values in `application_status`, plus `placement_review` /
 * `enrolled` added in migration 00024) into the 6 stages a reviewer actually
 * thinks in. Mapping is literal from the design handoff's Phase 3 section:
 *   Needs review      = submitted, needs_info
 *   Ready for lottery  = verified, lottery_assigned
 *   Offer out          = offered, accepted
 *   Registering        = registered, placement_review
 *   Enrolled           = enrolled
 *   Waitlist           = waitlisted
 * `draft` (not yet submitted) and the terminal statuses (declined, expired,
 * withdrawn) intentionally have no stage — they never appear in Pipeline,
 * same as they're absent from the old kanban's "closed" bucket being
 * separate from the active funnel.
 */
export interface PipelineStageConfig {
  key: string;
  label: string;
  statuses: string[];
}

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { key: "needs_review", label: "Needs review", statuses: ["submitted", "needs_info"] },
  { key: "ready_for_lottery", label: "Ready for lottery", statuses: ["verified", "lottery_assigned"] },
  { key: "offer_out", label: "Offer out", statuses: ["offered", "accepted"] },
  { key: "registering", label: "Registering", statuses: ["registered", "placement_review"] },
  { key: "enrolled", label: "Enrolled", statuses: ["enrolled"] },
  { key: "waitlist", label: "Waitlist", statuses: ["waitlisted"] },
];

export const DEFAULT_PIPELINE_STAGE = PIPELINE_STAGES[0].key;

export function statusesForStage(stageKey: string): string[] {
  return PIPELINE_STAGES.find((s) => s.key === stageKey)?.statuses ?? PIPELINE_STAGES[0].statuses;
}

/** Turn a snake_case type ("proof_of_residency") into "Proof Of Residency". */
export function prettifyType(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
