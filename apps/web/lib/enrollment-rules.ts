/**
 * Pure enrollment-activation rules. Kept free of any server-only import (no
 * database client, no next/headers) so they can be unit-tested directly. The
 * mutations in lib/mutations/enrollment.ts re-export these, so existing
 * importers are unaffected.
 */

// ─── Activation predicates (pure) ──────────────────────

/**
 * Only a pending enrollment may be activated by staffActivateEnrollment. A row
 * in any other state (active already, withdrawn, transferred) must be treated
 * as a no-op the caller has to be told about — never silently flipped, and
 * never allowed to trigger the downstream application-status change and family
 * notification.
 */
export const ACTIVATABLE_ENROLLMENT_STATUSES = ["pending"] as const;

export function isEnrollmentActivatable(
  status: string | null | undefined
): boolean {
  return (
    !!status &&
    (ACTIVATABLE_ENROLLMENT_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * The academic audit may move a pending OR an already-active enrollment to
 * active, but must never resurrect a withdrawn or transferred enrollment.
 */
export const AUDIT_REACTIVATABLE_ENROLLMENT_STATUSES = [
  "pending",
  "active",
] as const;

export function isEnrollmentAuditReactivatable(
  status: string | null | undefined
): boolean {
  return (
    !!status &&
    (AUDIT_REACTIVATABLE_ENROLLMENT_STATUSES as readonly string[]).includes(
      status
    )
  );
}

/**
 * COALESCE-style guard for the enrolled_at stamp: keep a real earlier
 * enrollment date if one already exists, otherwise stamp `now`. enrolled_at is
 * the date an authorizer reads, so it must never be overwritten once set.
 */
export function resolveEnrolledAt(
  existing: string | null | undefined,
  now: string
): string {
  return existing ?? now;
}
