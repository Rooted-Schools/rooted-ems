/**
 * Pure-logic tests for the enrollment activation predicates.
 *
 * These pin down three correctness bugs on the staff enrollment-finalize path:
 *
 *  1. staffActivateEnrollment used to flip status → active with no result
 *     check, so a non-pending row matched zero rows, returned no error, and the
 *     code still moved the application to enrolled and emailed the family about
 *     an activation that never happened. Only a pending enrollment is
 *     activatable.
 *
 *  2. staffCompleteAcademicAudit updated the enrollment by application_id with
 *     no status precondition, silently resurrecting a withdrawn or transferred
 *     enrollment to active. Only pending or active rows may be (re)activated.
 *
 *  3. The activate and audit paths never stamped enrolled_at, so an enrolled
 *     student showed a blank Enrolled date forever — the date an authorizer
 *     reads. The stamp must fill a null date but never overwrite a real one.
 */
import { describe, it, expect } from "vitest";
import {
  isEnrollmentActivatable,
  isEnrollmentAuditReactivatable,
  resolveEnrolledAt,
  ACTIVATABLE_ENROLLMENT_STATUSES,
  AUDIT_REACTIVATABLE_ENROLLMENT_STATUSES,
} from "@/lib/enrollment-rules";

describe("isEnrollmentActivatable", () => {
  it("activates only a pending enrollment", () => {
    expect(isEnrollmentActivatable("pending")).toBe(true);
  });

  it("refuses an already-active enrollment (no double activation)", () => {
    expect(isEnrollmentActivatable("active")).toBe(false);
  });

  it("refuses a withdrawn enrollment (no resurrection via activate)", () => {
    expect(isEnrollmentActivatable("withdrawn")).toBe(false);
  });

  it("refuses a transferred enrollment", () => {
    expect(isEnrollmentActivatable("transferred")).toBe(false);
  });

  it("refuses null/undefined/empty status", () => {
    expect(isEnrollmentActivatable(null)).toBe(false);
    expect(isEnrollmentActivatable(undefined)).toBe(false);
    expect(isEnrollmentActivatable("")).toBe(false);
  });

  it("exposes exactly ['pending'] as the activatable set", () => {
    expect([...ACTIVATABLE_ENROLLMENT_STATUSES]).toEqual(["pending"]);
  });
});

describe("isEnrollmentAuditReactivatable", () => {
  it("allows a pending enrollment to move to active", () => {
    expect(isEnrollmentAuditReactivatable("pending")).toBe(true);
  });

  it("allows an already-active enrollment (idempotent re-audit)", () => {
    expect(isEnrollmentAuditReactivatable("active")).toBe(true);
  });

  it("refuses a withdrawn enrollment (the core bug: no resurrection)", () => {
    expect(isEnrollmentAuditReactivatable("withdrawn")).toBe(false);
  });

  it("refuses a transferred enrollment", () => {
    expect(isEnrollmentAuditReactivatable("transferred")).toBe(false);
  });

  it("refuses null/undefined/empty status", () => {
    expect(isEnrollmentAuditReactivatable(null)).toBe(false);
    expect(isEnrollmentAuditReactivatable(undefined)).toBe(false);
    expect(isEnrollmentAuditReactivatable("")).toBe(false);
  });

  it("exposes exactly ['pending','active'] as the reactivatable set", () => {
    expect([...AUDIT_REACTIVATABLE_ENROLLMENT_STATUSES]).toEqual([
      "pending",
      "active",
    ]);
  });
});

describe("resolveEnrolledAt", () => {
  const now = "2026-08-19T12:00:00.000Z";

  it("stamps now when no enrolled_at exists yet", () => {
    expect(resolveEnrolledAt(null, now)).toBe(now);
    expect(resolveEnrolledAt(undefined, now)).toBe(now);
  });

  it("preserves a real earlier enrolled_at rather than overwriting it", () => {
    const earlier = "2026-06-01T09:30:00.000Z";
    expect(resolveEnrolledAt(earlier, now)).toBe(earlier);
  });
});
