/**
 * Security-contract tests for document mutations.
 *
 * createDocumentRecord (family-facing):
 *   1. Unauthenticated  → "Not authenticated", NO write
 *   2. Non-owner        → "Not authorized",    NO write
 *   3. Owner            → guard passes, insert proceeds
 *
 * reviewDocument (staff-only): requireStaffSession rejection propagates,
 * NO write occurs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock, hasEqFilter } from "./helpers/supabase-mock";
import { createDocumentRecord, reviewDocument } from "@/lib/mutations/documents";

const { requireStaffSessionMock } = vi.hoisted(() => ({
  requireStaffSessionMock: vi.fn(),
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
  notifyFamilyDocumentVerified: vi.fn(async () => {}),
  notifyStaffDocumentUploaded: vi.fn(async () => {}),
}));

const OWNER = { id: "user-owner" };
const ATTACKER = { id: "user-attacker" };
const STAFF = { id: "user-staff" };
const DOC_ID = "doc-1";

const uploadInput = {
  application_id: "app-1",
  student_id: "stu-1",
  document_type: "birth_certificate",
  file_name: "birth-cert.pdf",
  file_size: 12345,
  mime_type: "application/pdf",
  storage_path: "app-1/birth-cert.pdf",
};

/** Result of the ownership-guard select on `application`. */
const guardRow = (ownerUserId: string) => ({
  data: { id: "app-1", guardian: { user_id: ownerUserId } },
  error: null,
});

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
});

// ─── createDocumentRecord ───────────────────────────────────────────────────

describe("createDocumentRecord", () => {
  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);

    const result = await createDocumentRecord(uploadInput);

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects a user who does not own the application and performs no insert", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("application", guardRow(OWNER.id));

    const result = await createDocumentRecord(uploadInput);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes("document")).toHaveLength(0);
  });

  it("allows the owning guardian to create a document record", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "application",
      guardRow(OWNER.id),
      { data: { campus_id: "c-1" }, error: null } // campus lookup for staff notify
    );
    supabaseMock.queueResult("document", { data: { id: DOC_ID }, error: null });

    const result = await createDocumentRecord(uploadInput);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: DOC_ID });
    const docWrites = supabaseMock.writes("document");
    expect(docWrites).toHaveLength(1);
    expect(docWrites[0].op).toBe("insert");
    expect(docWrites[0].payload).toMatchObject({
      application_id: "app-1",
      status: "pending",
    });
  });
});

// ─── reviewDocument (staff-only) ────────────────────────────────────────────

describe("reviewDocument", () => {
  it("propagates requireStaffSession rejection and performs no write", async () => {
    requireStaffSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT:/staff-login"));

    await expect(reviewDocument(DOC_ID, "verified")).rejects.toThrow("NEXT_REDIRECT");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("allows staff to verify a pending document", async () => {
    requireStaffSessionMock.mockResolvedValue({ user_id: STAFF.id, is_staff: true });
    supabaseMock.setUser(STAFF);
    supabaseMock.queueResult(
      "document",
      {
        data: {
          id: DOC_ID,
          status: "pending",
          application_id: "app-1",
          document_type: "birth_certificate",
          application: { campus_id: "c-1" },
        },
        error: null,
      },
      { data: null, error: null } // update result
    );

    const result = await reviewDocument(DOC_ID, "verified");

    expect(result.error).toBeNull();
    const docWrites = supabaseMock.writes("document");
    expect(docWrites).toHaveLength(1);
    expect(docWrites[0].op).toBe("update");
    expect(docWrites[0].payload).toMatchObject({
      status: "verified",
      verified_by: STAFF.id,
    });
    expect(hasEqFilter(docWrites[0], "id", DOC_ID)).toBe(true);
  });

  it("refuses to re-review an already reviewed document (no write)", async () => {
    requireStaffSessionMock.mockResolvedValue({ user_id: STAFF.id, is_staff: true });
    supabaseMock.setUser(STAFF);
    supabaseMock.queueResult("document", {
      data: { id: DOC_ID, status: "verified", application_id: "app-1" },
      error: null,
    });

    const result = await reviewDocument(DOC_ID, "rejected", "blurry scan");

    expect(result.error).toBe("Document already verified");
    expect(supabaseMock.writes()).toHaveLength(0);
  });
});
