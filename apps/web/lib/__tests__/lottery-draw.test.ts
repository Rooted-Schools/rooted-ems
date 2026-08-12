/**
 * The lottery draw itself.
 *
 * These are the assertions that have to hold on lottery day: the same seed
 * produces the same order, a 5:1 tier really does get five entries and not
 * "roughly" five, siblings are seated before the draw and overflow into a
 * priority band rather than vanishing, and a drawn applicant pulls their
 * co-applying siblings in behind them.
 *
 * Everything here is exact. No statistical assertions, no tolerances: a
 * charter lottery that is only approximately right is wrong.
 */
import { describe, it, expect } from "vitest";
import {
  runPolicyDraw,
  expandWeightedPool,
  effectiveRandomByEntry,
  seededFloat,
  TIER_SIBLING_ABSOLUTE,
  TIER_LINKED_SIBLING,
  TIER_GENERAL,
  type DrawEntry,
  type DrawOptions,
} from "@/lib/lottery-draw";

const SEED = "fixed-seed-for-tests";

const RSV_OPTIONS: DrawOptions = {
  siblingAutoOffer: true,
  siblingOverflowPriority: true,
  linkedSiblingActivation: true,
};

function entry(id: string, overrides: Partial<DrawEntry> = {}): DrawEntry {
  return {
    id,
    applicationId: `app-${id}`,
    weight: 1,
    tierKeys: [],
    siblingOfEnrolled: false,
    linkedSiblingApplicationIds: [],
    ...overrides,
  };
}

const PLAIN_TEN = Array.from({ length: 10 }, (_, i) => entry(`e${i + 1}`));

// ─── Determinism ───────────────────────────────────────────────────────────

describe("runPolicyDraw — determinism", () => {
  it("produces an identical order for the same seed and entries", () => {
    const a = runPolicyDraw(SEED, PLAIN_TEN, 4, RSV_OPTIONS);
    const b = runPolicyDraw(SEED, PLAIN_TEN, 4, RSV_OPTIONS);

    expect(a.ranked.map((r) => r.id)).toEqual(b.ranked.map((r) => r.id));
    expect(a.ranked.map((r) => r.random_number)).toEqual(b.ranked.map((r) => r.random_number));
    expect(a.ranked.map((r) => r.is_selected)).toEqual(b.ranked.map((r) => r.is_selected));
  });

  it("produces a different order for a different seed", () => {
    const a = runPolicyDraw("seed-one", PLAIN_TEN, 4, RSV_OPTIONS);
    const b = runPolicyDraw("seed-two", PLAIN_TEN, 4, RSV_OPTIONS);
    expect(a.ranked.map((r) => r.id)).not.toEqual(b.ranked.map((r) => r.id));
  });

  it("is independent of the order the entries arrive in", () => {
    const forward = runPolicyDraw(SEED, PLAIN_TEN, 10, RSV_OPTIONS);
    const reversed = runPolicyDraw(SEED, [...PLAIN_TEN].reverse(), 10, RSV_OPTIONS);
    expect(forward.ranked.map((r) => r.id)).toEqual(reversed.ranked.map((r) => r.id));
  });

  it("refuses to draw without a seed", () => {
    expect(() => runPolicyDraw("", PLAIN_TEN, 4, RSV_OPTIONS)).toThrow(/seed must not be empty/i);
    expect(() => runPolicyDraw("   ", PLAIN_TEN, 4, RSV_OPTIONS)).toThrow(/seed must not be empty/i);
  });

  it("gives an unweighted applicant the same random number the pre-weighting engine gave", () => {
    // Introducing weighted entries must not have silently moved every ordinary
    // applicant to a different number. Ticket zero keys on the bare entry id,
    // which is exactly what packages/utils/src/lottery-service.ts hashes, so a
    // 1:1 applicant's number and ordering are unchanged.
    const policy = runPolicyDraw(SEED, PLAIN_TEN, 10, {
      siblingAutoOffer: false,
      siblingOverflowPriority: false,
      linkedSiblingActivation: false,
    });

    for (const row of policy.ranked) {
      expect(row.random_number).toBe(seededFloat(SEED, row.id));
    }

    const expectedOrder = [...PLAIN_TEN]
      .sort((a, b) => seededFloat(SEED, a.id) - seededFloat(SEED, b.id))
      .map((e) => e.id);
    expect(policy.ranked.map((r) => r.id)).toEqual(expectedOrder);
  });
});

// ─── Weighted pool — exact counts ──────────────────────────────────────────

describe("expandWeightedPool — exact ticket counts", () => {
  it("gives a 5:1 applicant exactly five tickets and a 3:1 applicant exactly three", () => {
    const entries = [
      entry("staff", { weight: 5, tierKeys: ["staff_child"] }),
      entry("frl", { weight: 3, tierKeys: ["economically_disadvantaged"] }),
      entry("plain", { weight: 1 }),
    ];

    const pool = expandWeightedPool(entries);

    expect(pool.filter((t) => t.entryId === "staff")).toHaveLength(5);
    expect(pool.filter((t) => t.entryId === "frl")).toHaveLength(3);
    expect(pool.filter((t) => t.entryId === "plain")).toHaveLength(1);
    expect(pool).toHaveLength(9);
  });

  it("mints a distinct ticket id per ticket, with ticket zero on the bare entry id", () => {
    const pool = expandWeightedPool([entry("x", { weight: 3 })]);
    expect(pool.map((t) => t.ticketId)).toEqual(["x", "x#1", "x#2"]);
    expect(new Set(pool.map((t) => t.ticketId)).size).toBe(3);
  });

  it("never issues fewer than one ticket, whatever the stored weight says", () => {
    expect(expandWeightedPool([entry("a", { weight: 0 })])).toHaveLength(1);
    expect(expandWeightedPool([entry("b", { weight: -4 })])).toHaveLength(1);
    expect(expandWeightedPool([entry("c", { weight: 2.9 })])).toHaveLength(2);
  });

  it("scales the pool exactly: 10 applicants at 5:1 is exactly 50 entries", () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`w${i}`, { weight: 5 }));
    expect(expandWeightedPool(entries)).toHaveLength(50);
  });

  it("reports the same expanded pool size on the draw result", () => {
    const entries = [
      entry("a", { weight: 5 }),
      entry("b", { weight: 3 }),
      entry("c", { weight: 1 }),
      entry("d", { weight: 1 }),
    ];
    const result = runPolicyDraw(SEED, entries, 2, RSV_OPTIONS);
    expect(result.totalPoolEntries).toBe(10);
  });

  it("ranks an applicant by their BEST ticket, which is what five chances means", () => {
    const weighted = entry("heavy", { weight: 5 });
    const best = effectiveRandomByEntry(SEED, [weighted]).get("heavy");
    const allTickets = ["heavy", "heavy#1", "heavy#2", "heavy#3", "heavy#4"].map((t) =>
      seededFloat(SEED, t)
    );
    expect(best).toBe(Math.min(...allTickets));
    // And the best of five is never worse than the single ticket a 1:1
    // applicant would have held.
    expect(best!).toBeLessThanOrEqual(seededFloat(SEED, "heavy"));
  });

  it("counts tier applicants and entries honestly, weight included", () => {
    const entries = [
      entry("a", { weight: 5, tierKeys: ["staff_child"] }),
      entry("b", { weight: 5, tierKeys: ["staff_child"] }),
      entry("c", { weight: 3, tierKeys: ["economically_disadvantaged"] }),
      entry("d", { weight: 1 }),
    ];
    const result = runPolicyDraw(SEED, entries, 2, RSV_OPTIONS);

    const staff = result.tierCounts.find((t) => t.key === "staff_child");
    expect(staff).toEqual({ key: "staff_child", applicants: 2, entries: 10 });

    const frl = result.tierCounts.find((t) => t.key === "economically_disadvantaged");
    expect(frl).toEqual({ key: "economically_disadvantaged", applicants: 1, entries: 3 });
  });
});

// ─── Sibling pre-pass ──────────────────────────────────────────────────────

describe("sibling pre-pass — seat math", () => {
  it("seats every sibling of a currently enrolled student before the draw", () => {
    const entries = [
      entry("s1", { siblingOfEnrolled: true }),
      entry("s2", { siblingOfEnrolled: true }),
      ...PLAIN_TEN,
    ];

    const result = runPolicyDraw(SEED, entries, 5, RSV_OPTIONS);

    expect(result.siblingAutoPlaced).toBe(2);
    expect(result.siblingPriorityWaitlisted).toBe(0);

    const top = result.ranked.slice(0, 2);
    expect(top.map((r) => r.id).sort()).toEqual(["s1", "s2"]);
    expect(top.every((r) => r.is_selected)).toBe(true);
    expect(top.every((r) => r.priority_tier === TIER_SIBLING_ABSOLUTE)).toBe(true);
    expect(result.selectedCount).toBe(5);
  });

  it("randomizes siblings among themselves and waitlists the overflow ahead of the general pool", () => {
    const siblings = Array.from({ length: 5 }, (_, i) =>
      entry(`s${i + 1}`, { siblingOfEnrolled: true })
    );
    const result = runPolicyDraw(SEED, [...siblings, ...PLAIN_TEN], 3, RSV_OPTIONS);

    expect(result.siblingAutoPlaced).toBe(3);
    expect(result.siblingPriorityWaitlisted).toBe(2);

    // All five siblings sit ahead of every general-pool applicant.
    const siblingRanks = result.ranked
      .filter((r) => r.id.startsWith("s"))
      .map((r) => r.final_rank);
    expect(siblingRanks.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

    // The two who missed out are marked as the priority waitlist band, not as
    // ordinary waitlisted applicants.
    const overflow = result.ranked.filter((r) => r.placement === "sibling_priority_waitlist");
    expect(overflow).toHaveLength(2);
    expect(overflow.every((r) => r.is_selected === false)).toBe(true);
    expect(overflow.every((r) => r.priority_tier === TIER_SIBLING_ABSOLUTE)).toBe(true);
  });

  it("orders the sibling pre-pass deterministically", () => {
    const siblings = Array.from({ length: 6 }, (_, i) =>
      entry(`s${i + 1}`, { siblingOfEnrolled: true })
    );
    const a = runPolicyDraw(SEED, [...siblings, ...PLAIN_TEN], 2, RSV_OPTIONS);
    const b = runPolicyDraw(SEED, [...siblings].reverse().concat(PLAIN_TEN), 2, RSV_OPTIONS);
    expect(a.ranked.slice(0, 6).map((r) => r.id)).toEqual(b.ranked.slice(0, 6).map((r) => r.id));
  });

  it("ignores the sibling flag entirely when the policy does not enable the preference", () => {
    const entries = [entry("s1", { siblingOfEnrolled: true }), ...PLAIN_TEN];
    const result = runPolicyDraw(SEED, entries, 3, {
      siblingAutoOffer: false,
      siblingOverflowPriority: false,
      linkedSiblingActivation: false,
    });

    expect(result.siblingAutoPlaced).toBe(0);
    expect(result.ranked.every((r) => r.priority_tier === TIER_GENERAL)).toBe(true);
  });

  it("does not weight the sibling pre-pass — the preference is categorical", () => {
    // A staff-child sibling and an ordinary sibling are randomized on equal
    // footing. Applying lottery weights inside an absolute preference would be
    // a rule no board adopted.
    const entries = [
      entry("s1", { siblingOfEnrolled: true, weight: 5 }),
      entry("s2", { siblingOfEnrolled: true, weight: 1 }),
    ];
    const result = runPolicyDraw(SEED, entries, 2, RSV_OPTIONS);
    for (const row of result.ranked) {
      expect(row.random_number).toBe(seededFloat(SEED, row.id));
    }
  });

  it("leaves nobody selected when there are no seats", () => {
    const entries = [entry("s1", { siblingOfEnrolled: true }), ...PLAIN_TEN];
    const result = runPolicyDraw(SEED, entries, 0, RSV_OPTIONS);
    expect(result.selectedCount).toBe(0);
    expect(result.siblingAutoPlaced).toBe(0);
    expect(result.siblingPriorityWaitlisted).toBe(1);
    expect(result.ranked).toHaveLength(11);
  });
});

// ─── Linked-sibling activation ─────────────────────────────────────────────

describe("linked-sibling activation", () => {
  it("pulls a co-applying sibling in immediately behind the one who was drawn", () => {
    const entries = [
      entry("a", { applicationId: "app-a", linkedSiblingApplicationIds: ["app-b"] }),
      entry("b", { applicationId: "app-b", linkedSiblingApplicationIds: ["app-a"] }),
      ...PLAIN_TEN,
    ];

    const result = runPolicyDraw(SEED, entries, 12, RSV_OPTIONS);
    const rankOf = (id: string) => result.ranked.find((r) => r.id === id)!.final_rank;

    expect(Math.abs(rankOf("a") - rankOf("b"))).toBe(1);
    expect(result.linkedSiblingActivated).toBe(1);

    const pulled = result.ranked.find((r) => r.placement === "linked_sibling")!;
    expect(["a", "b"]).toContain(pulled.id);
    expect(pulled.priority_tier).toBe(TIER_LINKED_SIBLING);
  });

  it("moves a set of three co-applying siblings together", () => {
    const trio = ["a", "b", "c"];
    const entries = [
      ...trio.map((id) =>
        entry(id, {
          applicationId: `app-${id}`,
          linkedSiblingApplicationIds: trio.filter((o) => o !== id).map((o) => `app-${o}`),
        })
      ),
      ...PLAIN_TEN,
    ];

    const result = runPolicyDraw(SEED, entries, 13, RSV_OPTIONS);
    const ranks = trio.map((id) => result.ranked.find((r) => r.id === id)!.final_rank).sort(
      (x, y) => x - y
    );

    expect(ranks[1] - ranks[0]).toBe(1);
    expect(ranks[2] - ranks[1]).toBe(1);
    expect(result.linkedSiblingActivated).toBe(2);
  });

  it("carries the sibling onto the waitlist right behind their sibling when seats run out", () => {
    // The policy pulls linked siblings in for remaining seats AND for waitlist
    // order. With one seat, the pair still lands adjacent.
    const entries = [
      entry("a", { applicationId: "app-a", linkedSiblingApplicationIds: ["app-b"] }),
      entry("b", { applicationId: "app-b", linkedSiblingApplicationIds: ["app-a"] }),
      ...PLAIN_TEN,
    ];
    const result = runPolicyDraw(SEED, entries, 1, RSV_OPTIONS);
    const rankOf = (id: string) => result.ranked.find((r) => r.id === id)!.final_rank;
    expect(Math.abs(rankOf("a") - rankOf("b"))).toBe(1);
  });

  it("does nothing when the policy has linked-sibling activation switched off", () => {
    const entries = [
      entry("a", { applicationId: "app-a", linkedSiblingApplicationIds: ["app-b"] }),
      entry("b", { applicationId: "app-b", linkedSiblingApplicationIds: ["app-a"] }),
      ...PLAIN_TEN,
    ];
    const result = runPolicyDraw(SEED, entries, 12, {
      siblingAutoOffer: true,
      siblingOverflowPriority: true,
      linkedSiblingActivation: false,
    });
    expect(result.linkedSiblingActivated).toBe(0);
    expect(result.ranked.some((r) => r.placement === "linked_sibling")).toBe(false);
  });

  it("ignores a linked sibling who is not in this run", () => {
    const entries = [
      entry("a", { applicationId: "app-a", linkedSiblingApplicationIds: ["app-elsewhere"] }),
      ...PLAIN_TEN,
    ];
    const result = runPolicyDraw(SEED, entries, 5, RSV_OPTIONS);
    expect(result.linkedSiblingActivated).toBe(0);
    expect(result.ranked).toHaveLength(11);
  });
});

// ─── Whole-draw invariants ─────────────────────────────────────────────────

describe("runPolicyDraw — invariants that must never break", () => {
  it("ranks every applicant exactly once, with no gaps and no duplicates", () => {
    const entries = [
      entry("s1", { siblingOfEnrolled: true }),
      entry("s2", { siblingOfEnrolled: true }),
      entry("a", { applicationId: "app-a", weight: 5, linkedSiblingApplicationIds: ["app-b"] }),
      entry("b", { applicationId: "app-b", weight: 3, linkedSiblingApplicationIds: ["app-a"] }),
      ...PLAIN_TEN,
    ];

    const result = runPolicyDraw(SEED, entries, 6, RSV_OPTIONS);

    expect(result.ranked).toHaveLength(entries.length);
    expect(new Set(result.ranked.map((r) => r.id)).size).toBe(entries.length);
    expect(result.ranked.map((r) => r.final_rank)).toEqual(
      Array.from({ length: entries.length }, (_, i) => i + 1)
    );
  });

  it("selects exactly the seat count when there are more applicants than seats", () => {
    const result = runPolicyDraw(SEED, PLAIN_TEN, 4, RSV_OPTIONS);
    expect(result.selectedCount).toBe(4);
    expect(result.ranked.filter((r) => r.is_selected).map((r) => r.final_rank)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("selects everyone when seats exceed applicants", () => {
    const result = runPolicyDraw(SEED, PLAIN_TEN, 50, RSV_OPTIONS);
    expect(result.selectedCount).toBe(10);
  });

  it("handles an empty entry list without inventing anyone", () => {
    const result = runPolicyDraw(SEED, [], 10, RSV_OPTIONS);
    expect(result.ranked).toEqual([]);
    expect(result.selectedCount).toBe(0);
    expect(result.totalApplicants).toBe(0);
    expect(result.tierCounts).toEqual([]);
  });

  it("rejects a negative seat count rather than guessing", () => {
    expect(() => runPolicyDraw(SEED, PLAIN_TEN, -1, RSV_OPTIONS)).toThrow(/totalSeats/);
  });
});
