import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock } from "./helpers/supabase-mock";

/**
 * bulkAssignLeads is the operationally important half of lead ownership: a
 * school leader splitting hundreds of unowned leads across a team in one
 * action. Two things matter here:
 *   1. It applies to EXACTLY the selected leads — no more, no fewer.
 *   2. A bulk selection can legitimately span more than one campus (e.g. an
 *      "All campuses" Unassigned view), so each lead is checked against the
 *      assignee's OWN campus roles independently — a lead outside the
 *      assignee's coverage is skipped and reported, not used to fail (or to
 *      silently drop) the rest of the batch.
 */

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => supabaseMock.authClient(),
  createServiceRoleClient: () => supabaseMock.serviceClient(),
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
  notifyLeadWelcome: vi.fn(async () => {}),
  notifyStaffNewLead: vi.fn(async () => {}),
}));
vi.mock("@/lib/messaging-flags", () => ({
  isWelcomeMessagingEnabled: vi.fn(async () => true),
}));

const { bulkAssignLeads } = await import("@/lib/mutations/leads");

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

describe("bulkAssignLeads", () => {
  it("applies to exactly the selected leads when the assignee covers every campus involved", async () => {
    supabaseMock.queueResult("lead", {
      data: [
        { id: "lead-a", campus_id: "campus-a" },
        { id: "lead-c", campus_id: "campus-a" },
      ],
      error: null,
    });
    supabaseMock.queueResult("user_campus_role", {
      data: [staffRow("staff-1", "campus-a")],
      error: null,
    });
    supabaseMock.queueResult("lead", { data: null, error: null }); // the bulk update
    supabaseMock.queueResult("lead_activity", { data: null, error: null });

    const results = await bulkAssignLeads(["lead-a", "lead-c"], "staff-1", "actor-1");

    expect(results.every((r) => r.ok)).toBe(true);
    const writes = supabaseMock.writes("lead");
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toEqual({ assigned_to: "staff-1" });
    const inFilter = writes[0].filters.find((f) => f.method === "in" && f.args[0] === "id");
    // Exactly the selected ids — not a superset, not a subset.
    expect(inFilter?.args[1]).toEqual(["lead-a", "lead-c"]);
    expect(supabaseMock.writes("lead_activity")).toHaveLength(1);
  });

  it("skips leads outside the assignee's campus coverage and still assigns the rest", async () => {
    supabaseMock.queueResult("lead", {
      data: [
        { id: "lead-a", campus_id: "campus-a" }, // assignee covers this
        { id: "lead-b", campus_id: "campus-b" }, // assignee does NOT cover this
      ],
      error: null,
    });
    // getStaffUsers("campus-a") — assignee has a role.
    supabaseMock.queueResult("user_campus_role", {
      data: [staffRow("staff-1", "campus-a")],
      error: null,
    });
    // getStaffUsers("campus-b") — assignee has no role.
    supabaseMock.queueResult("user_campus_role", { data: [], error: null });
    supabaseMock.queueResult("lead", { data: null, error: null }); // update — assignable only
    supabaseMock.queueResult("lead_activity", { data: null, error: null });

    const results = await bulkAssignLeads(["lead-a", "lead-b"], "staff-1", "actor-1");

    expect(results.find((r) => r.leadId === "lead-a")?.ok).toBe(true);
    const denied = results.find((r) => r.leadId === "lead-b");
    expect(denied?.ok).toBe(false);
    expect(denied?.error).toMatch(/doesn't have a role/i);

    const writes = supabaseMock.writes("lead");
    expect(writes).toHaveLength(1);
    const inFilter = writes[0].filters.find((f) => f.method === "in" && f.args[0] === "id");
    // lead-b must never appear in the write, even though it was selected.
    expect(inFilter?.args[1]).toEqual(["lead-a"]);

    // Only the successfully-assigned lead gets a timeline entry.
    const activityWrite = supabaseMock.writes("lead_activity")[0];
    expect(activityWrite.payload).toHaveLength(1);
    expect((activityWrite.payload as Array<{ lead_id: string }>)[0].lead_id).toBe("lead-a");
  });

  it("reports every selected lead as denied, and writes nothing, when the assignee covers none of the campuses", async () => {
    supabaseMock.queueResult("lead", {
      data: [{ id: "lead-a", campus_id: "campus-a" }],
      error: null,
    });
    supabaseMock.queueResult("user_campus_role", { data: [], error: null });

    const results = await bulkAssignLeads(["lead-a"], "staff-1", "actor-1");

    expect(results).toEqual([
      {
        leadId: "lead-a",
        ok: false,
        error: "That staff member doesn't have a role at this lead's campus.",
      },
    ]);
    expect(supabaseMock.writes("lead")).toHaveLength(0);
    expect(supabaseMock.writes("lead_activity")).toHaveLength(0);
  });

  it("returns an empty result for an empty selection without touching the database", async () => {
    const results = await bulkAssignLeads([], "staff-1", "actor-1");

    expect(results).toEqual([]);
    expect(supabaseMock.ops).toHaveLength(0);
  });
});
