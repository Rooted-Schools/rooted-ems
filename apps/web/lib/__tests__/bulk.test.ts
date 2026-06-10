/**
 * Guard-rail tests for the bulk application mutations.
 *
 * bulkChangeApplicationStatus:
 *   1. Unauthenticated → requireStaffSession rejection propagates, NO write
 *   2. Invalid transitions are SKIPPED (reported per-item), never forced
 *   3. Partial failure does NOT abort the rest — later items still process
 *   4. Audit event written per successfully changed item
 *
 * bulkSendOffers:
 *   5. requireStaffSession rejection propagates, NO write
 *   6. Rows with an existing pending offer are skipped per-row;
 *      remaining rows still go through sendOffer
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock, hasEqFilter } from "./helpers/supabase-mock";
import { bulkChangeApplicationStatus, bulkSendOffers } from "@/lib/mutations/bulk";

const { requireStaffSessionMock, logAuditEventMock, sendOfferMock } = vi.hoisted(() => ({
  requireStaffSessionMock: vi.fn(),
  logAuditEventMock: vi.fn(async () => {}),
  sendOfferMock: vi.fn(),
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
  notifyFamilyApplicationVerified: vi.fn(async () => {}),
  notifyFamilyNeedsInfo: vi.fn(async () => {}),
  notifyFamilyApplicationWaitlisted: vi.fn(async () => {}),
}));

vi.mock("@/lib/mutations/offers", () => ({
  sendOffer: sendOfferMock,
}));

const STAFF = { user_id: "staff-1", is_staff: true };

const appRow = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  data: { id, status, campus_id: "c-1", ...extra },
  error: null,
});

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
  requireStaffSessionMock.mockResolvedValue(STAFF);
});

// ─── bulkChangeApplicationStatus ─────────────────────────────────────────────

describe("bulkChangeApplicationStatus", () => {
  it("propagates requireStaffSession rejection and performs no write", async () => {
    requireStaffSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT:/staff-login"));

    await expect(
      bulkChangeApplicationStatus(["app-1", "app-2"], "verified")
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("skips items with invalid transitions (reported, not forced) and continues", async () => {
    // app-1 is registered → "verified" is illegal; app-2 is submitted → legal
    supabaseMock.queueResult(
      "application",
      appRow("app-1", "registered"), // fetch app-1
      appRow("app-2", "submitted"),  // fetch app-2
      { data: null, error: null }    // update app-2
    );

    const results = await bulkChangeApplicationStatus(["app-1", "app-2"], "verified");

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: "app-1", ok: false });
    expect(results[0].error).toContain("Cannot transition");
    expect(results[1]).toMatchObject({ id: "app-2", ok: true });

    // Exactly ONE write — the invalid item was never forced
    const writes = supabaseMock.writes("application");
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ status: "verified" });
    expect(hasEqFilter(writes[0], "id", "app-2")).toBe(true);
  });

  it("continues processing after a per-item failure (partial failure does not abort)", async () => {
    supabaseMock.queueResult(
      "application",
      appRow("app-1", "submitted"),                      // fetch app-1
      { data: null, error: { message: "db timeout" } },  // update app-1 FAILS
      appRow("app-2", "submitted"),                      // fetch app-2
      { data: null, error: null }                        // update app-2 OK
    );

    const results = await bulkChangeApplicationStatus(["app-1", "app-2"], "verified");

    expect(results).toEqual([
      { id: "app-1", ok: false, error: "Failed to update status" },
      { id: "app-2", ok: true },
    ]);
    // Both updates were attempted — the first failure did not abort the loop
    expect(supabaseMock.writes("application")).toHaveLength(2);
  });

  it("writes one audit event per successfully changed item, same shape as single-item", async () => {
    supabaseMock.queueResult(
      "application",
      appRow("app-1", "submitted"),
      { data: null, error: null },
      appRow("app-2", "registered") // invalid target → skipped, no audit
    );

    await bulkChangeApplicationStatus(["app-1", "app-2"], "verified");

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        table_name: "application",
        record_id: "app-1",
        action: "status_change",
        actor_id: "staff-1",
        campus_id: "c-1",
        old_data: { status: "submitted" },
        new_data: { status: "verified" },
      })
    );
  });

  it("rejects an empty selection without touching the database", async () => {
    await expect(bulkChangeApplicationStatus([], "verified")).rejects.toThrow(
      "No applications selected."
    );
    expect(supabaseMock.writes()).toHaveLength(0);
  });
});

// ─── bulkSendOffers ──────────────────────────────────────────────────────────

describe("bulkSendOffers", () => {
  const FUTURE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  it("propagates requireStaffSession rejection and performs no write", async () => {
    requireStaffSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT:/staff-login"));

    await expect(bulkSendOffers(["app-1"], FUTURE)).rejects.toThrow("NEXT_REDIRECT");
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(sendOfferMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid expiry date before processing any item", async () => {
    await expect(bulkSendOffers(["app-1"], "not-a-date")).rejects.toThrow(
      "valid offer expiration date"
    );
    expect(sendOfferMock).not.toHaveBeenCalled();
  });

  it("skips rows with an existing pending offer and still processes the rest", async () => {
    supabaseMock.queueResult(
      "application",
      appRow("app-1", "verified", { grade_level_id: "gl-1" }),
      appRow("app-2", "verified", { grade_level_id: "gl-2" })
    );
    supabaseMock.queueResult(
      "offer",
      { data: { id: "offer-existing" }, error: null }, // app-1 pending offer exists
      { data: null, error: null }                       // app-2 has none
    );
    sendOfferMock.mockResolvedValue({ data: { id: "offer-new" }, error: null });

    const results = await bulkSendOffers(["app-1", "app-2"], FUTURE);

    expect(results).toEqual([
      { id: "app-1", ok: false, error: "already has a pending offer" },
      { id: "app-2", ok: true },
    ]);
    // sendOffer reused for the eligible row only — never reimplemented inline
    expect(sendOfferMock).toHaveBeenCalledTimes(1);
    expect(sendOfferMock).toHaveBeenCalledWith({
      application_id: "app-2",
      campus_id: "c-1",
      grade_level_id: "gl-2",
      expires_at: FUTURE,
      offered_by: "staff-1",
    });
  });

  it("reports a sendOffer per-row error without aborting the rest", async () => {
    supabaseMock.queueResult(
      "application",
      appRow("app-1", "draft", { grade_level_id: "gl-1" }),
      appRow("app-2", "verified", { grade_level_id: "gl-2" })
    );
    // No pending offers for either row (default empty queue → data: null)
    sendOfferMock
      .mockResolvedValueOnce({
        data: null,
        error: 'Cannot send offer: application is in "draft" status.',
      })
      .mockResolvedValueOnce({ data: { id: "offer-new" }, error: null });

    const results = await bulkSendOffers(["app-1", "app-2"], FUTURE);

    expect(results[0]).toMatchObject({ id: "app-1", ok: false });
    expect(results[0].error).toContain('"draft" status');
    expect(results[1]).toEqual({ id: "app-2", ok: true });
    expect(sendOfferMock).toHaveBeenCalledTimes(2);
  });
});
