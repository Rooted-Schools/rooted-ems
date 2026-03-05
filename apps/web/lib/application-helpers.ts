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

/**
 * Demo/mock data for the applications table (used until real data flows through)
 */
export interface MockApplication {
  id: string;
  studentName: string;
  guardianName: string;
  grade: string;
  campus: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
}

export const MOCK_APPLICATIONS: MockApplication[] = [
  {
    id: "app-001",
    studentName: "Marcus Johnson",
    guardianName: "Tanya Johnson",
    grade: "9",
    campus: "Vancouver WA",
    status: "submitted",
    submittedAt: "2026-02-28",
    updatedAt: "2026-02-28",
  },
  {
    id: "app-002",
    studentName: "Sofia Ramirez",
    guardianName: "Elena Ramirez",
    grade: "6",
    campus: "Columbia SC",
    status: "verified",
    submittedAt: "2026-02-25",
    updatedAt: "2026-03-01",
  },
  {
    id: "app-003",
    studentName: "Jaylen Williams",
    guardianName: "Derrick Williams",
    grade: "10",
    campus: "Cleveland OH",
    status: "needs_info",
    submittedAt: "2026-02-20",
    updatedAt: "2026-03-02",
  },
  {
    id: "app-004",
    studentName: "Ava Chen",
    guardianName: "Lisa Chen",
    grade: "7",
    campus: "Vancouver WA",
    status: "draft",
    submittedAt: null,
    updatedAt: "2026-03-03",
  },
  {
    id: "app-005",
    studentName: "Devon Thompson",
    guardianName: "Patricia Thompson",
    grade: "11",
    campus: "Columbia SC",
    status: "offered",
    submittedAt: "2026-01-15",
    updatedAt: "2026-03-01",
  },
  {
    id: "app-006",
    studentName: "Aisha Mohammed",
    guardianName: "Fatima Mohammed",
    grade: "8",
    campus: "Cleveland OH",
    status: "accepted",
    submittedAt: "2026-01-10",
    updatedAt: "2026-02-28",
  },
  {
    id: "app-007",
    studentName: "Tyler Brooks",
    guardianName: "Karen Brooks",
    grade: "9",
    campus: "Vancouver WA",
    status: "waitlisted",
    submittedAt: "2026-02-01",
    updatedAt: "2026-03-01",
  },
  {
    id: "app-008",
    studentName: "Maya Patel",
    guardianName: "Priya Patel",
    grade: "6",
    campus: "Columbia SC",
    status: "registered",
    submittedAt: "2025-12-15",
    updatedAt: "2026-02-20",
  },
];

/**
 * Demo campuses
 */
export const CAMPUSES = [
  { id: "campus-van", name: "Vancouver WA" },
  { id: "campus-col", name: "Columbia SC" },
  { id: "campus-cle", name: "Cleveland OH" },
];
