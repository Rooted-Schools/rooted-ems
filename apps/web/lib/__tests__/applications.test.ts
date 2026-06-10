/**
 * Security-contract tests for family-facing application mutations.
 *
 * Contract per mutation:
 *   1. Unauthenticated caller  → "Not authenticated", NO database write
 *   2. Authenticated non-owner → "Not authorized",    NO database write
 *   3. Owner                   → guard passes, write proceeds
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock, hasEqFilter } from "./helpers/supabase-mock";
import {
  submitApplication,
  withdrawApplication,
  updateApplication,
} from "@/lib/mutations/applications";

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

vi.mock("@/lib/auth/get-session", () => ({
  requireStaffSession: vi.fn(async () => ({ user_id: "staff-1", is_staff: true })),
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
  notifyFamilyApplicationReceived: vi.fn(async () => {}),
  notifyFamilyApplicationVerified: vi.fn(async () => {}),
  notifyFamilyNeedsInfo: vi.fn(async () => {}),
  notifyFamilyApplicationWaitlisted: vi.fn(async () => {}),
  notifyStaffNewApplication: vi.fn(async () => {}),
}));

const OWNER = { id: "user-owner" };
const ATTACKER = { id: "user-attacker" };
const APP_ID = "app-1";

/** Result of the ownership-guard select on `application`. */
const guardRow = (ownerUserId: string) => ({
  data: { id: APP_ID, guardian: { user_id: ownerUserId } },
  error: null,
});

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
});

// ─── submitApplication ──────────────────────────────────────────────────────

describe("submitApplication", () => {
  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);

    const result = await submitApplication(APP_ID);

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects a user who is not the guardian owner and performs no write", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("application", guardRow(OWNER.id));

    const result = await submitApplication(APP_ID);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("allows the owning guardian to submit a draft application", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      { data: { id: APP_ID, status: "draft" }, error: null }, // status fetch
      { data: null, error: null } // update result
    );

    const result = await submitApplication(APP_ID);

    expect(result.error).toBeNull();
    const writes = supabaseMock.writes("application");
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("update");
    expect(writes[0].payload).toMatchObject({ status: "submitted" });
    expect(hasEqFilter(writes[0], "id", APP_ID)).toBe(true);
  });

  it("refuses to submit a non-draft application (no write)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      { data: { id: APP_ID, status: "submitted" }, error: null }
    );

    const result = await submitApplication(APP_ID);

    expect(result.error).toBe("Only draft applications can be submitted");
    expect(supabaseMock.writes()).toHaveLength(0);
  });
});

// ─── withdrawApplication ────────────────────────────────────────────────────

describe("withdrawApplication", () => {
  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);

    const result = await withdrawApplication(APP_ID, "moving away");

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects a user who is not the guardian owner and performs no write", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("application", guardRow(OWNER.id));

    const result = await withdrawApplication(APP_ID);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("allows the owning guardian to withdraw a submitted application", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      { data: { id: APP_ID, status: "submitted" }, error: null },
      { data: null, error: null } // update result
    );

    const result = await withdrawApplication(APP_ID, "changed plans");

    expect(result.error).toBeNull();
    const writes = supabaseMock.writes("application");
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({
      status: "withdrawn",
      review_notes: "changed plans",
    });
    expect(hasEqFilter(writes[0], "id", APP_ID)).toBe(true);
  });

  it("refuses to withdraw an application in a non-withdrawable status (no write)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      { data: { id: APP_ID, status: "registered" }, error: null }
    );

    const result = await withdrawApplication(APP_ID);

    expect(result.error).toContain("Cannot withdraw");
    expect(supabaseMock.writes()).toHaveLength(0);
  });
});

// ─── updateApplication ──────────────────────────────────────────────────────

describe("updateApplication", () => {
  const input = { application_id: APP_ID, student_first_name: "Maya" };

  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);

    const result = await updateApplication(input);

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects a user who is not the guardian owner and performs no write", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("application", guardRow(OWNER.id));

    const result = await updateApplication(input);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("allows the owning guardian to update their draft application", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      {
        data: {
          id: APP_ID,
          status: "draft",
          student_id: "stu-1",
          guardian_id: "g-1",
          campus_id: "c-1",
        },
        error: null,
      }
    );
    supabaseMock.queueResult("student", { data: null, error: null }); // update result

    const result = await updateApplication(input);

    expect(result.error).toBeNull();
    const studentWrites = supabaseMock.writes("student");
    expect(studentWrites).toHaveLength(1);
    expect(studentWrites[0].op).toBe("update");
    expect(studentWrites[0].payload).toMatchObject({ first_name: "Maya" });
    expect(hasEqFilter(studentWrites[0], "id", "stu-1")).toBe(true);
  });

  it("refuses to edit a non-draft application (no write)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      {
        data: {
          id: APP_ID,
          status: "submitted",
          student_id: "stu-1",
          guardian_id: "g-1",
          campus_id: "c-1",
        },
        error: null,
      }
    );

    const result = await updateApplication(input);

    expect(result.error).toBe("Only draft applications can be edited");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  // Placement fields (campus/grade/window) are updatable on drafts only —
  // used by the auto-save flow when a family changes campus on a saved draft.
  const placementInput = {
    application_id: APP_ID,
    campus_id: "c-2",
    grade_level_id: "gl-2",
    enrollment_window_id: "ew-2",
  };

  it("rejects placement changes from unauthenticated users (no write)", async () => {
    supabaseMock.setUser(null);

    const result = await updateApplication(placementInput);

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects placement changes from a non-owner (no write)", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("application", guardRow(OWNER.id));

    const result = await updateApplication(placementInput);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("persists placement changes for the owning guardian's draft", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      {
        data: {
          id: APP_ID,
          status: "draft",
          student_id: "stu-1",
          guardian_id: "g-1",
          campus_id: "c-1",
        },
        error: null,
      },
      { data: null, error: null } // application update result
    );

    const result = await updateApplication(placementInput);

    expect(result.error).toBeNull();
    const appWrites = supabaseMock.writes("application");
    expect(appWrites).toHaveLength(1);
    expect(appWrites[0].op).toBe("update");
    expect(appWrites[0].payload).toMatchObject({
      campus_id: "c-2",
      grade_level_id: "gl-2",
      enrollment_window_id: "ew-2",
    });
    expect(hasEqFilter(appWrites[0], "id", APP_ID)).toBe(true);
  });
});
