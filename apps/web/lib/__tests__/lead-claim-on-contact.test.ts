import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock } from "./helpers/supabase-mock";

/**
 * "Claim on contact": logLeadActivity already stamps last_contact_at for a
 * real touchpoint (call/sms/email). It now also assigns the lead to whoever
 * logged that touchpoint — but ONLY when nobody owns the lead yet. This is
 * the fix for the C.R. Neal scenario: a second recruiter joining a
 * campus-wide, pull-only queue with 1,316 unowned leads and no way to tell
 * who's already working which family.
 *
 * exitJourneys (dynamic import from ./journeys, only reached for a "call")
 * is left unmocked deliberately — it's a real, try/catch-wrapped function
 * that queries a table ("journey_enrollment") these tests never touch, so it
 * resolves harmlessly against the same mocked client without affecting the
 * "lead" / "lead_activity" assertions below.
 */

// exitJourneys (only reached on the "call" path) is imported from
// lib/mutations/journeys.ts, which imports lib/auth/get-session.ts for its
// OWN staff-facing exports — that file wraps its session resolver in
// React's cache(), which has no meaningful behavior outside a real React
// render. Same stub as campus-authz.test.ts.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

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

const { logLeadActivity } = await import("@/lib/mutations/leads");

beforeEach(() => {
  supabaseMock.reset();
});

/** Finds the write (if any) that touches assigned_to. */
function findClaimWrite() {
  return supabaseMock
    .writes("lead")
    .find((w) => w.payload && typeof w.payload === "object" && "assigned_to" in (w.payload as object));
}

describe("logLeadActivity — claim on contact", () => {
  it("assigns an unassigned lead to whoever logged the contact", async () => {
    supabaseMock.queueResult("lead_activity", { data: null, error: null }); // the activity insert
    supabaseMock.queueResult("lead", { data: null, error: null }); // last_contact_at update
    supabaseMock.queueResult("lead", { data: null, error: null }); // stage->contacted (guarded)
    supabaseMock.queueResult("lead", { data: { assigned_to: null }, error: null }); // ownership read
    supabaseMock.queueResult("lead", { data: null, error: null }); // the claim write

    const result = await logLeadActivity("lead-1", "sms", "Texted the family", "actor-1");

    expect(result.error).toBeNull();
    const claimWrite = findClaimWrite();
    expect(claimWrite).toBeTruthy();
    expect(claimWrite!.payload).toEqual({ assigned_to: "actor-1" });
    // Belt-and-suspenders DB guard against a concurrent claim.
    expect(
      claimWrite!.filters.some((f) => f.method === "is" && f.args[0] === "assigned_to" && f.args[1] === null)
    ).toBe(true);
  });

  it("does NOT reassign a lead that already has an owner", async () => {
    supabaseMock.queueResult("lead_activity", { data: null, error: null });
    supabaseMock.queueResult("lead", { data: null, error: null }); // last_contact_at update
    supabaseMock.queueResult("lead", { data: null, error: null }); // stage->contacted (guarded)
    supabaseMock.queueResult("lead", { data: { assigned_to: "existing-owner" }, error: null }); // ownership read

    const result = await logLeadActivity("lead-1", "email", "Emailed the family", "actor-1");

    expect(result.error).toBeNull();
    expect(findClaimWrite()).toBeUndefined();
  });

  it("does not touch ownership for a non-contact activity (a note)", async () => {
    supabaseMock.queueResult("lead_activity", { data: null, error: null });

    const result = await logLeadActivity("lead-1", "note", "Left a message with grandma", "actor-1");

    expect(result.error).toBeNull();
    // A note never even reaches last_contact_at / stage / ownership logic.
    expect(supabaseMock.writes("lead")).toHaveLength(0);
  });

  it("still claims correctly on the 'call' path, which also exits nurture journeys", async () => {
    supabaseMock.queueResult("lead_activity", { data: null, error: null });
    supabaseMock.queueResult("lead", { data: null, error: null }); // last_contact_at update
    supabaseMock.queueResult("lead", { data: null, error: null }); // stage->contacted
    supabaseMock.queueResult("lead", { data: { assigned_to: null }, error: null }); // ownership read
    supabaseMock.queueResult("lead", { data: null, error: null }); // the claim write

    const result = await logLeadActivity("lead-1", "call", "Left a voicemail", "actor-1");

    expect(result.error).toBeNull();
    expect(findClaimWrite()?.payload).toEqual({ assigned_to: "actor-1" });
  });
});
