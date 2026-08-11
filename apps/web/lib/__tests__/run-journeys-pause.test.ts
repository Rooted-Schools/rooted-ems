import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Regression coverage for the LG-2 journey management fix: the daily
 * run-journeys cron previously ignored journey.is_active entirely, so
 * pausing a journey from the new /staff/recruitment/journeys UI did not
 * actually stop sends — every enrolled family kept getting emails.
 *
 * The fix (app/api/cron/run-journeys/route.ts) adds is_active to the
 * journey join and skips — without exiting — any due enrollment whose
 * journey is currently paused. These tests assert both halves: a paused
 * journey's enrollment is left completely untouched (no send, no status
 * change), and a normal active-journey enrollment still sends exactly as
 * before.
 */

let dueRows: Array<Record<string, unknown>> = [];
const updateCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
const sendEmailMock = vi.fn(async () => ({ ok: true }));
const recordCronRunMock = vi.fn(async () => {});

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      let mode: "select" | "update" | "insert" = "select";
      let pendingValues: Record<string, unknown> = {};
      const lastEq: Record<string, unknown> = {};

      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.lte = chain;
      builder.eq = (field: string, value: unknown) => {
        lastEq[field] = value;
        return builder;
      };
      builder.maybeSingle = chain;
      builder.update = (values: Record<string, unknown>) => {
        mode = "update";
        pendingValues = values;
        return builder;
      };
      builder.insert = (values: Record<string, unknown>) => {
        mode = "insert";
        pendingValues = values;
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (mode === "update") {
          updateCalls.push({ table, values: pendingValues });
          return resolve({ data: null, error: null });
        }
        if (mode === "insert") {
          insertCalls.push({ table, values: pendingValues });
          return resolve({ data: null, error: null });
        }
        if (table === "journey_enrollment") return resolve({ data: dueRows, error: null });
        if (table === "journey_step") {
          // Only the "active journey" test case reaches this: step_order 1
          // is the due step, step_order 2 is the "is there a following
          // step" lookup — returning null there completes the journey.
          if (lastEq.step_order === 1) {
            return resolve({ data: { template_key: "reintroduction", payload: {}, delay_days: 3 }, error: null });
          }
          return resolve({ data: null, error: null });
        }
        return resolve({ data: null, error: null });
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/email-compliance", () => ({
  getSuppressedEmails: async () => new Set<string>(),
  unsubscribeUrl: (token: string) => `https://enroll.rootedschool.org/unsubscribe?t=${token}`,
}));

vi.mock("@/lib/cron-heartbeat", () => ({
  recordCronRun: recordCronRunMock,
}));

const { GET } = await import("../../app/api/cron/run-journeys/route");

function enrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: "enr-1",
    journey_id: "journey-1",
    lead_id: "lead-1",
    current_step: 0,
    journey: { name: "Push to Apply", is_active: true },
    lead: {
      email: "family@example.com",
      unsubscribed_at: null,
      unsubscribe_token: "tok-1",
      campus_id: "campus-1",
      first_name: "Alex",
      application_id: null,
      campus: { name: "Rooted Schools Cleveland", email: "cle@rootedschool.org" },
    },
    ...overrides,
  };
}

function request(): NextRequest {
  return {
    headers: { get: (name: string) => (name === "authorization" ? "Bearer test-secret" : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  dueRows = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  sendEmailMock.mockClear();
  recordCronRunMock.mockClear();
  process.env.CRON_SECRET = "test-secret";
});

describe("cron/run-journeys pause handling", () => {
  it("skips a due enrollment whose journey is paused — no send, no status change", async () => {
    dueRows = [enrollment({ journey: { name: "Push to Apply", is_active: false } })];

    const res = await GET(request());
    const body = await res.json();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0); // enrollment untouched — not exited, not advanced
    expect(insertCalls).toHaveLength(0); // no lead_activity logged for a step that never sent
    expect(body).toMatchObject({ sent: 0, completed: 0, exited: 0, paused: 1 });
  });

  it("still sends normally for a due enrollment on an active journey", async () => {
    dueRows = [enrollment()];

    const res = await GET(request());
    const body = await res.json();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ sent: 1, paused: 0 });
    // Only one step configured in this fixture, so the enrollment completes.
    const enrollmentUpdate = updateCalls.find((c) => c.table === "journey_enrollment");
    expect(enrollmentUpdate?.values).toMatchObject({ current_step: 1, status: "completed" });
  });
});
