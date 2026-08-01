/**
 * Waitlist-position history contract (Phase 5B, item 2).
 *
 * Every mutation that sets/updates waitlist_position must write a
 * corresponding waitlist_position_history row in the same operation, tagged
 * with the correct change_type:
 *   - addToWaitlist       -> "initial"
 *   - promoteFromWaitlist -> "promoted" (position held at the moment of promotion)
 *   - removeFromWaitlist  -> "removed"  (position held at the moment of removal,
 *                             with the caller's reason carried through)
 *
 * recordWaitlistPositionHistory itself is mocked here — its own contract
 * (never throws, best-effort insert) lives in waitlist-history.ts and isn't
 * re-tested; this file only asserts each mutation CALLS it with the right
 * shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock } from "./helpers/supabase-mock";
import { addToWaitlist, promoteFromWaitlist, removeFromWaitlist } from "@/lib/mutations/waitlist";

const { recordHistoryMock } = vi.hoisted(() => ({
  recordHistoryMock: vi.fn(async () => {}),
}));

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

vi.mock("@/lib/mutations/waitlist-history", () => ({
  recordWaitlistPositionHistory: recordHistoryMock,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(async () => {}),
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
  notifyWaitlistMovement: vi.fn(async () => {}),
}));

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
});

describe("addToWaitlist", () => {
  it("records an 'initial' history row for the new position", async () => {
    supabaseMock.queueResult("waitlist_position", { data: { id: "wp-1" }, error: null });
    supabaseMock.queueResult("application", { data: null, error: null }); // status -> waitlisted
    supabaseMock.queueResult("waitlist", { data: { campus_id: "c-1" }, error: null }); // audit lookup

    const result = await addToWaitlist({
      waitlist_id: "wl-1",
      application_id: "app-1",
      position_number: 5,
    });

    expect(result.error).toBeNull();
    expect(recordHistoryMock).toHaveBeenCalledWith({
      waitlistPositionId: "wp-1",
      applicationId: "app-1",
      positionNumber: 5,
      changeType: "initial",
    });
  });
});

describe("promoteFromWaitlist", () => {
  it("records a 'promoted' history row at the position held before promotion", async () => {
    supabaseMock.queueResult(
      "waitlist_position",
      {
        data: {
          id: "wp-1",
          application_id: "app-1",
          waitlist_id: "wl-1",
          position_number: 3,
          waitlist: { campus_id: "c-1", grade_level_id: "gl-1" },
        },
        error: null,
      }, // fetch
      { data: null, error: null } // promoted_at/removed_at update
    );
    supabaseMock.queueResult("offer", { data: { id: "offer-1" }, error: null });
    supabaseMock.queueResult("application", { data: null, error: null }); // status -> offered

    const result = await promoteFromWaitlist("wp-1", "staff-1", new Date().toISOString());

    expect(result.error).toBeNull();
    expect(recordHistoryMock).toHaveBeenCalledWith({
      waitlistPositionId: "wp-1",
      applicationId: "app-1",
      positionNumber: 3,
      changeType: "promoted",
      reason: "Promoted to a seat offer",
    });
  });
});

describe("removeFromWaitlist", () => {
  it("records a 'removed' history row carrying the caller's reason", async () => {
    supabaseMock.queueResult(
      "waitlist_position",
      {
        data: {
          application_id: "app-1",
          waitlist_id: "wl-1",
          position_number: 4,
          waitlist: { campus_id: "c-1" },
        },
        error: null,
      }, // fetch
      { data: null, error: null } // removed_at/removal_reason update
    );
    supabaseMock.queueResult("application", { data: null, error: null }); // status -> withdrawn

    const result = await removeFromWaitlist("wp-1", "no longer interested", "staff-1");

    expect(result.error).toBeNull();
    expect(recordHistoryMock).toHaveBeenCalledWith({
      waitlistPositionId: "wp-1",
      applicationId: "app-1",
      positionNumber: 4,
      changeType: "removed",
      reason: "no longer interested",
    });
  });
});
