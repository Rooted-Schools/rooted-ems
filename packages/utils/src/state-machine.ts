/**
 * Application Status State Machine
 *
 * Enforces valid lifecycle transitions for charter school enrollment applications.
 *
 * PROBLEM WITHOUT THIS:
 *   Any mutation can set an application to any status at any time.
 *   A careless staff action (or a bug) could move an application from
 *   'draft' directly to 'registered', or from 'withdrawn' back to 'offered'.
 *   That corrupts pipeline data, breaks reporting, and creates compliance risk.
 *
 * HOW TO USE:
 *   Call isValidTransition(from, to) before any status update mutation.
 *   If it returns { allowed: false }, return an error instead of writing to the DB.
 *
 * LIFECYCLE:
 *
 *   draft
 *     → submitted           (family submits the application)
 *     → withdrawn           (family withdraws before submitting)
 *
 *   submitted
 *     → needs_info          (staff requests missing documents or corrections)
 *     → verified            (staff marks application complete and eligible)
 *     → withdrawn           (family or staff withdraws)
 *
 *   needs_info
 *     → submitted           (family resubmits after providing requested info)
 *     → verified            (staff verifies directly after reviewing family response)
 *     → withdrawn
 *
 *   verified
 *     → lottery_assigned    (added to a lottery run)
 *     → offered             (direct offer, no lottery — e.g., open seats remain)
 *     → withdrawn
 *
 *   lottery_assigned
 *     → offered             (won the lottery)
 *     → waitlisted          (did not win the lottery)
 *     → withdrawn
 *
 *   offered
 *     → accepted            (family accepts the seat)
 *     → declined            (family declines — terminal)
 *     → expired             (offer deadline passed — terminal)
 *     → withdrawn
 *
 *   accepted
 *     → registered          (family completes registration — enrolled)
 *     → withdrawn
 *
 *   waitlisted
 *     → offered             (a seat opened and this family was promoted)
 *     → withdrawn
 *
 *   registered
 *     → placement_review    (staff verified every registration item)
 *     → withdrawn           (family or staff records withdrawal from enrolled status)
 *
 *   placement_review
 *     → enrolled            (academic audit complete — the student has a seat)
 *     → registered          (undo — audit sent the packet back for more work)
 *     → withdrawn
 *
 *   enrolled
 *     → withdrawn           (student leaves after enrollment is final)
 *
 *   declined  → (terminal — no further transitions)
 *   expired   → (terminal — no further transitions)
 *   withdrawn → (terminal — no further transitions)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** All valid application status values — mirrors the application_status DB enum */
export type ApplicationStatusValue =
  | "draft"
  | "submitted"
  | "needs_info"
  | "verified"
  | "lottery_assigned"
  | "offered"
  | "accepted"
  | "waitlisted"
  | "registered"
  | "placement_review"
  | "enrolled"
  | "declined"
  | "expired"
  | "withdrawn";

export interface TransitionResult {
  allowed: boolean;
  /** Present when allowed is false — explains why the transition is rejected */
  reason?: string;
}

// ─── Transition Map ───────────────────────────────────────────────────────────

/**
 * Every valid transition in the enrollment lifecycle.
 * Terminal states map to empty arrays — no outbound transitions.
 */
const VALID_TRANSITIONS: Record<ApplicationStatusValue, ApplicationStatusValue[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["needs_info", "verified", "withdrawn"],
  needs_info: ["submitted", "verified", "withdrawn"],
  verified: ["lottery_assigned", "offered", "withdrawn"],
  lottery_assigned: ["offered", "waitlisted", "withdrawn"],
  offered: ["accepted", "declined", "expired", "withdrawn"],
  accepted: ["registered", "withdrawn"],
  waitlisted: ["offered", "withdrawn"],
  registered: ["placement_review", "withdrawn"],
  placement_review: ["enrolled", "withdrawn", "registered"],
  enrolled: ["withdrawn"],
  // Terminal states — once here, the record does not move
  declined: [],
  expired: [],
  withdrawn: [],
};

/** Status values that are terminal — no further transitions are allowed */
const TERMINAL_STATUSES: ReadonlySet<ApplicationStatusValue> = new Set([
  "declined",
  "expired",
  "withdrawn",
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether an application status transition is valid.
 *
 * @param from - The application's current status (what's in the database now)
 * @param to   - The desired new status
 * @returns TransitionResult — { allowed: true } or { allowed: false, reason: "..." }
 *
 * @example
 *   const check = isValidTransition("draft", "submitted");
 *   if (!check.allowed) return { data: null, error: check.reason };
 */
export function isValidTransition(
  from: ApplicationStatusValue,
  to: ApplicationStatusValue
): TransitionResult {
  // Transitioning to the same status is never meaningful
  if (from === to) {
    return {
      allowed: false,
      reason: `Application is already in status "${from}". No change made.`,
    };
  }

  // Terminal states cannot transition to anything
  if (TERMINAL_STATUSES.has(from)) {
    return {
      allowed: false,
      reason: `Cannot change status from "${from}" — this is a terminal state. No further transitions are allowed.`,
    };
  }

  const allowedTargets = VALID_TRANSITIONS[from] ?? [];
  if (allowedTargets.includes(to)) {
    return { allowed: true };
  }

  const allowedList =
    allowedTargets.length > 0
      ? allowedTargets.map((s) => `"${s}"`).join(", ")
      : "none";

  return {
    allowed: false,
    reason: `Cannot transition from "${from}" to "${to}". Allowed next statuses: ${allowedList}.`,
  };
}

/**
 * Returns true if the given status is a terminal state
 * (no further transitions are allowed from it).
 */
export function isTerminalStatus(status: ApplicationStatusValue): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Returns all valid next statuses for the given current status.
 * Returns an empty array for terminal states.
 */
export function getAllowedTransitions(
  from: ApplicationStatusValue
): ApplicationStatusValue[] {
  return VALID_TRANSITIONS[from] ?? [];
}
