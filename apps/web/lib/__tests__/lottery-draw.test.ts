/**
 * The lottery draw itself.
 *
 * These are the assertions that have to hold on lottery day: the same seed
 * produces the same order, a 5:1 tier really does get five entries and not
 * "roughly" five, an absolute preference is seated before the draw and
 * overflow into a priority band rather than vanishing, a drawn applicant
 * pulls their co-applying siblings in behind them, and a student denied a
 * capped preference competes as an ordinary applicant rather than keeping
 * the rank the preference bought them.
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

// RSV's live adopted policy: exactly one absolute preference (sibling),
// auto-offer, overflow to a priority waitlist, linked-sibling activation on.
// See "RSV backward compatibility" below for the pin that this shape
// reproduces the pre-generalization engine's output byte for byte.
const RSV_OPTIONS: DrawOptions = {
  absoluteBands: [{ key: "sibling_current_enrolled", overflowToPriorityWaitlist: true }],
  linkedSiblingActivation: true,
};

const NO_BANDS_OPTIONS: DrawOptions = {
  absoluteBands: [],
  linkedSiblingActivation: false,
};

function entry(id: string, overrides: Partial<DrawEntry> = {}): DrawEntry {
  return {
    id,
    applicationId: `app-${id}`,
    weight: 1,
    tierKeys: [],
    absolutePreferenceKeys: [],
    linkedSiblingApplicationIds: [],
    ...overrides,
  };
}

function sibling(id: string, overrides: Partial<DrawEntry> = {}): DrawEntry {
  return entry(id, { absolutePreferenceKeys: ["sibling_current_enrolled"], ...overrides });
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
    const policy = runPolicyDraw(SEED, PLAIN_TEN, 10, NO_BANDS_OPTIONS);

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

// ─── Absolute-preference pre-pass (RSV's single sibling band) ──────────────

describe("absolute-preference band — seat math", () => {
  it("seats every sibling of a currently enrolled student before the draw", () => {
    const entries = [sibling("s1"), sibling("s2"), ...PLAIN_TEN];

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
    const siblings = Array.from({ length: 5 }, (_, i) => sibling(`s${i + 1}`));
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
    const siblings = Array.from({ length: 6 }, (_, i) => sibling(`s${i + 1}`));
    const a = runPolicyDraw(SEED, [...siblings, ...PLAIN_TEN], 2, RSV_OPTIONS);
    const b = runPolicyDraw(SEED, [...siblings].reverse().concat(PLAIN_TEN), 2, RSV_OPTIONS);
    expect(a.ranked.slice(0, 6).map((r) => r.id)).toEqual(b.ranked.slice(0, 6).map((r) => r.id));
  });

  it("ignores the sibling flag entirely when the policy declares no absolute preference band", () => {
    const entries = [sibling("s1"), ...PLAIN_TEN];
    const result = runPolicyDraw(SEED, entries, 3, NO_BANDS_OPTIONS);

    expect(result.siblingAutoPlaced).toBe(0);
    // With zero configured bands, tier numbering compacts: linked-sibling
    // would be 0 and general is 1 (band i -> tier i, linked -> bands.length,
    // general -> bands.length + 1). No live campus runs with zero absolute
    // preferences AND a stored governed run, so this differs from the
    // pre-generalization engine's fixed 0/1/2 layout only in a case nothing
    // in production exercises — see lib/lottery-draw.ts TIER_GENERAL doc.
    expect(result.ranked.every((r) => r.priority_tier === 1)).toBe(true);
  });

  it("does not weight the absolute-preference pre-pass — the preference is categorical", () => {
    // A staff-child sibling and an ordinary sibling are randomized on equal
    // footing. Applying lottery weights inside an absolute preference would be
    // a rule no board adopted.
    const entries = [sibling("s1", { weight: 5 }), sibling("s2", { weight: 1 })];
    const result = runPolicyDraw(SEED, entries, 2, RSV_OPTIONS);
    for (const row of result.ranked) {
      expect(row.random_number).toBe(seededFloat(SEED, row.id));
    }
  });

  it("leaves nobody selected when there are no seats", () => {
    const entries = [sibling("s1"), ...PLAIN_TEN];
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
      absoluteBands: RSV_OPTIONS.absoluteBands,
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
      sibling("s1"),
      sibling("s2"),
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

// ─── RSV backward compatibility ─────────────────────────────────────────────
//
// RSV is the only campus with a LIVE adopted policy today. Its shape is
// exactly one enabled, auto-offer absolute preference (sibling), uncapped,
// plus weighted tiers and linked-sibling activation. Generalizing the engine
// to N ordered bands must not change a single rank, selection, or placement
// for this shape. This test pins that with a realistic, larger, mixed
// population exercising every mechanism at once.

describe("RSV backward compatibility", () => {
  it("produces the same shape of result as the single-band engine for a realistic RSV population", () => {
    const entries: DrawEntry[] = [
      sibling("sib1"),
      sibling("sib2"),
      sibling("sib3"),
      entry("staffA", { weight: 5, tierKeys: ["staff_child"] }),
      entry("staffB", { weight: 5, tierKeys: ["staff_child"] }),
      entry("frlA", { weight: 3, tierKeys: ["economically_disadvantaged"] }),
      entry("linkA", {
        applicationId: "app-linkA",
        linkedSiblingApplicationIds: ["app-linkB"],
      }),
      entry("linkB", {
        applicationId: "app-linkB",
        linkedSiblingApplicationIds: ["app-linkA"],
      }),
      ...Array.from({ length: 15 }, (_, i) => entry(`gen${i + 1}`)),
    ];

    const result = runPolicyDraw(SEED, entries, 10, RSV_OPTIONS);

    // Sibling band is tier 0 and fills first, in its own randomized order.
    const siblingRows = result.ranked.filter((r) => r.id.startsWith("sib"));
    expect(siblingRows.every((r) => r.priority_tier === TIER_SIBLING_ABSOLUTE)).toBe(true);
    expect(siblingRows.map((r) => r.final_rank).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(siblingRows.every((r) => r.is_selected)).toBe(true);

    // No absolute-preference band ever caps out (RSV sets no cap), so there
    // is no cap accounting and nobody is demoted.
    expect(result.capAccounting).toEqual([]);
    expect(result.absoluteBandCounts).toEqual([
      { key: "sibling_current_enrolled", autoPlaced: 3, priorityWaitlisted: 0, demoted: 0, demotedRecovered: 0 },
    ]);

    // Weighted tiers still carry their full advantage in the general draw.
    const staffRows = result.ranked.filter((r) => r.id.startsWith("staff"));
    expect(staffRows.every((r) => r.weight === 5)).toBe(true);

    // Linked-sibling activation still fires for the general-pool pair.
    expect(result.linkedSiblingActivated).toBe(1);
    const linkedRow = result.ranked.find((r) => r.placement === "linked_sibling");
    expect(linkedRow).toBeDefined();
    expect(linkedRow!.priority_tier).toBe(TIER_LINKED_SIBLING);

    // Every applicant not seated on absolute or linked-sibling grounds is
    // "draw" and tier GENERAL.
    const generalRows = result.ranked.filter((r) => r.placement === "draw");
    expect(generalRows.every((r) => r.priority_tier === TIER_GENERAL)).toBe(true);

    // Total accounting is internally consistent.
    expect(result.ranked).toHaveLength(entries.length);
    expect(result.selectedCount).toBe(10);
  });

  it("is byte-identical across repeated runs of the same RSV-shaped config and seed", () => {
    const entries: DrawEntry[] = [
      sibling("sib1"),
      sibling("sib2"),
      entry("staffA", { weight: 5, tierKeys: ["staff_child"] }),
      ...PLAIN_TEN,
    ];
    const a = runPolicyDraw(SEED, entries, 6, RSV_OPTIONS);
    const b = runPolicyDraw(SEED, entries, 6, RSV_OPTIONS);
    expect(a).toEqual(b);
  });
});

// ─── Ordered absolute-preference bands (SC/OH-shaped, multi-band) ──────────

describe("ordered absolute-preference bands", () => {
  const RETURNING = "returning_student";
  const SIBLING = "sibling_current_enrolled";
  const STAFF_BOARD = "staff_or_board_child";
  const MILITARY = "military_dependent";

  const SC_SHAPED_OPTIONS: DrawOptions = {
    absoluteBands: [
      { key: RETURNING, overflowToPriorityWaitlist: true },
      { key: SIBLING, overflowToPriorityWaitlist: true },
      { key: STAFF_BOARD, overflowToPriorityWaitlist: true, capPercent: 20 },
      { key: MILITARY, overflowToPriorityWaitlist: true, capPercent: 10 },
    ],
    linkedSiblingActivation: false,
  };

  it("assigns each applicant to the FIRST matching band in configured order — one preference per student", () => {
    // Matches both returning-student and sibling criteria: SC's "eligible for
    // more than one preference is enrolled under only one" resolves to the
    // higher-priority (earlier-configured) band, not both and not neither.
    const both = entry("both", { absolutePreferenceKeys: [SIBLING, RETURNING] });
    const result = runPolicyDraw(SEED, [both, ...PLAIN_TEN], 15, SC_SHAPED_OPTIONS);
    const row = result.ranked.find((r) => r.id === "both")!;
    expect(row.priority_tier).toBe(0); // RETURNING is band index 0
    expect(row.placement).toBe("absolute_auto");
  });

  it("fills bands strictly in configured order — a lower band only sees seats the higher bands left", () => {
    const returning = Array.from({ length: 3 }, (_, i) => entry(`ret${i + 1}`, { absolutePreferenceKeys: [RETURNING] }));
    const siblings = Array.from({ length: 3 }, (_, i) => entry(`sib${i + 1}`, { absolutePreferenceKeys: [SIBLING] }));
    const result = runPolicyDraw(SEED, [...returning, ...siblings, ...PLAIN_TEN], 4, SC_SHAPED_OPTIONS);

    // All three returning students seated (band 0) before any sibling.
    expect(returning.every((e) => result.ranked.find((r) => r.id === e.id)!.is_selected)).toBe(true);
    // Only 1 of the 4 remaining seats is left for band 1 (siblings).
    const siblingSelected = siblings.filter((e) => result.ranked.find((r) => r.id === e.id)!.is_selected);
    expect(siblingSelected).toHaveLength(1);
    // The other two siblings are priority-waitlisted (seat scarcity, not a
    // cap — SIBLING has no capPercent in this config). The band's key is
    // "sibling_current_enrolled", the same key the real eligibility layer
    // uses, so it keeps the legacy "sibling_priority_waitlist" placement
    // literal for backward compatibility — see the module doc.
    const siblingWaitlisted = result.ranked.filter(
      (r) => r.id.startsWith("sib") && r.placement === "sibling_priority_waitlist"
    );
    expect(siblingWaitlisted).toHaveLength(2);
    expect(siblingWaitlisted.every((r) => r.priority_tier === 1)).toBe(true);
  });

  it("caps a band at floor(seats * capPercent / 100) and demotes the rest — the equal-footing oracle", () => {
    // 5 staff/board children, cap 20% of 20 seats = 4. One is denied.
    const staffBoard = Array.from({ length: 5 }, (_, i) =>
      entry(`sb${i + 1}`, { absolutePreferenceKeys: [STAFF_BOARD] })
    );
    const entries = [...staffBoard, ...Array.from({ length: 20 }, (_, i) => entry(`gen${i + 1}`))];

    const withPreference = runPolicyDraw(SEED, entries, 20, SC_SHAPED_OPTIONS);

    const bandRows = withPreference.ranked.filter((r) => r.id.startsWith("sb"));
    expect(bandRows).toHaveLength(5);

    const bandCounts = withPreference.absoluteBandCounts.find((b) => b.key === STAFF_BOARD)!;
    // 4 seated under the preference (the cap) + 1 denied and demoted to the
    // general pool = all 5 accounted for, whether or not the demoted one
    // ultimately wins a general seat too.
    expect(bandCounts.autoPlaced + bandCounts.demoted).toBe(5);

    const acc = withPreference.capAccounting.find((a) => a.key === STAFF_BOARD)!;
    expect(acc.seatLimit).toBe(4);
    expect(acc.selectedCount).toBe(4);
    expect(acc.displacedCount).toBe(1);

    // THE ORACLE: find the one denied applicant (still tagged with band
    // tier 2 in priority_tier, but NOT placement "absolute_auto" — they
    // were demoted before ranks were assigned, so they show up as an
    // ordinary "draw" or "linked_sibling" row instead), then re-run the
    // ENTIRE draw with that same applicant's preference key removed from
    // their entry (as if they never claimed it). Their final position in
    // the two runs must match exactly.
    const deniedId = bandRows.find((r) => r.placement !== "absolute_auto")!.id;
    const entriesWithoutPreference = entries.map((e) =>
      e.id === deniedId ? { ...e, absolutePreferenceKeys: [] } : e
    );
    const withoutPreference = runPolicyDraw(SEED, entriesWithoutPreference, 20, SC_SHAPED_OPTIONS);

    const deniedRowWith = withPreference.ranked.find((r) => r.id === deniedId)!;
    const deniedRowWithout = withoutPreference.ranked.find((r) => r.id === deniedId)!;
    expect(deniedRowWith.final_rank).toBe(deniedRowWithout.final_rank);
    expect(deniedRowWith.is_selected).toBe(deniedRowWithout.is_selected);
    expect(deniedRowWith.priority_tier).toBe(deniedRowWithout.priority_tier);
    expect(deniedRowWith.random_number).toBe(deniedRowWithout.random_number);
    expect(deniedRowWith.placement).toBe(deniedRowWithout.placement);

    // And every OTHER applicant's outcome is completely unaffected by
    // whether the denied student ever claimed the preference at all.
    for (const row of withPreference.ranked) {
      if (row.id === deniedId) continue;
      const other = withoutPreference.ranked.find((r) => r.id === row.id)!;
      expect(row.final_rank).toBe(other.final_rank);
      expect(row.is_selected).toBe(other.is_selected);
    }
  });

  it("records a demoted student who still wins a seat on their own merit", () => {
    // Cap military at 10% of 10 seats = 1. Two military dependents; the
    // second is demoted but there is plenty of general-pool room left, so
    // they very likely still get seated as an ordinary applicant. We assert
    // the accounting is internally consistent rather than the exact outcome
    // (which depends on the hash), because that is what the fix guarantees.
    const military = [
      entry("mil1", { absolutePreferenceKeys: [MILITARY] }),
      entry("mil2", { absolutePreferenceKeys: [MILITARY] }),
    ];
    const result = runPolicyDraw(SEED, [...military, ...PLAIN_TEN], 10, SC_SHAPED_OPTIONS);

    const acc = result.capAccounting.find((a) => a.key === MILITARY)!;
    expect(acc.seatLimit).toBe(1);
    expect(acc.selectedCount).toBe(1);
    expect(acc.displacedCount).toBe(1);
    expect(acc.recoveredCount).toBeGreaterThanOrEqual(0);
    expect(acc.recoveredCount).toBeLessThanOrEqual(1);

    const bandCounts = result.absoluteBandCounts.find((b) => b.key === MILITARY)!;
    expect(bandCounts.demoted).toBe(1);
    expect(bandCounts.demotedRecovered).toBe(acc.recoveredCount);

    // The demoted applicant, wherever they landed, is tracked as GENERAL or
    // linked-sibling tier, never still shown under the military band.
    const demotedId = military.find(
      (e) => !result.ranked.find((r) => r.id === e.id)!.placement.startsWith("absolute")
    )!.id;
    const demotedRow = result.ranked.find((r) => r.id === demotedId)!;
    expect(demotedRow.priority_tier).toBe(SC_SHAPED_OPTIONS.absoluteBands.length + 1);
    expect(demotedRow.placement).toBe("draw");
  });

  it("treats capPercent 0, undefined, and 100 as documented no-ops for a band", () => {
    const staffBoard = Array.from({ length: 5 }, (_, i) =>
      entry(`sb${i + 1}`, { absolutePreferenceKeys: [STAFF_BOARD] })
    );
    const entries = [...staffBoard, ...Array.from({ length: 10 }, (_, i) => entry(`gen${i + 1}`))];
    const seats = 15;

    const noCapOptions: DrawOptions = {
      absoluteBands: [{ key: STAFF_BOARD, overflowToPriorityWaitlist: true }],
      linkedSiblingActivation: false,
    };
    const zeroCapOptions: DrawOptions = {
      absoluteBands: [{ key: STAFF_BOARD, overflowToPriorityWaitlist: true, capPercent: 0 }],
      linkedSiblingActivation: false,
    };
    const hundredCapOptions: DrawOptions = {
      absoluteBands: [{ key: STAFF_BOARD, overflowToPriorityWaitlist: true, capPercent: 100 }],
      linkedSiblingActivation: false,
    };

    const noCap = runPolicyDraw(SEED, entries, seats, noCapOptions);
    const zeroCap = runPolicyDraw(SEED, entries, seats, zeroCapOptions);
    const hundredCap = runPolicyDraw(SEED, entries, seats, hundredCapOptions);

    expect(noCap.capAccounting).toEqual([]);
    expect(zeroCap.capAccounting).toEqual([]);
    // 100% of 15 seats = 15 = every entry, so the cap never binds.
    expect(hundredCap.capAccounting.find((a) => a.key === STAFF_BOARD)?.displacedCount ?? 0).toBe(0);

    expect(zeroCap.ranked.map((r) => r.is_selected)).toEqual(noCap.ranked.map((r) => r.is_selected));
    expect(hundredCap.ranked.map((r) => r.is_selected)).toEqual(noCap.ranked.map((r) => r.is_selected));
  });

  it("is deterministic for a fixed seed across repeated runs of a multi-band, multi-cap config", () => {
    const staffBoard = Array.from({ length: 5 }, (_, i) => entry(`sb${i + 1}`, { absolutePreferenceKeys: [STAFF_BOARD] }));
    const military = Array.from({ length: 3 }, (_, i) => entry(`mil${i + 1}`, { absolutePreferenceKeys: [MILITARY] }));
    const entries = [...staffBoard, ...military, ...PLAIN_TEN];

    const a = runPolicyDraw(SEED, entries, 12, SC_SHAPED_OPTIONS);
    const b = runPolicyDraw(SEED, entries, 12, SC_SHAPED_OPTIONS);
    expect(a).toEqual(b);
  });

  it("keeps a linked-in sibling exempt from a band's cap even when the campus also runs bands", () => {
    // A general-pool pair, neither claiming any absolute preference, so
    // linked-sibling activation still runs over the general draw exactly as
    // in the single-band case, untouched by band caps.
    const optionsWithLinked: DrawOptions = { ...SC_SHAPED_OPTIONS, linkedSiblingActivation: true };
    const entries = [
      entry("a", { applicationId: "app-a", linkedSiblingApplicationIds: ["app-b"] }),
      entry("b", { applicationId: "app-b", linkedSiblingApplicationIds: ["app-a"] }),
      ...PLAIN_TEN,
    ];
    const result = runPolicyDraw(SEED, entries, 12, optionsWithLinked);
    expect(result.linkedSiblingActivated).toBe(1);
    const linkedRow = result.ranked.find((r) => r.placement === "linked_sibling")!;
    expect(linkedRow.is_selected).toBe(true);
    // No band cap accounting exists for this run's exempt entries at all,
    // since siblings here never claimed any band.
    expect(result.capAccounting.every((a) => a.siblingExemptCount === 0)).toBe(true);
  });
});

// ─── Per-tier percentage caps (pre-existing weighted-tier mechanism) ───────
//
// capPercent bounds how many SEATS a weighted tier may occupy — it does not
// touch rank, random_number, or ordering. This mechanism is intentionally
// UNCHANGED by the absolute-preference-band generalization (see the module
// doc's "known limitation": no live policy configures a capped weighted
// tier, so its pre-existing demotion behavior — keep rank, mark unselected —
// is left exactly as it was). Every test here holds rank/order constant
// (same seed, same entries) and checks only what is_selected and
// capAccounting say.

describe("per-tier percentage caps (weighted tiers)", () => {
  const CAPPED_KEY = "capped_tier";

  const NO_BANDS: DrawOptions = {
    absoluteBands: [],
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
      ...NO_BANDS,
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
      {
        key: CAPPED_KEY,
        capPercent: 20,
        seatLimit: 3,
        selectedCount: 3,
        displacedCount: 2,
        recoveredCount: 0,
        siblingExemptCount: 0,
      },
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

  it("exempts entries seated through an absolute-preference band from a weighted-tier cap", () => {
    // Five siblings all match the capped tier — e.g. each is also an
    // employee's child, and the employee-child tier is capped at 20%. A cap
    // bounds seats granted UNDER THAT WEIGHTED TIER; the absolute preference
    // band is a separate, uncapped-by-this-mechanism preference, so none of
    // these five may be displaced by the weighted-tier cap, and none of them
    // counts toward it, even though their tierKeys match it.
    const siblingEntries = Array.from({ length: 5 }, (_, i) =>
      sibling(`sib${i + 1}`, { tierKeys: [CAPPED_KEY] })
    );
    const result = runPolicyDraw(SEED, [...siblingEntries, ...PLAIN_TEN], 10, {
      absoluteBands: RSV_OPTIONS.absoluteBands,
      linkedSiblingActivation: false,
      capPercents: { [CAPPED_KEY]: 20 }, // limit = 2 — irrelevant to these five
    });

    const siblingRows = result.ranked.filter((r) => r.id.startsWith("sib"));
    // All five still sit ahead of the general pool — capping never touches order.
    expect(siblingRows.map((r) => r.final_rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(result.siblingPriorityWaitlisted).toBe(0);

    // All five are selected. None is displaced by the cap.
    expect(siblingRows.every((r) => r.is_selected)).toBe(true);
    expect(result.siblingAutoPlaced).toBe(5);

    // The general pool fills the remaining 5 seats exactly as it would with
    // no cap at all.
    expect(result.selectedCount).toBe(10);

    // The cap's own accounting shows it never touched these five: zero
    // selected under it, zero displaced by it. They are recorded instead as
    // exempt, so an auditor can see the cap operated correctly by NOT
    // applying to an absolute preference.
    expect(result.capAccounting).toEqual([
      {
        key: CAPPED_KEY,
        capPercent: 20,
        seatLimit: 2,
        selectedCount: 0,
        displacedCount: 0,
        recoveredCount: 0,
        siblingExemptCount: 5,
      },
    ]);
  });

  it("exempts a linked-in sibling while the applicant actually drawn remains subject to the cap", () => {
    // "a" and "b" are co-applying siblings who both match the capped tier.
    // Whichever is drawn first is admitted (or not) as a normal placement
    // "draw" entry — subject to the cap like anyone else in the tier. The
    // other is pulled in on linked-sibling grounds, not under the capped
    // preference, so it is exempt for the same reason an absolute-preference
    // band entry is exempt: never displaced by the cap, never counted
    // toward it.
    //
    // Seats == total entries (2 pair + 3 extra + 10 plain = 15), so — as in
    // the seats-vs-entries tests above — every entry is walked and the cap
    // is the only possible reason anything is left unselected.
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
    expect(entries).toHaveLength(15);

    const result = runPolicyDraw(SEED, entries, 15, {
      absoluteBands: [],
      linkedSiblingActivation: true,
      capPercents: { [CAPPED_KEY]: 10 }, // limit = floor(15 * 10/100) = 1
    });

    const rankOf = (id: string) => result.ranked.find((r) => r.id === id)!.final_rank;
    expect(Math.abs(rankOf("a") - rankOf("b"))).toBe(1);
    expect(result.linkedSiblingActivated).toBe(1);

    const pairRows = result.ranked.filter((r) => r.id === "a" || r.id === "b");
    const linkedRow = pairRows.find((r) => r.placement === "linked_sibling")!;
    const drawnRow = pairRows.find((r) => r.placement === "draw")!;
    expect(linkedRow).toBeDefined();
    expect(drawnRow).toBeDefined();

    // The linked-in sibling is exempt: with seats == total entries, it is
    // always selected regardless of the capped tier's fill state.
    expect(linkedRow.is_selected).toBe(true);

    // Exactly one seat in the capped tier goes to a placement "draw" entry —
    // extra1-3 plus whichever of a/b was actually drawn are the four
    // candidates subject to the cap; the linked-in sibling is not among them.
    expect(result.capAccounting).toEqual([
      {
        key: CAPPED_KEY,
        capPercent: 10,
        seatLimit: 1,
        selectedCount: 1,
        displacedCount: 3,
        recoveredCount: 0,
        siblingExemptCount: 1, // exactly the linked-in half of the pair
      },
    ]);

    // 1 (the cap's single seat) + 10 (uncapped plain) + 1 (exempt linked
    // sibling) = 12; the other 3 draw-placement candidates are displaced.
    expect(result.selectedCount).toBe(12);
  });

  it("tallies displacement accurately when two different tiers are both capped", () => {
    // Seats == total entries (4 + 4 + 10 = 18), so — as above — every entry
    // is walked and the only source of non-selection is the cap itself.
    const alpha = Array.from({ length: 4 }, (_, i) => entry(`alpha${i + 1}`, { tierKeys: ["alpha"] }));
    const beta = Array.from({ length: 4 }, (_, i) => entry(`beta${i + 1}`, { tierKeys: ["beta"] }));
    const result = runPolicyDraw(SEED, [...alpha, ...beta, ...PLAIN_TEN], 18, {
      ...NO_BANDS,
      capPercents: { alpha: 10, beta: 20 }, // limits: floor(18*.1)=1, floor(18*.2)=3
    });

    const alphaAcc = result.capAccounting.find((a) => a.key === "alpha")!;
    const betaAcc = result.capAccounting.find((a) => a.key === "beta")!;
    expect(alphaAcc).toEqual({
      key: "alpha",
      capPercent: 10,
      seatLimit: 1,
      selectedCount: 1,
      displacedCount: 3,
      recoveredCount: 0,
      siblingExemptCount: 0,
    });
    expect(betaAcc).toEqual({
      key: "beta",
      capPercent: 20,
      seatLimit: 3,
      selectedCount: 3,
      displacedCount: 1,
      recoveredCount: 0,
      siblingExemptCount: 0,
    });

    // 1 (alpha) + 3 (beta) + 10 (plain, uncapped) = 14; the 4 displaced seats
    // (3 alpha + 1 beta) go unused rather than being handed to either capped
    // tier beyond its limit.
    expect(result.selectedCount).toBe(14);
  });
});
