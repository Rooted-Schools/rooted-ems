import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/lib/__tests__/helpers/supabase-mock";
import { updateApplicationStatus, STATUS_CHANGED_UNDERNEATH } from "@/lib/mutations/applications";
import { getApplicationDetail } from "@/lib/queries/applications";
import { logAuditEvent } from "@/lib/audit";

const { markIneligible } = vi.hoisted(() => ({ markIneligible: vi.fn() }));

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => supabaseMock.authClient(),
  createServiceRoleClient: () => ({ ...supabaseMock.serviceClient(), rpc: markIneligible }),
}));

vi.mock("@/lib/auth/get-session", () => ({ requireStaffSession: vi.fn() }));
vi.mock("@/lib/audit", () => ({
  AuditAction: { StatusChange: "status_change" },
  logAuditEvent: vi.fn(async () => {}),
  readStatusHistoryWatermark: vi.fn(async () => null),
  stampStatusHistoryActor: vi.fn(async () => {}),
}));
vi.mock("@/lib/notify", () => ({
  notifyFamilyApplicationReceived: vi.fn(async () => {}),
  notifyFamilyApplicationVerified: vi.fn(async () => {}),
  notifyFamilyNeedsInfo: vi.fn(async () => {}),
  notifyFamilyApplicationWaitlisted: vi.fn(async () => {}),
  notifyStaffNewApplication: vi.fn(async () => {}),
}));

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
  markIneligible.mockResolvedValue({ data: [{ id: "app-1" }], error: null });
});

function staffApplication() {
  supabaseMock.setUser({ id: "staff-1" });
  supabaseMock.queueResult("user_profile", { data: { is_staff: true }, error: null });
  supabaseMock.queueResult("application", {
    data: { id: "app-1", status: "submitted", campus_id: "campus-1" }, error: null,
  });
}

describe("eligibility decisions", () => {
  it.each([undefined, "", " \t\n "])("rejects an empty reason %j without writing", async (reason) => {
    staffApplication();
    const result = await updateApplicationStatus("app-1", "ineligible", reason);
    expect(result.error).toBe("An eligibility reason is required");
    expect(markIneligible).not.toHaveBeenCalled();
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("uses the atomic private-note operation and trims the audit reason", async () => {
    staffApplication();
    expect((await updateApplicationStatus("app-1", "ineligible", "  Grade not offered  ")).error).toBeNull();
    expect(markIneligible).toHaveBeenCalledWith("mark_application_ineligible", {
      p_application_id: "app-1", p_expected_status: "submitted",
      p_actor_id: "staff-1", p_reason: "Grade not offered",
    });
    expect(supabaseMock.writes("application")).toHaveLength(0);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { reason: "Grade not offered" },
    }));
  });

  it("fails closed if the database operation is unavailable", async () => {
    staffApplication();
    markIneligible.mockResolvedValue({ data: null, error: { message: "function missing" } });
    expect((await updateApplicationStatus("app-1", "ineligible", "Grade not offered")).error).toBeTruthy();
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("reports a competing status change without recording a successful decision", async () => {
    staffApplication();
    markIneligible.mockResolvedValue({ data: [], error: null });
    expect((await updateApplicationStatus("app-1", "ineligible", "Grade not offered")).error)
      .toBe(STATUS_CHANGED_UNDERNEATH);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("does not report success for an unconfirmed database response", async () => {
    staffApplication();
    markIneligible.mockResolvedValue({ data: null, error: null });
    expect((await updateApplicationStatus("app-1", "ineligible", "Grade not offered")).error).toBeTruthy();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a family caller before the privileged operation", async () => {
    supabaseMock.setUser({ id: "family-1" });
    supabaseMock.queueResult("user_profile", { data: { is_staff: false }, error: null });
    expect((await updateApplicationStatus("app-1", "ineligible", "Grade not offered")).error).toBe("Not authorized");
    expect(markIneligible).not.toHaveBeenCalled();
  });
});

function queueDetail(status: string) {
  supabaseMock.queueResult("application", {
    data: { id: "app-1", status, review_notes: "Private eligibility reason", guardian: { user_id: "family-1" } },
    error: null,
  });
  supabaseMock.queueResult("application_status_history", {
    data: [{ id: "history-1", to_status: "ineligible", reason: "Private timeline reason" }], error: null,
  });
}

describe("family eligibility privacy", () => {
  it("removes legacy eligibility reasons from the complete browser payload", async () => {
    queueDetail("ineligible");
    const detail = await getApplicationDetail("app-1", "family-1");
    expect(detail).not.toBeNull();
    expect(detail?.review_notes).toBeNull();
    expect(detail?.timeline[0].reason).toBeNull();
    expect(JSON.stringify(detail)).not.toContain("Private");
    expect(supabaseMock.ops.find((operation) => operation.table === "note")?.filters)
      .toContainEqual({ method: "eq", args: ["is_internal", false] });
  });

  it("keeps the needs-info message available to the owning family", async () => {
    queueDetail("needs_info");
    expect((await getApplicationDetail("app-1", "family-1"))?.review_notes).toBe("Private eligibility reason");
  });

  it("preserves staff access to legacy reasons", async () => {
    queueDetail("ineligible");
    const detail = await getApplicationDetail("app-1");
    expect(detail?.review_notes).toBe("Private eligibility reason");
    expect(detail?.timeline[0].reason).toBe("Private timeline reason");
  });

  it("rejects another family's request", async () => {
    queueDetail("ineligible");
    expect(await getApplicationDetail("app-1", "other-family")).toBeNull();
  });
});
