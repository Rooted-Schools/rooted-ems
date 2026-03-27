import { describe, it, expect } from "vitest";
import {
  runDeterministicLottery,
  verifyLotteryResults,
  generateLotterySeed,
} from "../lottery-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXED_SEED = "test-seed-abc-123";

const FIVE_ENTRIES = [
  { id: "entry-a", priority_tier: 0 },
  { id: "entry-b", priority_tier: 0 },
  { id: "entry-c", priority_tier: 0 },
  { id: "entry-d", priority_tier: 0 },
  { id: "entry-e", priority_tier: 0 },
];

const TIERED_ENTRIES = [
  { id: "general-1", priority_tier: 1 },
  { id: "general-2", priority_tier: 1 },
  { id: "sibling-1", priority_tier: 0 }, // priority tier — should rank first
  { id: "general-3", priority_tier: 1 },
];

// ─── Core Determinism ────────────────────────────────────────────────────────

describe("runDeterministicLottery — determinism", () => {
  it("produces identical results on every call with the same seed and entries", () => {
    const run1 = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);
    const run2 = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);

    expect(run1.ranked.map((e) => e.id)).toEqual(run2.ranked.map((e) => e.id));
    expect(run1.ranked.map((e) => e.final_rank)).toEqual(
      run2.ranked.map((e) => e.final_rank)
    );
    expect(run1.ranked.map((e) => e.random_number)).toEqual(
      run2.ranked.map((e) => e.random_number)
    );
  });

  it("produces different random_numbers with different seeds for the same entries", () => {
    const run1 = runDeterministicLottery("seed-one", FIVE_ENTRIES, 5);
    const run2 = runDeterministicLottery("seed-two", FIVE_ENTRIES, 5);

    // Different seeds must produce different random_number values per entry.
    // The final sort order might coincidentally match, but the underlying
    // random numbers must differ — this is what makes each run distinct.
    const nums1 = FIVE_ENTRIES.map(
      (e) => run1.ranked.find((r) => r.id === e.id)!.random_number
    );
    const nums2 = FIVE_ENTRIES.map(
      (e) => run2.ranked.find((r) => r.id === e.id)!.random_number
    );
    expect(nums1).not.toEqual(nums2);
  });

  it("assigns stable random_numbers — same entry always gets same value for same seed", () => {
    const runA = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 0);
    const runB = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 0);

    for (const entryA of runA.ranked) {
      const entryB = runB.ranked.find((e) => e.id === entryA.id)!;
      expect(entryA.random_number).toBe(entryB.random_number);
    }
  });
});

// ─── Selection Logic ──────────────────────────────────────────────────────────

describe("runDeterministicLottery — seat selection", () => {
  it("selects exactly totalSeats entries when there are more applicants than seats", () => {
    const { ranked, total_selected } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);

    const selected = ranked.filter((e) => e.is_selected);
    expect(selected).toHaveLength(3);
    expect(total_selected).toBe(3);
  });

  it("selects all entries when totalSeats >= entry count", () => {
    const { ranked, total_selected } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 10);

    expect(ranked.every((e) => e.is_selected)).toBe(true);
    expect(total_selected).toBe(5);
  });

  it("selects 0 entries when totalSeats is 0", () => {
    const { ranked, total_selected } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 0);

    expect(ranked.every((e) => !e.is_selected)).toBe(true);
    expect(total_selected).toBe(0);
  });

  it("assigns 1-based consecutive ranks to all entries", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);

    const ranks = ranked.map((e) => e.final_rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
  });

  it("entries with final_rank <= totalSeats are always is_selected=true", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);

    for (const entry of ranked) {
      if (entry.final_rank <= 3) {
        expect(entry.is_selected).toBe(true);
      } else {
        expect(entry.is_selected).toBe(false);
      }
    }
  });
});

// ─── Priority Tier Logic ──────────────────────────────────────────────────────

describe("runDeterministicLottery — priority tiers", () => {
  it("places all lower-tier entries before higher-tier entries regardless of random number", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, TIERED_ENTRIES, 2);

    // sibling-1 (tier 0) must rank first among the 4 entries
    const siblingEntry = ranked.find((e) => e.id === "sibling-1")!;
    expect(siblingEntry.final_rank).toBe(1);
  });

  it("selects priority-tier entries first even when outnumbered", () => {
    const entries = [
      { id: "g1", priority_tier: 1 },
      { id: "g2", priority_tier: 1 },
      { id: "g3", priority_tier: 1 },
      { id: "p1", priority_tier: 0 }, // one priority entry among 3 general
    ];

    const { ranked } = runDeterministicLottery(FIXED_SEED, entries, 1);

    // Only 1 seat — priority entry must win it
    expect(ranked[0].id).toBe("p1");
    expect(ranked[0].is_selected).toBe(true);
  });

  it("sorts within a tier by random_number, not insertion order", () => {
    // Two identical priority tiers — ordering must come from the hash, not from
    // the input array order. We verify the output is stable across runs.
    const { ranked: run1 } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 5);
    const { ranked: run2 } = runDeterministicLottery(FIXED_SEED, [...FIVE_ENTRIES].reverse(), 5);

    // Reversing input order should not change ranked outcome (same seed)
    expect(run1.map((e) => e.id)).toEqual(run2.map((e) => e.id));
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("runDeterministicLottery — edge cases", () => {
  it("handles a single entry correctly", () => {
    const { ranked, total_selected } = runDeterministicLottery(
      FIXED_SEED,
      [{ id: "only-one", priority_tier: 0 }],
      1
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].final_rank).toBe(1);
    expect(ranked[0].is_selected).toBe(true);
    expect(total_selected).toBe(1);
  });

  it("returns empty result for empty entries array", () => {
    const result = runDeterministicLottery(FIXED_SEED, [], 10);

    expect(result.ranked).toHaveLength(0);
    expect(result.total_selected).toBe(0);
    expect(result.total_entries).toBe(0);
  });

  it("throws on empty seed", () => {
    expect(() => runDeterministicLottery("", FIVE_ENTRIES, 3)).toThrow();
  });

  it("throws on negative totalSeats", () => {
    expect(() => runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, -1)).toThrow();
  });

  it("produces random_numbers in [0, 1)", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 5);

    for (const entry of ranked) {
      expect(entry.random_number).toBeGreaterThanOrEqual(0);
      expect(entry.random_number).toBeLessThan(1);
    }
  });
});

// ─── Verification ─────────────────────────────────────────────────────────────

describe("verifyLotteryResults", () => {
  it("verifies a correctly stored result as true", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);
    const isValid = verifyLotteryResults(FIXED_SEED, ranked, 3);

    expect(isValid).toBe(true);
  });

  it("returns false if a rank has been tampered with", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);

    // Tamper: swap rank 1 and rank 2
    const tampered = ranked.map((e) => ({
      ...e,
      final_rank: e.final_rank === 1 ? 2 : e.final_rank === 2 ? 1 : e.final_rank,
    }));

    expect(verifyLotteryResults(FIXED_SEED, tampered, 3)).toBe(false);
  });

  it("returns false if is_selected has been tampered with", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);

    // Tamper: flip one non-selected entry to selected
    const tampered = ranked.map((e, i) =>
      i === ranked.length - 1 ? { ...e, is_selected: true } : e
    );

    expect(verifyLotteryResults(FIXED_SEED, tampered, 3)).toBe(false);
  });

  it("returns false when a different seed is used for verification", () => {
    const { ranked } = runDeterministicLottery(FIXED_SEED, FIVE_ENTRIES, 3);

    expect(verifyLotteryResults("a-different-seed", ranked, 3)).toBe(false);
  });

  it("returns true for an empty result", () => {
    expect(verifyLotteryResults(FIXED_SEED, [], 10)).toBe(true);
  });
});

// ─── generateLotterySeed ──────────────────────────────────────────────────────

describe("generateLotterySeed", () => {
  it("returns a non-empty string", () => {
    const seed = generateLotterySeed();
    expect(typeof seed).toBe("string");
    expect(seed.length).toBeGreaterThan(0);
  });

  it("produces unique seeds on each call", () => {
    const seeds = new Set(Array.from({ length: 100 }, () => generateLotterySeed()));
    expect(seeds.size).toBe(100);
  });
});
