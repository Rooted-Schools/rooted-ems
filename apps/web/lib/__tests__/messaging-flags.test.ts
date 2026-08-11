/**
 * The welcome-messaging pause switch is fail-open by design: family
 * communication must never go silently dark because of a missing row or a
 * broken query. These tests pin the two cases that make that promise real —
 * no row written yet, and a query error — plus the explicit-off read.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { supabaseMock } from "./helpers/supabase-mock";
import { isWelcomeMessagingEnabled } from "@/lib/messaging-flags";

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(async () => {}),
  AuditAction: { StatusChange: "status_change" },
}));

const KEY = "welcome_messages_enabled";

beforeEach(() => {
  supabaseMock.reset();
});

describe("isWelcomeMessagingEnabled", () => {
  it("defaults to true when no row has ever been written", async () => {
    supabaseMock.queueResult("setting", { data: null, error: null });
    expect(await isWelcomeMessagingEnabled()).toBe(true);
  });

  it("fails open (true) when the query errors", async () => {
    supabaseMock.queueResult("setting", {
      data: null,
      error: { message: "connection reset" },
    });
    expect(await isWelcomeMessagingEnabled()).toBe(true);
  });

  it("returns false when the row explicitly disables it", async () => {
    supabaseMock.queueResult("setting", {
      data: { value: { enabled: false } },
      error: null,
    });
    expect(await isWelcomeMessagingEnabled()).toBe(false);
  });

  it("reads the null-campus row by key, not any campus-scoped row", async () => {
    supabaseMock.queueResult("setting", { data: null, error: null });
    await isWelcomeMessagingEnabled();
    const op = supabaseMock.ops.find((o) => o.table === "setting");
    expect(op).toBeDefined();
    const hasKeyFilter = op!.filters.some(
      (f) => f.method === "eq" && f.args[0] === "key" && f.args[1] === KEY
    );
    const hasNullCampusFilter = op!.filters.some(
      (f) => f.method === "is" && f.args[0] === "campus_id" && f.args[1] === null
    );
    expect(hasKeyFilter).toBe(true);
    expect(hasNullCampusFilter).toBe(true);
  });
});
