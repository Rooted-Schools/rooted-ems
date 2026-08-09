import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The behaviour under test is not "does it count rows". It is the two
 * judgement calls the module makes:
 *   1. An unrecorded reason is NOT 'other'. Merging them would disguise a
 *      data-collection failure as a finding.
 *   2. Percentages are withheld on tiny denominators, because "50% of
 *      declines were transportation" over two declines will get repeated in a
 *      board meeting as though it meant something.
 */

const rows: Array<{ decline_reason: string | null }> = [];
let queryError: { message?: string; code?: string } | null = null;

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.gte = chain;
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: queryError ? null : rows, error: queryError });
    return { from: () => builder };
  },
}));

const { getDeclineReasonBreakdown } = await import("../queries/decline-reasons");

beforeEach(() => {
  rows.length = 0;
  queryError = null;
});

describe("getDeclineReasonBreakdown", () => {
  it("counts a null reason as not_captured, never as 'other'", async () => {
    rows.push({ decline_reason: null }, { decline_reason: "other" });

    const result = await getDeclineReasonBreakdown();

    expect(result.notCaptured).toBe(1);
    const other = result.rows.find((r) => r.reason === "other");
    expect(other?.count).toBe(1);
  });

  it("treats an unrecognised reason as not_captured rather than trusting it", async () => {
    // Guards against a stale enum value surviving a migration rollback.
    rows.push({ decline_reason: "moved_to_mars" });

    const result = await getDeclineReasonBreakdown();

    expect(result.notCaptured).toBe(1);
    expect(result.totalDeclines).toBe(1);
  });

  it("withholds percentages below the suppression threshold", async () => {
    rows.push({ decline_reason: "transportation" }, { decline_reason: "timing" });

    const result = await getDeclineReasonBreakdown();

    expect(result.totalDeclines).toBe(2);
    expect(result.rows.every((r) => r.sharePct === null)).toBe(true);
  });

  it("reports percentages once the denominator is large enough", async () => {
    for (let i = 0; i < 8; i++) rows.push({ decline_reason: "transportation" });
    for (let i = 0; i < 2; i++) rows.push({ decline_reason: "timing" });

    const result = await getDeclineReasonBreakdown();

    expect(result.totalDeclines).toBe(10);
    expect(result.rows.find((r) => r.reason === "transportation")?.sharePct).toBe(80);
    expect(result.rows.find((r) => r.reason === "timing")?.sharePct).toBe(20);
  });

  it("ranks real reasons by frequency and keeps not_captured last", async () => {
    rows.push(
      { decline_reason: "timing" },
      { decline_reason: "transportation" },
      { decline_reason: "transportation" },
      { decline_reason: null }
    );

    const result = await getDeclineReasonBreakdown();

    expect(result.rows[0].reason).toBe("transportation");
    expect(result.rows[result.rows.length - 1].reason).toBe("not_captured");
  });

  it("degrades to unavailable when the migration has not been applied", async () => {
    queryError = { code: "42703", message: 'column "decline_reason" does not exist' };

    const result = await getDeclineReasonBreakdown();

    // The page must render without this section, not 500.
    expect(result.available).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("rethrows errors that are not a missing column", async () => {
    queryError = { code: "08006", message: "connection failure" };

    await expect(getDeclineReasonBreakdown()).rejects.toBeTruthy();
  });
});
