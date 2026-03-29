import type { BadgeProps } from "@/components/ui/badge";

/**
 * Maps application status enum values to display labels and badge variants
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
