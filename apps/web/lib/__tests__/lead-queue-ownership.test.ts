import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Ownership filtering on getFollowUpQueue (the "Mine / Unassigned / a
 * specific staff member / Everyone" lens, default "mine or unassigned" —
 * see recruitment/page.tsx).
 *
 * The critical property under test: `ownership` must gate the count query
 * IDENTICALLY to the two item queries (due-callbacks, due-non-callbacks).
 * totalDue exists specifically so the queue can never silently hide work —
 * an ownership filter that only narrowed the item queries would reintroduce
 * exactly that bug for a different reason (the base branch's fix was for
 * the .limit(50) truncation; this would make totalDue lie about a filter
 * instead of a cap).
 *
 * This mock is a lighter cousin of lead-follow-up-queue.test.ts's — it also
 * records every filter method call per `.from("lead")` chain so ownership
 * predicates can be asserted directly, not just counts/items.
 */

interface MockResult {
  data?: unknown[] | null;
  error?: { message: string } | null;
  count?: number | null;
}
interface RecordedCall {
  method: string;
  args: unknown[];
}

let resultQueue: MockResult[] = [];
let recordedChains: RecordedCall[][] = [];

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({
    from: (_table: string) => {
      const calls: RecordedCall[] = [];
      recordedChains.push(calls);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      const chain =
        (method: string) =>
        (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      for (const m of ["select", "eq", "in", "lte", "or", "order", "limit", "is"]) {
        builder[m] = chain(m);
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
  recordedChains = [];
});

describe("getFollowUpQueue — ownership filtering keeps totalDue honest", () => {
  it("applies the same mine-or-unassigned predicate to count, callbacks, and non-callbacks", async () => {
    resultQueue = [
      { data: null, error: null, count: 3 }, // count
      { data: [], error: null }, // due callbacks
      { data: [leadRow({ id: "a" }), leadRow({ id: "b" }), leadRow({ id: "c" })], error: null }, // due non-callbacks
    ];

    const result = await getFollowUpQueue(undefined, 50, {
      mode: "mine_or_unassigned",
      userId: "staff-1",
    });

    expect(recordedChains).toHaveLength(3);
    for (const calls of recordedChains) {
      const orCall = calls.find(
        (c) =>
          c.method === "or" &&
          String(c.args[0]).includes("assigned_to.eq.staff-1") &&
          String(c.args[0]).includes("assigned_to.is.null")
      );
      expect(orCall).toBeTruthy();
    }
    // The whole point: totalDue reflects the SAME filter as items, not the
    // unfiltered campus total.
    expect(result.totalDue).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it("'unassigned' mode filters every internal query with .is(assigned_to, null)", async () => {
    resultQueue = [
      { data: null, error: null, count: 1 },
      { data: [], error: null },
      { data: [leadRow({ id: "a" })], error: null },
    ];

    const result = await getFollowUpQueue(undefined, 50, { mode: "unassigned" });

    expect(recordedChains).toHaveLength(3);
    for (const calls of recordedChains) {
      expect(
        calls.some((c) => c.method === "is" && c.args[0] === "assigned_to" && c.args[1] === null)
      ).toBe(true);
    }
    expect(result.totalDue).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("'mine' mode filters with .eq(assigned_to, userId), not .is()", async () => {
    resultQueue = [
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ];

    await getFollowUpQueue(undefined, 50, { mode: "mine", userId: "staff-2" });

    for (const calls of recordedChains) {
      expect(calls.some((c) => c.method === "eq" && c.args[0] === "assigned_to" && c.args[1] === "staff-2")).toBe(
        true
      );
    }
  });

  it("no ownership filter (whole-campus scope) never touches assigned_to", async () => {
    resultQueue = [
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ];

    await getFollowUpQueue(undefined, 50, undefined);

    for (const calls of recordedChains) {
      expect(calls.some((c) => (c.method === "is" || c.method === "eq") && c.args[0] === "assigned_to")).toBe(
        false
      );
    }
  });
});
