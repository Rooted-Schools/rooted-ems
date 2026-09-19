/**
 * Golden-output regression for Rooted School Vancouver.
 *
 * RSV is the only campus running a board-ADOPTED lottery policy today
 * (adopted 2023-01-25, revised 2024-08-20), and its shape is exactly what
 * Washington law prescribes: one mandatory absolute sibling preference
 * (RCW 28A.710.050(3)), optional weighted tiers, no caps.
 *
 * These fixtures were captured from the engine as it stood BEFORE the draw
 * was generalized to N ordered preference bands, across 48 combinations of
 * seed and applicant population. They are a characterization test: the point
 * is not that these particular ranks are "correct" in the abstract, but that
 * a real school's lottery must not move because the engine was refactored to
 * serve other states.
 *
 * If a change makes this fail, that change alters who gets a seat at RSV.
 * Do not re-record the fixtures to make it pass. Establish first that the
 * change is intended and that RSV's board and authorizer expect it.
 */
import { describe, it, expect } from "vitest";
import { runPolicyDraw, type DrawEntry, type DrawOptions } from "../lottery-draw";
import golden from "./fixtures/rsv-golden-draws.json";

interface GoldenCase {
  seed: string;
  seats: number;
  pop: { nSib: number; nStaff: number; nFrl: number; nGen: number };
  ranked: { id: string; rank: number; sel: boolean; tier: number; place: string; rnd: number; w: number }[];
  selectedCount: number;
  linkedSiblingActivated: number;
  siblingAutoPlaced: number;
  siblingPriorityWaitlisted: number;
}

/** RSV's live shape, expressed in the generalized band API. */
const RSV_OPTIONS: DrawOptions = {
  absoluteBands: [{ key: "sibling_current_enrolled", overflowToPriorityWaitlist: true }],
  linkedSiblingActivation: true,
} as DrawOptions;

function buildPopulation(pop: GoldenCase["pop"]): DrawEntry[] {
  const spec: { id: string; applicationId: string; weight: number; tierKeys: string[]; isSib: boolean; links: string[] }[] = [];
  let i = 0;
  const push = (isSib: boolean, w: number, t: string[]) => {
    spec.push({ id: `e${i}`, applicationId: `app-${i}`, weight: w, tierKeys: t, isSib, links: [] });
    i++;
  };
  for (let k = 0; k < pop.nSib; k++) push(true, 1, []);
  for (let k = 0; k < pop.nStaff; k++) push(false, 5, ["staff_child"]);
  for (let k = 0; k < pop.nFrl; k++) push(false, 3, ["economically_disadvantaged"]);
  for (let k = 0; k < pop.nGen; k++) push(false, 1, []);
  if (pop.nGen >= 2) {
    const a = spec[spec.length - 1];
    const b = spec[spec.length - 2];
    a.links = [b.applicationId];
    b.links = [a.applicationId];
  }
  return spec.map((s) => ({
    id: s.id,
    applicationId: s.applicationId,
    weight: s.weight,
    tierKeys: s.tierKeys,
    absolutePreferenceKeys: s.isSib ? ["sibling_current_enrolled"] : [],
    linkedSiblingApplicationIds: s.links,
  })) as DrawEntry[];
}

describe("RSV golden draws — the generalized engine must not move a live adopted lottery", () => {
  const cases = golden as unknown as GoldenCase[];

  it("has the full fixture set", () => {
    expect(cases).toHaveLength(48);
  });

  for (const c of cases) {
    it(`${c.seed}, seats=${c.seats}, pop ${c.pop.nSib}/${c.pop.nStaff}/${c.pop.nFrl}/${c.pop.nGen}`, () => {
      const result = runPolicyDraw(c.seed, buildPopulation(c.pop), c.seats, RSV_OPTIONS);
      const actual = result.ranked.map((x) => ({
        id: x.id, rank: x.final_rank, sel: x.is_selected,
        tier: x.priority_tier, place: x.placement, rnd: x.random_number, w: x.weight,
      }));
      expect(actual).toEqual(c.ranked);
      expect(result.selectedCount).toBe(c.selectedCount);
      expect(result.linkedSiblingActivated).toBe(c.linkedSiblingActivated);
      expect(result.siblingAutoPlaced).toBe(c.siblingAutoPlaced);
      expect(result.siblingPriorityWaitlisted).toBe(c.siblingPriorityWaitlisted);
    });
  }
});
