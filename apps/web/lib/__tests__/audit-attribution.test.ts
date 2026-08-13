/**
 * Attribution contracts for the audit trail.
 *
 * The audit_event table is where an enrollment record answers "who did this".
 * These tests cover the pure shaping logic behind three places that previously
 * could not answer it:
 *
 *   1. Offers issued by a lottery wrote no audit event at all, so the largest
 *      batch of seat awards the product makes had no attributable trace.
 *   2. Every decline logged as "System", so a family's own decision and a
 *      staff member recording a phone call were indistinguishable afterwards.
 *   3. Verification toggles wrote nothing, so verify → unverify → re-verify
 *      left only current state and no history.
 *
 * The database work is covered elsewhere; what is asserted here is the shape
 * and the attribution, which is what a reader of the trail actually sees.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

// The @rooted-ems/utils barrel pulls in a zod-dependent module that does not
// load under this runner; lottery.ts only needs these two.
vi.mock("@rooted-ems/utils", () => ({
  generateLotterySeed: () => "test-seed-0001",
  runDeterministicLottery: () => ({ ranked: [], seed: "test-seed-0001" }),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(async () => {}),
  AuditAction: {
    Create: "create",
    Update: "update",
    Delete: "delete",
    StatusChange: "status_change",
    Login: "login",
    Export: "export",
  },
}));

vi.mock("@/lib/notify", () => ({
  notifyFamilyOfOffer: vi.fn(async () => ({ inApp: true, email: true, sms: false })),
  notifyFamilyApplicationWaitlisted: vi.fn(async () => ({ inApp: true, email: true, sms: false })),
  notifyStaffOfferAccepted: vi.fn(async () => {}),
  notifyStaffOfferDeclined: vi.fn(async () => {}),
  anyChannelDelivered: () => true,
}));

vi.mock("@/lib/auth/get-session", () => ({
  requireStaffSession: vi.fn(async () => ({ user_id: "staff-1" })),
}));

vi.mock("@/lib/mutations/enrollment", () => ({
  createEnrollment: vi.fn(async () => ({ data: { id: "enr-1" }, error: null })),
}));

vi.mock("@/lib/mutations/registration", () => ({
  initializeRegistrationPacket: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock("@/lib/mutations/waitlist", () => ({
  ensureWaitlist: vi.fn(async () => ({ data: { id: "wl-1" }, error: null })),
  addToWaitlist: vi.fn(async () => ({ data: null, error: null })),
  promoteFromWaitlist: vi.fn(async () => ({ data: null, error: null })),
  promoteNextWaitlistCandidate: vi.fn(async () => true),
}));

import { buildLotteryOfferAuditEvent } from "@/lib/mutations/lottery";
import { resolveDeclineActor } from "@/lib/mutations/offers";
import { buildVerificationAuditData } from "@/lib/mutations/verification";

// ─── Lottery-issued offers ──────────────────────────────────────────────────

describe("buildLotteryOfferAuditEvent", () => {
  const base = {
    offerId: "offer-1",
    applicationId: "app-1",
    campusId: "campus-1",
    offeredBy: "staff-1",
    expiresAt: "2027-03-15T00:00:00.000Z",
    fromStatus: "lottery_assigned",
    lotteryEntryId: "entry-1",
    runId: "run-1",
  };

  it("names the staff member who ran the send, never the system", () => {
    const event = buildLotteryOfferAuditEvent(base);

    expect(event.actor_id).toBe("staff-1");
    expect(event.actor_id).not.toBeNull();
  });

  it("reads identically to a hand-issued offer in the Audit Trail", () => {
    const event = buildLotteryOfferAuditEvent(base);

    // The same table, record, and action sendOffer writes for an offer a staff
    // member creates by hand (lib/mutations/offers.ts).
    expect(event.table_name).toBe("offer");
    expect(event.record_id).toBe("offer-1");
    expect(event.action).toBe("create");
    expect(event.campus_id).toBe("campus-1");

    // And the same new_data keys, so the two kinds of offer are not visibly
    // different rows to someone auditing the enrollment record.
    expect(Object.keys(event.new_data as Record<string, unknown>).sort()).toEqual([
      "application_id",
      "expires_at",
      "status",
    ]);
    expect(event.new_data).toEqual({
      application_id: "app-1",
      status: "pending",
      expires_at: "2027-03-15T00:00:00.000Z",
    });
  });

  it("carries the lottery linkage so a seat can be traced back to its run", () => {
    const event = buildLotteryOfferAuditEvent(base);

    expect(event.metadata).toMatchObject({
      lottery_run_id: "run-1",
      lottery_entry_id: "entry-1",
      from_status: "lottery_assigned",
      issued_by: "lottery",
    });
  });

  it("records an unknown prior status as null rather than inventing one", () => {
    const event = buildLotteryOfferAuditEvent({ ...base, fromStatus: null });

    expect((event.metadata as Record<string, unknown>).from_status).toBeNull();
  });
});

// ─── Decline attribution ────────────────────────────────────────────────────

describe("resolveDeclineActor", () => {
  it("records a staff-recorded decline as the acting staff member", () => {
    const actor = resolveDeclineActor({
      actingStaffUserId: "staff-1",
      authenticatedUserId: null,
      declinedBy: undefined,
      guardianUserId: "guardian-user-1",
    });

    expect(actor).toEqual({ actorId: "staff-1", kind: "staff_on_behalf" });
  });

  it("records a family decline as the family user who was authenticated", () => {
    const actor = resolveDeclineActor({
      actingStaffUserId: null,
      authenticatedUserId: "guardian-user-1",
      declinedBy: undefined,
      guardianUserId: "guardian-user-1",
    });

    expect(actor).toEqual({ actorId: "guardian-user-1", kind: "family" });
  });

  it("keeps the two kinds of decline distinguishable even for the same user", () => {
    const family = resolveDeclineActor({
      authenticatedUserId: "user-1",
    });
    const staff = resolveDeclineActor({
      actingStaffUserId: "user-1",
    });

    expect(family.actorId).toBe(staff.actorId);
    expect(family.kind).not.toBe(staff.kind);
  });

  it("prefers the acting staff member over any caller-supplied id", () => {
    const actor = resolveDeclineActor({
      actingStaffUserId: "staff-1",
      declinedBy: "someone-else",
    });

    expect(actor.actorId).toBe("staff-1");
  });

  it("falls back to the caller-supplied id, then to the guardian's user id", () => {
    expect(
      resolveDeclineActor({ declinedBy: "user-2", guardianUserId: "guardian-user-1" }).actorId
    ).toBe("user-2");
    expect(resolveDeclineActor({ guardianUserId: "guardian-user-1" }).actorId).toBe(
      "guardian-user-1"
    );
  });

  it("returns null rather than a name it cannot stand behind", () => {
    // A guardian with no portal account has no user_profile row, and
    // audit_event.actor_id is a foreign key to user_profile — so there is no
    // id to write. Null is honest; a guardian row id would fail the constraint
    // and lose the event entirely.
    const actor = resolveDeclineActor({ guardianUserId: null });

    expect(actor.actorId).toBeNull();
    expect(actor.kind).toBe("family");
  });
});

// ─── Verification history ───────────────────────────────────────────────────

describe("buildVerificationAuditData", () => {
  it("records a verification as unverified to verified, with who and when", () => {
    const data = buildVerificationAuditData({
      wasVerified: false,
      previousVerifiedBy: null,
      previousVerifiedAt: null,
      isVerified: true,
      actorId: "staff-1",
      at: "2026-08-13T12:00:00.000Z",
    });

    expect(data.transition).toBe("verify");
    expect(data.old_data).toEqual({
      status: "unverified",
      verified_by: null,
      verified_at: null,
    });
    expect(data.new_data).toEqual({
      status: "verified",
      verified_by: "staff-1",
      verified_at: "2026-08-13T12:00:00.000Z",
    });
  });

  it("keeps the prior verifier on an un-verify, which the row itself discards", () => {
    // The update clears verified_by and verified_at, so without this the fact
    // that staff-1 had cleared the item is gone the moment staff-2 undoes it.
    const data = buildVerificationAuditData({
      wasVerified: true,
      previousVerifiedBy: "staff-1",
      previousVerifiedAt: "2026-08-01T09:00:00.000Z",
      isVerified: false,
      actorId: "staff-2",
      at: "2026-08-13T12:00:00.000Z",
    });

    expect(data.transition).toBe("unverify");
    expect(data.old_data).toEqual({
      status: "verified",
      verified_by: "staff-1",
      verified_at: "2026-08-01T09:00:00.000Z",
    });
    expect(data.new_data).toEqual({
      status: "unverified",
      verified_by: null,
      verified_at: null,
    });
  });

  it("distinguishes a re-verification from the original one", () => {
    const data = buildVerificationAuditData({
      wasVerified: false,
      previousVerifiedBy: null,
      previousVerifiedAt: null,
      isVerified: true,
      actorId: "staff-3",
      at: "2026-08-14T12:00:00.000Z",
    });

    expect(data.new_data.verified_by).toBe("staff-3");
    expect(data.new_data.verified_at).toBe("2026-08-14T12:00:00.000Z");
  });

  it("uses status strings the Audit Trail can render as a transition", () => {
    // The audit page builds its summary from old_data.status → new_data.status
    // (app/staff/audit/page.tsx). Booleans would render as nothing.
    const data = buildVerificationAuditData({
      wasVerified: true,
      previousVerifiedBy: "staff-1",
      previousVerifiedAt: "2026-08-01T09:00:00.000Z",
      isVerified: false,
      actorId: "staff-2",
      at: "2026-08-13T12:00:00.000Z",
    });

    expect(typeof data.old_data.status).toBe("string");
    expect(typeof data.new_data.status).toBe("string");
    expect(`${data.old_data.status} → ${data.new_data.status}`).toBe("verified → unverified");
  });
});
