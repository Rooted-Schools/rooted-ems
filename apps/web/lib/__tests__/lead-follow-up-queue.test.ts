import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LeadRow } from "@/lib/queries/leads";

/**
 * Regression coverage for the follow-up queue reliability fix: the queue
 * used to select oldest-first and cap at 50, which silently dropped whatever
 * was newest — exactly where a callback promised for today at a named hour
 * lives. getFollowUpQueue now runs two ordered queries (due callbacks, due
 * non-callbacks) and merges them so callbacks always surface first, and
 * returns an honest `totalDue` so truncation is never silent.
 *
 * The Supabase query builder is mocked as a FIFO queue of canned
 * { data, error, count } results, consumed in the exact order
 * getFollowUpQueue issues its queries: count, then due-callbacks, then
 * (only if there's room left under `limit`) due-non-callbacks.
 */

interface MockResult {
  data?: unknown[] | null;
  error?: { message: string } | null;
  count?: number | null;
}

let resultQueue: MockResult[] = [];

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({
    from: (_table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      const chain =
        () =>
        (..._args: unknown[]) =>
          builder;
      for (const m of ["select", "eq", "in", "lte", "or", "order", "limit"]) {
        builder[m] = chain();
      }
      builder.then = (
        onFulfilled?: (v: MockResult) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => {
        const next = resultQueue.shift() ?? { data: [], error: null, count: 0 };
        return Promise.resolve(next).then(onFulfilled, onRejected);
      };
      return builder;
    },
  }),
  createServiceRoleClient: () => ({ from: () => ({}) }),
}));

const { getFollowUpQueue } = await import("../queries/leads");

function leadRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "lead-1",
    campus_id: "campus-1",
    first_name: "Ada",
    last_name: "Lovelace",
    email: null,
    phone: null,
    student_first_name: null,
    entry_grade: null,
    pathway_interest: null,
    inquiry_intent: null,
    stage: "contacted",
    source: "website",
    assigned_to: null,
    next_follow_up_at: new Date().toISOString(),
    last_contact_at: null,
    created_at: new Date().toISOString(),
    campus: { name: "Test Campus" },
    ...overrides,
  };
}

beforeEach(() => {
  resultQueue = [];
});

describe("getFollowUpQueue — callbacks-first ordering", () => {
  it("puts a due callback ahead of an older due non-callback", async () => {
    const olderNonCallback = leadRow({
      id: "old-voicemail",
      next_follow_up_at: "2026-01-01T09:00:00.000Z",
    });
    const newerCallback = leadRow({
      id: "new-callback",
      next_follow_up_at: "2026-01-10T14:00:00.000Z",
    });

    resultQueue = [
      { data: null, error: null, count: 2 }, // count query
      { data: [newerCallback], error: null }, // due callbacks
      { data: [olderNonCallback], error: null }, // due non-callbacks
    ];

    const result = await getFollowUpQueue(undefined, 50);

    expect(result.items.map((r: LeadRow) => r.id)).toEqual(["new-callback", "old-voicemail"]);
    expect(result.items[0].is_callback).toBe(true);
    expect(result.items[1].is_callback).toBe(false);
  });
});

describe("getFollowUpQueue — honest truncation", () => {
  it("reports a totalDue larger than items.length when the cap truncates", async () => {
    const rows = [leadRow({ id: "a" }), leadRow({ id: "b" })];

    resultQueue = [
      { data: null, error: null, count: 5 }, // 5 leads are actually due…
      { data: [], error: null }, // …but none are callbacks…
      { data: rows, error: null }, // …and the cap only lets 2 through
    ];

    const result = await getFollowUpQueue(undefined, 2);

    expect(result.items).toHaveLength(2);
    expect(result.totalDue).toBe(5);
    expect(result.items.length).toBeLessThan(result.totalDue);
  });

  it("matches items.length to totalDue when nothing was truncated", async () => {
    const rows = [leadRow({ id: "only-one" })];

    resultQueue = [
      { data: null, error: null, count: 1 },
      { data: rows, error: null }, // this one is the callback
      // remaining = limit - 1 = 49, but no third query is issued to assert
      // against here — enqueue nothing further; a stray extra `.shift()`
      // would fall back to the default empty result if it were consumed.
    ];

    const result = await getFollowUpQueue(undefined, 50);

    expect(result.items).toHaveLength(1);
    expect(result.totalDue).toBe(1);
  });
});
