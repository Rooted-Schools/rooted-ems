import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Regression coverage for the withdrawn/declined-family exclusion added to
 * the keep-the-seat cron: a family whose enrollment or application has moved
 * to a terminal-negative status must not keep receiving the "congratulations,
 * keep the seat" touch for a seat they no longer hold.
 */

let rows: Array<Record<string, unknown>> = [];
const notifyMock = vi.fn(async () => {});

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      let isUpdate = false;
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.lte = chain;
      builder.or = chain;
      builder.is = chain;
      builder.update = () => {
        isUpdate = true;
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (isUpdate) {
          // The atomic claim always "wins" in these tests — what matters is
          // whether notifyFamilyKeepTheSeat gets called at all, not the
          // claim race itself.
          return resolve({ data: [{ id: "claimed" }], error: null });
        }
        return resolve({ data: rows, error: null });
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/notify", () => ({
  notifyFamilyKeepTheSeat: notifyMock,
}));

const { GET } = await import("../../app/api/cron/keep-the-seat/route");

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function packet(enrollmentOverrides: Record<string, unknown> = {}) {
  return {
    id: "packet-1",
    enrollment_id: "enr-1",
    verified_at: daysAgo(10),
    keep_the_seat_sent_at: null,
    last_outreach_at: null,
    enrollment: {
      id: "enr-1",
      campus_id: "campus-1",
      school_year_id: "sy-1",
      status: "active",
      application_id: "app-1",
      student: { first_name: "Ada", last_name: "Lovelace" },
      school_year: { start_date: inDays(30) },
      application: { status: "enrolled" },
      ...enrollmentOverrides,
    },
  };
}

function request(): NextRequest {
  return {
    headers: { get: (name: string) => (name === "authorization" ? "Bearer test-secret" : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  rows = [];
  notifyMock.mockClear();
  process.env.CRON_SECRET = "test-secret";
});

describe("cron/keep-the-seat withdrawn-family exclusion", () => {
  it("sends the touch for an eligible, still-active family", async () => {
    rows = [packet()];

    const res = await GET(request());
    const body = await res.json();

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(body.sent).toBe(1);
  });

  it("does not contact a family whose enrollment was withdrawn", async () => {
    rows = [packet({ status: "withdrawn" })];

    const res = await GET(request());
    const body = await res.json();

    expect(notifyMock).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
  });

  it("does not contact a family whose application was declined", async () => {
    rows = [packet({ application: { status: "declined" } })];

    const res = await GET(request());
    const body = await res.json();

    expect(notifyMock).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
  });

  it("does not contact a family whose application was withdrawn", async () => {
    rows = [packet({ application: { status: "withdrawn" } })];

    const res = await GET(request());
    const body = await res.json();

    expect(notifyMock).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
  });
});
