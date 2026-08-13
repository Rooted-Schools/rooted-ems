/**
 * Attribution contracts for application_status_history.changed_by.
 *
 * changed_by is written only by the database trigger fn_track_status_change,
 * with auth.uid() — which is NULL for every write in this app, because they
 * all run on the service-role client. The staff Audit Trail therefore showed
 * "System" for real human enrollment decisions.
 *
 * The application layer now stamps the acting user onto the row the trigger
 * just wrote. The whole risk of doing that is stamping the WRONG row: a name
 * on someone else's enrollment decision is worse than the blank it replaces.
 * pickStampableHistoryRow is where that judgment lives, so these tests are
 * mostly about the cases where it must refuse to pick anything.
 */
import { describe, it, expect, vi } from "vitest";

// lib/audit.ts pulls in the Supabase server client, which imports next/headers
// and cannot load under this runner. The functions under test are pure.
vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
  createServiceRoleClient: () => ({}),
}));

import {
  pickStampableHistoryRow,
  latestCreatedAtByApplication,
  type StatusHistoryRow,
} from "@/lib/audit";

const WATERMARK = "2027-03-01T10:00:00.000Z";

function row(overrides: Partial<StatusHistoryRow> = {}): StatusHistoryRow {
  return {
    id: "hist-1",
    created_at: "2027-03-01T10:00:05.000Z",
    changed_by: null,
    from_status: "submitted",
    to_status: "verified",
    ...overrides,
  };
}

describe("pickStampableHistoryRow", () => {
  it("picks the row the change just created", () => {
    const picked = pickStampableHistoryRow([row()], {
      toStatus: "verified",
      fromStatus: "submitted",
      after: WATERMARK,
    });

    expect(picked?.id).toBe("hist-1");
  });

  it("picks nothing when no row was created after the watermark", () => {
    // The status write changed nothing (the application was already there, or
    // another path had just set it), so the trigger wrote no row. The only
    // candidate is an OLDER identical transition — stamping today's staff
    // member onto it would rewrite who made a decision made weeks ago.
    const stale = row({ id: "hist-old", created_at: "2027-02-01T09:00:00.000Z" });

    const picked = pickStampableHistoryRow([stale], {
      toStatus: "verified",
      fromStatus: "submitted",
      after: WATERMARK,
    });

    expect(picked).toBeNull();
  });

  it("treats a row exactly at the watermark as pre-existing, not new", () => {
    const picked = pickStampableHistoryRow([row({ created_at: WATERMARK })], {
      toStatus: "verified",
      after: WATERMARK,
    });

    expect(picked).toBeNull();
  });

  it("never overwrites a row that already names someone", () => {
    const picked = pickStampableHistoryRow([row({ changed_by: "staff-2" })], {
      toStatus: "verified",
      after: WATERMARK,
    });

    expect(picked).toBeNull();
  });

  it("ignores a row recording a different transition", () => {
    const picked = pickStampableHistoryRow([row({ to_status: "waitlisted" })], {
      toStatus: "verified",
      after: WATERMARK,
    });

    expect(picked).toBeNull();
  });

  it("ignores a row whose prior status is not the one this change started from", () => {
    const picked = pickStampableHistoryRow([row({ from_status: "needs_info" })], {
      toStatus: "verified",
      fromStatus: "submitted",
      after: WATERMARK,
    });

    expect(picked).toBeNull();
  });

  it("matches on the target status alone when the prior status is unknown", () => {
    // The lottery offer path moves an application from any of three statuses,
    // so it can name the destination but not the origin.
    const picked = pickStampableHistoryRow(
      [row({ from_status: "lottery_assigned", to_status: "offered" })],
      { toStatus: "offered", after: WATERMARK }
    );

    expect(picked?.id).toBe("hist-1");
  });

  it("takes the newest candidate when the application has several unattributed rows", () => {
    const older = row({ id: "hist-older", created_at: "2027-03-01T10:00:01.000Z" });
    const newer = row({ id: "hist-newer", created_at: "2027-03-01T10:00:09.000Z" });

    const picked = pickStampableHistoryRow([older, newer], {
      toStatus: "verified",
      after: WATERMARK,
    });

    expect(picked?.id).toBe("hist-newer");
  });

  it("picks nothing when two candidates share the newest instant", () => {
    // Two identical transitions recorded at the same moment: one of them may
    // belong to another actor, and nothing here says which. Blank beats a guess.
    const a = row({ id: "hist-a", created_at: "2027-03-01T10:00:05.000Z" });
    const b = row({ id: "hist-b", created_at: "2027-03-01T10:00:05.000Z" });

    expect(
      pickStampableHistoryRow([a, b], { toStatus: "verified", after: WATERMARK })
    ).toBeNull();
  });

  it("accepts any matching row when the application had no history at all", () => {
    // A first-ever status change has nothing to be newer than.
    const picked = pickStampableHistoryRow([row({ from_status: null })], {
      toStatus: "verified",
      after: null,
    });

    expect(picked?.id).toBe("hist-1");
  });

  it("refuses to pick anything when the watermark is not a real timestamp", () => {
    expect(
      pickStampableHistoryRow([row()], { toStatus: "verified", after: "not a date" })
    ).toBeNull();
  });

  it("skips a row whose own timestamp cannot be read", () => {
    expect(
      pickStampableHistoryRow([row({ created_at: "nonsense" })], {
        toStatus: "verified",
        after: WATERMARK,
      })
    ).toBeNull();
  });

  it("picks nothing from an empty candidate list", () => {
    expect(pickStampableHistoryRow([], { toStatus: "verified", after: null })).toBeNull();
  });
});

describe("latestCreatedAtByApplication", () => {
  it("keeps the newest timestamp per application", () => {
    const latest = latestCreatedAtByApplication([
      { application_id: "app-1", created_at: "2027-02-01T00:00:00.000Z" },
      { application_id: "app-1", created_at: "2027-03-01T00:00:00.000Z" },
      { application_id: "app-2", created_at: "2027-01-15T00:00:00.000Z" },
    ]);

    expect(latest.get("app-1")).toBe("2027-03-01T00:00:00.000Z");
    expect(latest.get("app-2")).toBe("2027-01-15T00:00:00.000Z");
  });

  it("does not depend on the order rows come back in", () => {
    const latest = latestCreatedAtByApplication([
      { application_id: "app-1", created_at: "2027-03-01T00:00:00.000Z" },
      { application_id: "app-1", created_at: "2027-02-01T00:00:00.000Z" },
    ]);

    expect(latest.get("app-1")).toBe("2027-03-01T00:00:00.000Z");
  });

  it("leaves an application with no history out of the map", () => {
    const latest = latestCreatedAtByApplication([]);

    expect(latest.has("app-1")).toBe(false);
    expect(latest.size).toBe(0);
  });
});
