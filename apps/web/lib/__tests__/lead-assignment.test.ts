import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock } from "./helpers/supabase-mock";

/**
 * assignLead is the single-lead half of lead ownership (see
 * lead-bulk-assign.test.ts for the bulk path, and
 * lead-claim-on-contact.test.ts for the automatic claim). The rule under
 * test: a lead may only be assigned to a staff member who actually holds a
 * role at THAT lead's campus, enforced server-side against the real staff
 * directory (getStaffUsers), never just trusted from a client-supplied id.
 */

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => supabaseMock.authClient(),
  createServiceRoleClient: () => supabaseMock.serviceClient(),
}));

// Module-scope imports in lib/mutations/leads.ts that assignLead itself
// never exercises, but which must resolve for the module to load.
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
  notifyLeadWelcome: vi.fn(async () => {}),
  notifyStaffNewLead: vi.fn(async () => {}),
}));
vi.mock("@/lib/messaging-flags", () => ({
  isWelcomeMessagingEnabled: vi.fn(async () => true),
}));

const { assignLead } = await import("@/lib/mutations/leads");

/** A user_campus_role row shaped the way getStaffUsers' embed expects it. */
function staffRow(userId: string, campusId: string, fullName = "Staff Member") {
  return {
    id: `ucr-${userId}-${campusId}`,
    role: "enrollment_staff",
    campus_id: campusId,
    user: { id: userId, full_name: fullName, email: `${userId}@example.com` },
    campus: { name: "Test Campus" },
  };
}

beforeEach(() => {
  supabaseMock.reset();
});

describe("assignLead", () => {
  it("rejects an assignee with no role at the lead's campus and writes nothing", async () => {
    supabaseMock.queueResult("lead", {
      data: { campus_id: "campus-a", assigned_to: null },
      error: null,
    });
    // getStaffUsers("campus-a") — the assignee only has a role at campus-b.
    supabaseMock.queueResult("user_campus_role", {
      data: [staffRow("other-staff", "campus-b")],
      error: null,
    });

    const result = await assignLead("lead-1", "staff-1", "actor-1");

    expect(result.error).toMatch(/doesn't have a role/i);
    expect(supabaseMock.writes("lead")).toHaveLength(0);
    expect(supabaseMock.writes("lead_activity")).toHaveLength(0);
  });

  it("assigns when the assignee holds a role at the lead's own campus", async () => {
    supabaseMock.queueResult("lead", {
      data: { campus_id: "campus-a", assigned_to: null },
      error: null,
    });
    supabaseMock.queueResult("user_campus_role", {
      data: [staffRow("staff-1", "campus-a")],
      error: null,
    });
    supabaseMock.queueResult("lead", { data: null, error: null }); // the update
    supabaseMock.queueResult("lead_activity", { data: null, error: null }); // the timeline note

    const result = await assignLead("lead-1", "staff-1", "actor-1");

    expect(result.error).toBeNull();
    const writes = supabaseMock.writes("lead");
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toEqual({ assigned_to: "staff-1" });
    expect(supabaseMock.writes("lead_activity")).toHaveLength(1);
  });

  it("clears an assignment without any campus-role check", async () => {
    supabaseMock.queueResult("lead", {
      data: { campus_id: "campus-a", assigned_to: "staff-1" },
      error: null,
    });
    supabaseMock.queueResult("lead", { data: null, error: null }); // the update
    supabaseMock.queueResult("lead_activity", { data: null, error: null });

    const result = await assignLead("lead-1", null, "actor-1");

    expect(result.error).toBeNull();
    expect(supabaseMock.writes("lead")[0].payload).toEqual({ assigned_to: null });
    // Clearing never needs the staff directory — only assigning does.
    expect(supabaseMock.ops.some((o) => o.table === "user_campus_role")).toBe(false);
  });

  it("is a no-op (no write, no staff lookup) when the assignee already owns the lead", async () => {
    supabaseMock.queueResult("lead", {
      data: { campus_id: "campus-a", assigned_to: "staff-1" },
      error: null,
    });

    const result = await assignLead("lead-1", "staff-1", "actor-1");

    expect(result.error).toBeNull();
    expect(supabaseMock.writes("lead")).toHaveLength(0);
    expect(supabaseMock.ops.some((o) => o.table === "user_campus_role")).toBe(false);
  });

  it("rejects cross-campus assignment even when the assignee is a valid staff member elsewhere", async () => {
    // Regression guard for the exact scenario the constraint names: the
    // assignee is real staff, just not at THIS lead's campus. getStaffUsers
    // is called with the LEAD's campus (campus-rsoh), and — faithfully to
    // how the real .eq("campus_id", ...) filter behaves — a query scoped to
    // that campus returns nothing for a staff member who only holds a role
    // at a different campus (campus-rssc).
    supabaseMock.queueResult("lead", {
      data: { campus_id: "campus-rsoh", assigned_to: null },
      error: null,
    });
    supabaseMock.queueResult("user_campus_role", {
      data: [],
      error: null,
    });

    const result = await assignLead("lead-1", "lalah", "actor-1");

    expect(result.error).toMatch(/doesn't have a role/i);
    expect(supabaseMock.writes("lead")).toHaveLength(0);
  });
});
