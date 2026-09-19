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

// ─── Per-tier percentage caps ───────────────────────────────────────────────
//
// capPercent bounds how many SEATS a weighted tier may occupy — it does not
// touch rank, random_number, or ordering. Every test here holds rank/order
// constant (same seed, same entries) and checks only what is_selected and
// capAccounting say, so a regression that starts moving ranks around would
// fail the "does not renumber" test even if selection counts still looked
// right by coincidence.

describe("per-tier percentage caps", () => {
  const CAPPED_KEY = "capped_tier";

  const NO_SIBLING_OPTIONS: Omit<DrawOptions, "capPercents"> = {
    siblingAutoOffer: false,
    siblingOverflowPriority: false,
    linkedSiblingActivation: false,
  };

  // Seats deliberately equal to the entry count (5 capped + 10 plain = 15).
  // With no seat scarcity, the ONLY reason any entry is ever left unselected
  // is the cap itself, so displacement counts are fully determined by the
  // cap math below and never by incidental hash-order luck — every entry is
  // walked while seatsFilled is still under totalSeats.
  const TOTAL_ENTRIES = 15;

  function drawWithCap(capPercent: number | undefined, seats = TOTAL_ENTRIES) {
    const cappedEntries = Array.from({ length: 5 }, (_, i) =>
      entry(`c${i + 1}`, { tierKeys: [CAPPED_KEY] })
    );
    const entries = [...cappedEntries, ...PLAIN_TEN];
    const options: DrawOptions = {
      ...NO_SIBLING_OPTIONS,
      ...(capPercent === undefined ? {} : { capPercents: { [CAPPED_KEY]: capPercent } }),
    };
    return runPolicyDraw(SEED, entries, seats, options);
  }

  it("caps a tier at floor(seats * capPercent / 100) selected seats and displaces the rest by rank", () => {
    const result = drawWithCap(20); // limit = floor(15 * 20 / 100) = 3
    const cappedRows = result.ranked.filter((r) => r.tierKeys.includes(CAPPED_KEY));
    expect(cappedRows).toHaveLength(5);

    const selected = cappedRows.filter((r) => r.is_selected);
    const displaced = cappedRows.filter((r) => !r.is_selected);
    expect(selected).toHaveLength(3);
    expect(displaced).toHaveLength(2);

    // The three selected are exactly the three best-ranked (lowest
    // final_rank) of the five capped-tier entries — capping displaces by
    // rank, not by id.
    const byRank = [...cappedRows].sort((a, b) => a.final_rank - b.final_rank);
    expect(byRank.slice(0, 3).every((r) => r.is_selected)).toBe(true);
    expect(byRank.slice(3).every((r) => !r.is_selected)).toBe(true);

    // All 10 uncapped (plain) entries are unaffected by the cap.
    expect(result.ranked.filter((r) => !r.tierKeys.includes(CAPPED_KEY) && r.is_selected)).toHaveLength(
      10
    );
    expect(result.selectedCount).toBe(13); // 3 capped + 10 plain; 2 capped seats go unused

    // Accounting is exact and auditable.
    expect(result.capAccounting).toEqual([
      { key: CAPPED_KEY, capPercent: 20, seatLimit: 3, selectedCount: 3, displacedCount: 2 },
    ]);
  });

  it("does not renumber anyone — final_rank and random_number are identical with and without the cap", () => {
    const uncapped = drawWithCap(undefined);
    const capped = drawWithCap(20);
    expect(capped.ranked.map((r) => r.id).sort()).toEqual(uncapped.ranked.map((r) => r.id).sort());
    for (const row of capped.ranked) {
      const other = uncapped.ranked.find((r) => r.id === row.id)!;
      expect(row.final_rank).toBe(other.final_rank);
      expect(row.random_number).toBe(other.random_number);
    }
  });

  it("treats capPercent 0 as no cap at all", () => {
    const result = drawWithCap(0);
    expect(result.selectedCount).toBe(TOTAL_ENTRIES);
    expect(result.capAccounting).toEqual([]);
    // Selection matches the uncapped draw exactly.
    const uncapped = drawWithCap(undefined);
    expect(result.ranked.map((r) => r.is_selected)).toEqual(uncapped.ranked.map((r) => r.is_selected));
  });

  it("treats an absent capPercents (or a key with no entry) as no cap", () => {
    const result = drawWithCap(undefined);
    expect(result.selectedCount).toBe(TOTAL_ENTRIES);
    expect(result.capAccounting).toEqual([]);
  });

  it("treats capPercent 100 as a no-op that never binds", () => {
    const result = drawWithCap(100); // limit = floor(15 * 100/100) = 15 = totalSeats
    const acc = result.capAccounting.find((a) => a.key === CAPPED_KEY)!;
    expect(acc.seatLimit).toBe(TOTAL_ENTRIES);
    expect(acc.displacedCount).toBe(0);
    expect(result.selectedCount).toBe(TOTAL_ENTRIES);
    // Identical selection outcome to no cap at all.
    const uncapped = drawWithCap(undefined);
    expect(result.ranked.map((r) => r.is_selected)).toEqual(uncapped.ranked.map((r) => r.is_selected));
  });

  it("is deterministic: the same seed and cap configuration reproduce identical selection and accounting", () => {
    const a = drawWithCap(20);
    const b = drawWithCap(20);
    expect(a.ranked.map((r) => r.is_selected)).toEqual(b.ranked.map((r) => r.is_selected));
    expect(a.ranked.map((r) => r.final_rank)).toEqual(b.ranked.map((r) => r.final_rank));
    expect(a.capAccounting).toEqual(b.capAccounting);
  });

  it("bounds a tier seated through the absolute sibling pre-pass, not just the weighted draw", () => {
    // Five siblings all match the capped tier. The sibling pre-pass gives
    // them absolute ORDER (they rank 1-5, ahead of everyone), but capPercent
    // still bounds how many of them can be SELECTED.
    const siblingEntries = Array.from({ length: 5 }, (_, i) =>
      entry(`sib${i + 1}`, { siblingOfEnrolled: true, tierKeys: [CAPPED_KEY] })
    );
    const result = runPolicyDraw(SEED, [...siblingEntries, ...PLAIN_TEN], 10, {
      siblingAutoOffer: true,
      siblingOverflowPriority: true,
      linkedSiblingActivation: false,
      capPercents: { [CAPPED_KEY]: 20 }, // limit = 2
    });

    const siblingRows = result.ranked.filter((r) => r.id.startsWith("sib"));
    // All five still sit ahead of the general pool — capping never touches order.
    expect(siblingRows.map((r) => r.final_rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(result.siblingPriorityWaitlisted).toBe(0);

    // But only 2 of the 5 are actually selected; the honest "seated" count
    // (siblingAutoPlaced) reflects the cap, not the raw sibling count.
    expect(siblingRows.filter((r) => r.is_selected)).toHaveLength(2);
    expect(siblingRows.filter((r) => !r.is_selected)).toHaveLength(3);
    expect(result.siblingAutoPlaced).toBe(2);

    // The vacated sibling seats still go to the general pool.
    expect(result.selectedCount).toBe(10);
    expect(result.capAccounting).toEqual([
      { key: CAPPED_KEY, capPercent: 20, seatLimit: 2, selectedCount: 2, displacedCount: 3 },
    ]);
  });

  it("counts a linked-in sibling against the same cap as the applicant who activated them", () => {
    // "a" and "b" are co-applying siblings who both match the capped tier.
    // Whichever is drawn first activates the other immediately behind it
    // (existing linked-sibling behavior, untouched). With the tier capped at
    // exactly one seat, at most one of the pair can ever be selected: the
    // moment either fills the tier's single slot, the other — ranked
    // adjacent to it — finds the tier already full.
    const entries = [
      entry("a", {
        applicationId: "app-a",
        tierKeys: [CAPPED_KEY],
        linkedSiblingApplicationIds: ["app-b"],
      }),
      entry("b", {
        applicationId: "app-b",
        tierKeys: [CAPPED_KEY],
        linkedSiblingApplicationIds: ["app-a"],
      }),
      ...Array.from({ length: 3 }, (_, i) => entry(`extra${i + 1}`, { tierKeys: [CAPPED_KEY] })),
      ...PLAIN_TEN,
    ];

    const result = runPolicyDraw(SEED, entries, 12, {
      siblingAutoOffer: false,
      siblingOverflowPriority: false,
      linkedSiblingActivation: true,
      capPercents: { [CAPPED_KEY]: 10 }, // limit = floor(12 * 10/100) = 1
    });

    const rankOf = (id: string) => result.ranked.find((r) => r.id === id)!.final_rank;
    expect(Math.abs(rankOf("a") - rankOf("b"))).toBe(1);
    expect(result.linkedSiblingActivated).toBe(1);

    const aRow = result.ranked.find((r) => r.id === "a")!;
    const bRow = result.ranked.find((r) => r.id === "b")!;
    expect(aRow.is_selected && bRow.is_selected).toBe(false);

    const acc = result.capAccounting.find((c) => c.key === CAPPED_KEY)!;
    expect(acc.seatLimit).toBe(1);
    expect(acc.selectedCount).toBeLessThanOrEqual(1);
  });

  it("tallies displacement accurately when two different tiers are both capped", () => {
    // Seats == total entries (4 + 4 + 10 = 18), so — as above — every entry
    // is walked and the only source of non-selection is the cap itself.
    const alpha = Array.from({ length: 4 }, (_, i) => entry(`alpha${i + 1}`, { tierKeys: ["alpha"] }));
    const beta = Array.from({ length: 4 }, (_, i) => entry(`beta${i + 1}`, { tierKeys: ["beta"] }));
    const result = runPolicyDraw(SEED, [...alpha, ...beta, ...PLAIN_TEN], 18, {
      ...NO_SIBLING_OPTIONS,
      capPercents: { alpha: 10, beta: 20 }, // limits: floor(18*.1)=1, floor(18*.2)=3
    });

    const alphaAcc = result.capAccounting.find((a) => a.key === "alpha")!;
    const betaAcc = result.capAccounting.find((a) => a.key === "beta")!;
    expect(alphaAcc).toEqual({ key: "alpha", capPercent: 10, seatLimit: 1, selectedCount: 1, displacedCount: 3 });
    expect(betaAcc).toEqual({ key: "beta", capPercent: 20, seatLimit: 3, selectedCount: 3, displacedCount: 1 });

    // 1 (alpha) + 3 (beta) + 10 (plain, uncapped) = 14; the 4 displaced seats
    // (3 alpha + 1 beta) go unused rather than being handed to either capped
    // tier beyond its limit.
    expect(result.selectedCount).toBe(14);
  });
});
