/**
 * Security-contract tests for offer mutations.
 *
 * Family-facing (acceptOffer, declineOffer):
 *   1. Unauthenticated  → "Not authenticated", NO write
 *   2. Non-owner        → "Not authorized",    NO write
 *   3. Owner            → guard passes, write proceeds
 *
 * Staff-only (sendOffer, revokeOffer): requireStaffSession rejection
 * propagates and NO write occurs.
 *
 * expireOffer: atomic conditional update — chain must include
 * .eq("status", "pending"); a zero-row result must NOT be treated as success
 * (no application update, no audit event).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock, hasEqFilter } from "./helpers/supabase-mock";
import {
  sendOffer,
  acceptOffer,
  declineOffer,
  revokeOffer,
  expireOffer,
} from "@/lib/mutations/offers";

const {
  requireStaffSessionMock,
  createEnrollmentMock,
  initPacketMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireStaffSessionMock: vi.fn(),
  createEnrollmentMock: vi.fn(),
  initPacketMock: vi.fn(),
  logAuditEventMock: vi.fn(async () => {}),
}));

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

vi.mock("@/lib/auth/get-session", () => ({
  requireStaffSession: requireStaffSessionMock,
}));

vi.mock("@/lib/mutations/enrollment", () => ({
  createEnrollment: createEnrollmentMock,
}));

vi.mock("@/lib/mutations/registration", () => ({
  initializeRegistrationPacket: initPacketMock,
}));

vi.mock("@/lib/mutations/waitlist", () => ({
  promoteFromWaitlist: vi.fn(async () => ({ data: null, error: null })),
  promoteNextWaitlistCandidate: vi.fn(async () => true),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: logAuditEventMock,
  AuditAction: {
    Create: "create",
    Update: "update",
    Delete: "delete",
    StatusChange: "status_change",
    Export: "export",
  },
}));

vi.mock("@/lib/notify", () => ({
  notifyFamilyOfOffer: vi.fn(async () => {}),
  notifyStaffOfferAccepted: vi.fn(async () => {}),
  notifyStaffOfferDeclined: vi.fn(async () => {}),
}));

const OWNER = { id: "user-owner" };
const ATTACKER = { id: "user-attacker" };
const OFFER_ID = "offer-1";
const GUARDIAN_ID = "guardian-1";
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

/**
 * Result of the ownership-guard select on `offer` — the nested
 * application → guardian shape that getOfferGuardian() reads. The guardian
 * row must carry its own `id` (not just `user_id`); acceptOffer/declineOffer
 * derive the accepting/declining guardian from this id, never from a
 * client-supplied guardianId.
 */
const ownershipRow = (ownerUserId: string) => ({
  data: { id: OFFER_ID, application: { guardian: { id: GUARDIAN_ID, user_id: ownerUserId } } },
  error: null,
});

const pendingOfferRow = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: OFFER_ID,
    application_id: "app-1",
    campus_id: "c-1",
    grade_level_id: "gl-1",
    status: "pending",
    expires_at: FUTURE,
    ...overrides,
  },
  error: null,
});

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
});

// ─── acceptOffer ────────────────────────────────────────────────────────────

describe("acceptOffer", () => {
  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);
    // No "offer" result queued — the guardian-lookup select (which now runs
    // BEFORE the auth check) finds nothing, so the failure is "Not
    // authorized", not "Not authenticated". See getOfferGuardian in offers.ts.

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(createEnrollmentMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated user even when the offer's guardian resolves (ordering check)", async () => {
    supabaseMock.setUser(null);
    supabaseMock.queueResult("offer", ownershipRow(OWNER.id));

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(createEnrollmentMock).not.toHaveBeenCalled();
  });

  it("allows a valid staff actingStaffUserId to accept on behalf of the family without a family session", async () => {
    // No family session at all — the staff-on-behalf branch must skip the
    // family ownership check entirely.
    supabaseMock.setUser(null);
    supabaseMock.queueResult(
      "offer",
      ownershipRow(OWNER.id),
      pendingOfferRow(),
      { data: null, error: null } // offer update
    );
    supabaseMock.queueResult("acceptance", { data: { id: "acc-1" }, error: null });
    supabaseMock.queueResult(
      "application",
      { data: null, error: null }, // status update
      {
        data: { student_id: "stu-1", enrollment_window: { school_year_id: "sy-1" } },
        error: null,
      }
    );
    createEnrollmentMock.mockResolvedValue({ data: { id: "enr-1" }, error: null });
    initPacketMock.mockResolvedValue({ data: null, error: null });

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID, { actingStaffUserId: "staff-1" });

    expect(result.error).toBeNull();
    const offerWrites = supabaseMock.writes("offer");
    expect(offerWrites).toHaveLength(1);
    expect(offerWrites[0].payload).toMatchObject({ status: "accepted" });
    expect(createEnrollmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: "stu-1", school_year_id: "sy-1" })
    );
    // Acceptance is still recorded against the guardian on the offer, not
    // the staff member who clicked.
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "staff-1",
        metadata: expect.objectContaining({
          accepted_by_guardian_id: GUARDIAN_ID,
          on_behalf_of_family: true,
        }),
      })
    );
  });

  it("rejects a user who does not own the offer and performs no write", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("offer", ownershipRow(OWNER.id));

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(createEnrollmentMock).not.toHaveBeenCalled();
  });

  it("allows the owner to accept a pending offer and creates the enrollment", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "offer",
      ownershipRow(OWNER.id),
      pendingOfferRow(),
      { data: null, error: null } // offer update
    );
    supabaseMock.queueResult("acceptance", { data: { id: "acc-1" }, error: null });
    supabaseMock.queueResult(
      "application",
      { data: null, error: null }, // status update
      {
        data: { student_id: "stu-1", enrollment_window: { school_year_id: "sy-1" } },
        error: null,
      }
    );
    createEnrollmentMock.mockResolvedValue({ data: { id: "enr-1" }, error: null });
    initPacketMock.mockResolvedValue({ data: null, error: null });

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBeNull();
    const offerWrites = supabaseMock.writes("offer");
    expect(offerWrites).toHaveLength(1);
    expect(offerWrites[0].payload).toMatchObject({ status: "accepted" });
    expect(hasEqFilter(offerWrites[0], "id", OFFER_ID)).toBe(true);
    expect(createEnrollmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: "stu-1",
        school_year_id: "sy-1",
        application_id: "app-1",
      })
    );
  });

  it("surfaces enrollment-creation failure as an error (not swallowed)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "offer",
      ownershipRow(OWNER.id),
      pendingOfferRow(),
      { data: null, error: null }
    );
    supabaseMock.queueResult("acceptance", { data: { id: "acc-1" }, error: null });
    supabaseMock.queueResult(
      "application",
      { data: null, error: null },
      {
        data: { student_id: "stu-1", enrollment_window: { school_year_id: "sy-1" } },
        error: null,
      }
    );
    createEnrollmentMock.mockResolvedValue({ data: null, error: "capacity insert failed" });

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBe("Enrollment creation failed. Please contact support.");
    expect(initPacketMock).not.toHaveBeenCalled();
  });

  it("guards against an empty schoolYearId (errors before enrollment creation)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "offer",
      ownershipRow(OWNER.id),
      pendingOfferRow(),
      { data: null, error: null }
    );
    supabaseMock.queueResult("acceptance", { data: { id: "acc-1" }, error: null });
    supabaseMock.queueResult(
      "application",
      { data: null, error: null },
      { data: { student_id: "stu-1", enrollment_window: null }, error: null }
    );

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBe("Could not resolve school year. Please contact support.");
    expect(createEnrollmentMock).not.toHaveBeenCalled();
  });

  it("refuses an expired offer (no write)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "offer",
      ownershipRow(OWNER.id),
      pendingOfferRow({ expires_at: PAST })
    );

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toContain("expired");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("refuses a non-pending offer (no write)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "offer",
      ownershipRow(OWNER.id),
      pendingOfferRow({ status: "revoked" })
    );

    const result = await acceptOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBe("Offer is revoked, cannot accept.");
    expect(supabaseMock.writes()).toHaveLength(0);
  });
});

// ─── declineOffer ───────────────────────────────────────────────────────────

describe("declineOffer", () => {
  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);
    // No "offer" result queued — the guardian lookup fails first, so this
    // now surfaces as "Not authorized" rather than "Not authenticated".

    const result = await declineOffer(OFFER_ID);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects a user who does not own the offer and performs no write", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("offer", ownershipRow(OWNER.id));

    const result = await declineOffer(OFFER_ID);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("allows the owner to decline a pending offer", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "offer",
      ownershipRow(OWNER.id),
      pendingOfferRow(),
      { data: null, error: null } // offer update
    );
    supabaseMock.queueResult("application", { data: null, error: null });

    const result = await declineOffer(OFFER_ID, GUARDIAN_ID);

    expect(result.error).toBeNull();
    const offerWrites = supabaseMock.writes("offer");
    expect(offerWrites).toHaveLength(1);
    expect(offerWrites[0].payload).toMatchObject({ status: "declined" });
    expect(hasEqFilter(offerWrites[0], "id", OFFER_ID)).toBe(true);
  });
});

// ─── sendOffer / revokeOffer (staff-only) ───────────────────────────────────

describe("sendOffer", () => {
  const input = {
    application_id: "app-1",
    campus_id: "c-1",
    grade_level_id: "gl-1",
    expires_at: FUTURE,
    offered_by: "staff-1",
  };

  it("propagates requireStaffSession rejection and performs no write", async () => {
    requireStaffSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT:/staff-login"));

    await expect(sendOffer(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("creates the offer once the staff session check passes", async () => {
    requireStaffSessionMock.mockResolvedValue({ user_id: "staff-1", is_staff: true });
    supabaseMock.queueResult(
      "application",
      { data: { status: "verified" }, error: null },
      { data: null, error: null } // status update to "offered"
    );
    supabaseMock.queueResult("offer", { data: { id: OFFER_ID }, error: null });

    const result = await sendOffer(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: OFFER_ID });
    const offerWrites = supabaseMock.writes("offer");
    expect(offerWrites).toHaveLength(1);
    expect(offerWrites[0].op).toBe("insert");
    expect(offerWrites[0].payload).toMatchObject({
      application_id: "app-1",
      status: "pending",
    });
  });
});

describe("revokeOffer", () => {
  it("propagates requireStaffSession rejection and performs no write", async () => {
    requireStaffSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT:/staff-login"));

    await expect(revokeOffer(OFFER_ID, "staff-1", "seat error")).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(supabaseMock.writes()).toHaveLength(0);
  });
});

// ─── expireOffer (atomic conditional update) ────────────────────────────────

describe("expireOffer", () => {
  it("targets only pending offers via .eq('status', 'pending') in the update chain", async () => {
    supabaseMock.queueResult("offer", {
      data: {
        id: OFFER_ID,
        application_id: "app-1",
        campus_id: "c-1",
        grade_level_id: "gl-1",
      },
      error: null,
    });
    supabaseMock.queueResult("application", { data: null, error: null });

    const result = await expireOffer(OFFER_ID);

    expect(result.error).toBeNull();
    const offerWrites = supabaseMock.writes("offer");
    expect(offerWrites).toHaveLength(1);
    expect(offerWrites[0].op).toBe("update");
    expect(offerWrites[0].payload).toMatchObject({ status: "expired" });
    // The atomic guard — without this, two overlapping cron runs double-expire.
    expect(hasEqFilter(offerWrites[0], "status", "pending")).toBe(true);
    expect(hasEqFilter(offerWrites[0], "id", OFFER_ID)).toBe(true);
    // Winner cascades: application marked expired + audit event written.
    expect(supabaseMock.writes("application")).toHaveLength(1);
    expect(logAuditEventMock).toHaveBeenCalled();
  });

  it("handles a zero-row result (already processed) without marking success", async () => {
    // .single() on a 0-row update returns data:null + PGRST116 error.
    supabaseMock.queueResult("offer", {
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned" },
    });

    const result = await expireOffer(OFFER_ID);

    // Exits cleanly without propagating an error...
    expect(result).toEqual({ data: null, error: null });
    // ...but must NOT cascade as if it had expired the offer.
    expect(supabaseMock.writes("application")).toHaveLength(0);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
