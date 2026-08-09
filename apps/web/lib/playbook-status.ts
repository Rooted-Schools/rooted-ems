/**
 * Playbook PB 24 v2.2 family status codes.
 *
 * The playbook defines six codes with a trigger and a required action each,
 * and staff read those codes in the document. Until now the app spoke a
 * different language entirely (application_status, offer_status,
 * registration_packet.status), so a staff member holding the playbook had to
 * translate in their head. That translation is where playbooks go to die.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS DERIVED AND NOT A STORED COLUMN
 *
 * Five of the six codes already have their state somewhere in the schema.
 * Adding a `status_code` column would create a second source of truth that
 * must be kept in sync with the first, and the first time someone updates an
 * offer without running the sync, the two disagree. There is no way to tell
 * which is right after that, and a family's status is not a thing you want to
 * be guessing about.
 *
 * Deriving costs a function call and can never drift.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Two codes are not yet reachable and say so honestly rather than being
 * quietly absent:
 *   ORI_CONFIRMED  needs orientation tracking, which does not exist (deferred).
 *   ACTIVE         needs Day 1 attendance, which needs the SIS integration.
 */

export const PLAYBOOK_STATUS_CODES = [
  "WAITLIST",
  "DECLINED",
  "ENROLLED",
  "MELT_RISK",
  "ORI_CONFIRMED",
  "ACTIVE",
] as const;

export type PlaybookStatusCode = (typeof PLAYBOOK_STATUS_CODES)[number];

export interface PlaybookStatusMeta {
  code: PlaybookStatusCode;
  label: string;
  /** The playbook's trigger, so the UI can explain why a family shows this. */
  trigger: string;
  /** The playbook's required action. */
  action: string;
  /** False when the app cannot yet compute this code. */
  supported: boolean;
  /** Why it is not supported, shown instead of pretending the code is unused. */
  unsupportedReason?: string;
}

export const PLAYBOOK_STATUS_META: Record<PlaybookStatusCode, PlaybookStatusMeta> = {
  WAITLIST: {
    code: "WAITLIST",
    label: "Waitlist",
    trigger: "Lottery waitlist position assigned",
    action: "Automated waitlist position notification",
    supported: true,
  },
  DECLINED: {
    code: "DECLINED",
    label: "Declined",
    trigger: "Family declined seat or withdrew application",
    action: "Trigger refusal tracking log entry",
    supported: true,
  },
  ENROLLED: {
    code: "ENROLLED",
    label: "Fully enrolled",
    trigger: "All required documents received",
    action: "Send summer outreach sequence",
    supported: true,
  },
  MELT_RISK: {
    code: "MELT_RISK",
    label: "Summer melt risk",
    trigger: "No contact in 14+ days",
    action: "Alert DO for personal outreach",
    supported: true,
  },
  ORI_CONFIRMED: {
    code: "ORI_CONFIRMED",
    label: "Orientation confirmed",
    trigger: "Family confirmed orientation attendance",
    action: "Send pre-orientation packet",
    supported: false,
    unsupportedReason:
      "Orientation tracking does not exist in the app yet. Deferred pending a decision on what orientation looks like at each campus.",
  },
  ACTIVE: {
    code: "ACTIVE",
    label: "Active student",
    trigger: "Attended Day 1",
    action: "Remove from melt risk; begin retention track",
    supported: false,
    unsupportedReason:
      "Needs Day 1 attendance from PowerSchool or Skyward Qmlativ. Available once the SIS integration lands.",
  },
};

/**
 * The state this derivation reads. Deliberately a plain input object rather
 * than a database row so it can be unit tested without a database, and so
 * every caller has to be explicit about what it knows.
 */
export interface FamilyStateInput {
  /** offer.status, when an offer exists. */
  offerStatus?: string | null;
  /** application.status. */
  applicationStatus?: string | null;
  /** registration_packet.status. */
  packetStatus?: string | null;
  /** True when the family holds a live waitlist position. */
  onWaitlist?: boolean;
  /** Days since a HUMAN logged contact. Null when nobody ever has. */
  daysSinceContact?: number | null;
  /** True while the family is between acceptance and the first day of school. */
  inMeltWindow?: boolean;
}

/** Playbook MELT_RISK threshold, mirrored from the melt queries. */
const MELT_RISK_DAYS = 14;

/**
 * Derive the playbook code for one family.
 *
 * Order matters and is not alphabetical. It runs most-terminal first:
 * DECLINED and WAITLIST describe where a family ENDED UP, and a declined
 * family is not also a melt risk. MELT_RISK is checked before ENROLLED
 * because a quiet enrolled family is exactly the case the playbook wants
 * surfaced, and reporting them as plain ENROLLED is how they get missed.
 *
 * Returns null rather than a default code when nothing applies. A family
 * mid-application genuinely has no playbook status, and inventing one would
 * put families into buckets the playbook never defined.
 */
export function derivePlaybookStatus(state: FamilyStateInput): PlaybookStatusCode | null {
  const { offerStatus, applicationStatus, packetStatus, onWaitlist, daysSinceContact, inMeltWindow } =
    state;

  if (offerStatus === "declined" || applicationStatus === "declined" || applicationStatus === "withdrawn") {
    return "DECLINED";
  }

  if (onWaitlist || applicationStatus === "waitlisted") {
    return "WAITLIST";
  }

  const fullyEnrolled = packetStatus === "complete";

  if (fullyEnrolled && inMeltWindow) {
    const silent = daysSinceContact === null || (daysSinceContact ?? 0) >= MELT_RISK_DAYS;
    if (silent) return "MELT_RISK";
  }

  if (fullyEnrolled) return "ENROLLED";

  return null;
}

/** Codes the app can actually compute today. */
export function supportedStatusCodes(): PlaybookStatusMeta[] {
  return PLAYBOOK_STATUS_CODES.map((c) => PLAYBOOK_STATUS_META[c]).filter((m) => m.supported);
}

/** Codes the playbook defines that the app cannot yet compute. */
export function unsupportedStatusCodes(): PlaybookStatusMeta[] {
  return PLAYBOOK_STATUS_CODES.map((c) => PLAYBOOK_STATUS_META[c]).filter((m) => !m.supported);
}
