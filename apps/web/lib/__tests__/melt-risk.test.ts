import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The load-bearing decision in MELT_RISK is which clock it reads.
 *
 * An automated email advances last_outreach_at. A human logging a call
 * advances contacted_at. If the risk flag read either one, the weekly
 * automated send would clear the flag on every family every week and the
 * queue would be permanently empty — it would look like the system was
 * working right up until August, when nobody shows up. These tests exist to
 * make that regression loud.
 */

let rows: Array<Record<string, unknown>> = [];
let queryError: { message?: string; code?: string } | null = null;

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.or = chain;
    builder.lt = chain;
    builder.lte = chain;
    builder.is = chain;
    builder.order = chain;
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: queryError ? null : rows, error: queryError });
    return { from: () => builder };
  },
}));

const { getMeltRiskQueue, MELT_RISK_DAYS } = await import("../queries/melt");

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function packet(over: Record<string, unknown> = {}, enrollOver: Record<string, unknown> = {}) {
  return {
    id: (over.id as string) ?? "p1",
    enrollment_id: "e1",
    contacted_at: null,
    last_outreach_at: null,
    verified_at: daysAgo(60),
    ...over,
    enrollment: {
      id: "e1",
      campus_id: "c1",
      application_id: "a1",
      status: "active",
      student: { first_name: "Ada", last_name: "Lovelace" },
      campus: { name: "C.R. Neal Academy" },
      school_year: { start_date: inDays(30) },
      application: {
        status: "enrolled",
        guardian: { first_name: "Ann", last_name: "Lovelace", phone: "8035550100" },
      },
      ...enrollOver,
    },
  };
}

beforeEach(() => {
  rows = [];
  queryError = null;
});

describe("getMeltRiskQueue", () => {
  it("still flags a family who got a recent automated email but no human contact", async () => {
    // The regression this whole module is designed to prevent.
    rows = [packet({ contacted_at: null, last_outreach_at: daysAgo(1) })];

    const result = await getMeltRiskQueue();

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].days_since_contact).toBeNull();
  });

  it("reports days since contact from contacted_at", async () => {
    rows = [packet({ contacted_at: daysAgo(20) })];

    const result = await getMeltRiskQueue();

    expect(result.rows[0].days_since_contact).toBe(20);
  });

  it("excludes families once school has already started", async () => {
    // After day one they are an attendance problem, not a melt problem.
    rows = [packet({}, { school_year: { start_date: inDays(-1) } })];

    const result = await getMeltRiskQueue();

    expect(result.rows).toHaveLength(0);
  });

  it("excludes rows with no start date rather than guessing the window", async () => {
    rows = [packet({}, { school_year: { start_date: null } })];

    const result = await getMeltRiskQueue();

    expect(result.rows).toHaveLength(0);
  });

  it("sorts never-contacted families first, then longest silence", async () => {
    rows = [
      packet({ id: "p-20d", contacted_at: daysAgo(20) }),
      packet({ id: "p-never", contacted_at: null }),
      packet({ id: "p-40d", contacted_at: daysAgo(40) }),
    ];

    const result = await getMeltRiskQueue();

    expect(result.rows.map((r) => r.packet_id)).toEqual(["p-never", "p-40d", "p-20d"]);
  });

  it("uses the playbook's 14-day standard by default", () => {
    expect(MELT_RISK_DAYS).toBe(14);
  });

  it("degrades to unavailable when the migration has not been applied", async () => {
    queryError = { code: "42703", message: 'column "last_outreach_at" does not exist' };

    const result = await getMeltRiskQueue();

    expect(result.available).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("excludes a family whose enrollment was withdrawn", async () => {
    rows = [packet({}, { status: "withdrawn" })];

    const result = await getMeltRiskQueue();

    expect(result.rows).toHaveLength(0);
  });

  it("excludes a family whose application was declined", async () => {
    rows = [packet({}, { application: { status: "declined", guardian: { first_name: "Ann" } } })];

    const result = await getMeltRiskQueue();

    expect(result.rows).toHaveLength(0);
  });

  it("excludes a family whose application was withdrawn even though the packet reads complete", async () => {
    rows = [packet({}, { application: { status: "withdrawn", guardian: { first_name: "Ann" } } })];

    const result = await getMeltRiskQueue();

    expect(result.rows).toHaveLength(0);
  });
});
