import {
  ApplicationStatus,
  EnrollmentStatus,
  GradeLevelCode,
  OfferStatus,
  StaffRole,
} from "@rooted-ems/types";

// ============================================
// Brand Tokens
// ============================================

export const BRAND = {
  colors: {
    green: "#81A780",
    greenLight: "#A3C2A2",
    greenDark: "#5E8A5D",
    gray: "#ECECEC",
    grayDark: "#D1D1D1",
    grayDarker: "#8C8C8C",
  },
  font: {
    family: "Arial, system-ui, -apple-system, sans-serif",
  },
} as const;

// ============================================
// Grade Level Labels
// ============================================

export const GRADE_LEVEL_LABELS: Record<GradeLevelCode, string> = {
  [GradeLevelCode.Six]: "6th Grade",
  [GradeLevelCode.Seven]: "7th Grade",
  [GradeLevelCode.Eight]: "8th Grade",
  [GradeLevelCode.Nine]: "9th Grade",
  [GradeLevelCode.Ten]: "10th Grade",
  [GradeLevelCode.Eleven]: "11th Grade",
  [GradeLevelCode.Twelve]: "12th Grade",
};

// ============================================
// Role Labels & Hierarchy
// ============================================

export const ROLE_LABELS: Record<StaffRole, string> = {
  [StaffRole.SystemAdmin]: "System Admin",
  [StaffRole.EnrollmentManager]: "Enrollment Manager",
  [StaffRole.EnrollmentStaff]: "Enrollment Staff",
  [StaffRole.ComplianceAuditor]: "Compliance Auditor",
};

export const ROLE_HIERARCHY: StaffRole[] = [
  StaffRole.ComplianceAuditor,
  StaffRole.EnrollmentStaff,
  StaffRole.EnrollmentManager,
  StaffRole.SystemAdmin,
];

// ============================================
// Application Status Labels & Flow
// ============================================

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.Draft]: "Draft",
  [ApplicationStatus.Submitted]: "Submitted",
  [ApplicationStatus.NeedsInfo]: "Needs Information",
  [ApplicationStatus.Verified]: "Verified",
  [ApplicationStatus.LotteryAssigned]: "Lottery Assigned",
  [ApplicationStatus.Offered]: "Offered",
  [ApplicationStatus.Accepted]: "Accepted",
  [ApplicationStatus.Waitlisted]: "Waitlisted",
  [ApplicationStatus.Registered]: "Registered",
  [ApplicationStatus.Declined]: "Declined",
  [ApplicationStatus.Expired]: "Expired",
  [ApplicationStatus.Withdrawn]: "Withdrawn",
};

/** Valid transitions from each application status. */
export const APPLICATION_STATUS_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  [ApplicationStatus.Draft]: [
    ApplicationStatus.Submitted,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.Submitted]: [
    ApplicationStatus.NeedsInfo,
    ApplicationStatus.Verified,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.NeedsInfo]: [
    ApplicationStatus.Submitted,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.Verified]: [
    ApplicationStatus.LotteryAssigned,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.LotteryAssigned]: [
    ApplicationStatus.Offered,
    ApplicationStatus.Waitlisted,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.Offered]: [
    ApplicationStatus.Accepted,
    ApplicationStatus.Declined,
    ApplicationStatus.Expired,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.Accepted]: [
    ApplicationStatus.Registered,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.Waitlisted]: [
    ApplicationStatus.Offered,
    ApplicationStatus.Withdrawn,
  ],
  [ApplicationStatus.Registered]: [ApplicationStatus.Withdrawn],
  [ApplicationStatus.Declined]: [],
  [ApplicationStatus.Expired]: [],
  [ApplicationStatus.Withdrawn]: [],
};

// ============================================
// Offer & Enrollment Status Labels
// ============================================

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  [OfferStatus.Pending]: "Pending",
  [OfferStatus.Accepted]: "Accepted",
  [OfferStatus.Declined]: "Declined",
  [OfferStatus.Expired]: "Expired",
  [OfferStatus.Revoked]: "Revoked",
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.Pending]: "Pending",
  [EnrollmentStatus.Active]: "Active",
  [EnrollmentStatus.Withdrawn]: "Withdrawn",
  [EnrollmentStatus.Transferred]: "Transferred",
};

// ============================================
// Pagination Defaults
// ============================================

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;
