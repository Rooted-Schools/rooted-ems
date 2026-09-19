/**
 * Policy-governed lottery draw — pure functions, no database, no clock.
 *
 * This is the arithmetic heart of the lottery. It is kept free of Supabase and
 * of Date.now() on purpose: given the same seed and the same entries it must
 * produce the same result on any machine, in any year, forever. That property
 * is what lets a family, a board member, or an authorizer re-run a disputed
 * lottery from the stored record and get the identical outcome.
 *
 * Rules encoded here come from the Rooted School Vancouver Board Enrollment
 * Policy, adopted 2023-01-25, revised 2024-08-20:
 *
 *   1. ABSOLUTE SIBLING PREFERENCE. Siblings of currently enrolled students
 *      are seated before the draw when the grade has space. When there are
 *      more of them than seats they are randomized among themselves and the
 *      remainder form a sibling-priority waitlist band ahead of the general
 *      waitlist.
 *
 *   2. WEIGHTED ENTRIES. A weighted applicant receives multiple entries in the
 *      draw — five for a child of contracted full-time staff, three for an
 *      economically disadvantaged applicant, one for everyone else. Multiplied
 *      chances, never a guarantee.
 *
 *   3. LINKED-SIBLING ACTIVATION. Siblings who are both new applicants gain
 *      sibling preference only once one of them has been drawn. At that moment
 *      the others are pulled in immediately behind the drawn sibling, for the
 *      remaining seats and for waitlist order alike.
 *
 *   4. PER-TIER PERCENTAGE CAPS. A weighted tier the board has capped (e.g.
 *      "founders' children, capped at 20 percent of enrollment") may occupy
 *      at most floor(totalSeats * capPercent / 100) SELECTED seats. The cap
 *      is applied AFTER ranking, on the final order produced by rules 1-3: it
 *      never changes anyone's random number or final_rank, it only decides
 *      is_selected. An entry that would have been selected on rank alone but
 *      finds its capped tier already full keeps its rank and is marked not
 *      selected; the seat passes to the next eligible entry.
 *
 *      CRITICAL SCOPE LIMIT — a percentage cap bounds admissions GRANTED
 *      UNDER THAT WEIGHTED PREFERENCE. It is not a population quota on every
 *      applicant who happens to match the tier's criteria. Absolute sibling
 *      preference (rule 1) and linked-sibling activation (rule 3) are a
 *      separate, uncapped, absolute preference — a seat awarded on sibling
 *      grounds was never "granted under" the capped tier, even when that same
 *      child also matches it (e.g. a staff member's child who is also an
 *      enrolled student's sibling). So entries placed "sibling_auto",
 *      "sibling_priority_waitlist", or "linked_sibling" are EXEMPT from every
 *      weighted-tier cap: a full cap never displaces them, and they never
 *      count toward a cap's selectedCount. Only placement "draw" — admitted
 *      through the weighted lottery itself — is subject to caps. Do not
 *      "simplify" this by capping every matching entry regardless of
 *      placement; that would silently deny an absolute, uncapped preference
 *      and is the exact defect an authorizer review would flag. See
 *      DrawOptions.capPercents and DrawResult.capAccounting.
 *
 * DETERMINISM CONTRACT
 *
 * The hash below is the same djb2 used by packages/utils/src/lottery-service.ts,
 * and a weight-1 applicant receives exactly the same random number here as it
 * would there — ticket zero of every applicant is keyed on the bare entry id.
 * That parity is asserted in lib/__tests__/lottery-draw.test.ts, so introducing
 * weighting did not silently move every unweighted applicant.
 */

// ─── Deterministic randomness ──────────────────────────────────────────────

/**
 * djb2 (Dan Bernstein). Same input, same unsigned 32-bit output, always.
 *
 * Its fairness here depends on entry ids carrying real entropy, and that is
 * not a stylistic preference. djb2 has weak avalanche: fed short, structured,
 * near-identical strings its outputs cluster, and a rehearsal measured
 * selection rates spreading from roughly 12% to 26% around a 19% expectation.
 * Fed real UUIDs, the same hash is uniform to within about two percent and
 * selection rates land exactly on sampling noise.
 *
 * Every id reaching this function is a gen_random_uuid() value today
 * (lottery_entry, application, lottery_entry_snapshot). If that ever changes
 * to a readable scheme, a sequence or a campus-prefixed run number, the draw
 * becomes quietly unfair with no error and no visible symptom.
 * lib/__tests__/lottery-fairness.test.ts fails loudly if it does.
 */
function djb2Hash(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic float in [0, 1) from a seed and a ticket id. */
export function seededFloat(seed: string, ticketId: string): number {
  return djb2Hash(`${seed}:${ticketId}`) / 0xffffffff;
}

// ─── Inputs and outputs ────────────────────────────────────────────────────

/** How an entry ended up where it did. Carried into the report verbatim. */
export type LotteryPlacement =
  | "sibling_auto"
  | "sibling_priority_waitlist"
  | "linked_sibling"
  | "draw";

/** Priority bands written to lottery_entry.priority_tier. Lower fills first. */
export const TIER_SIBLING_ABSOLUTE = 0;
export const TIER_LINKED_SIBLING = 1;
export const TIER_GENERAL = 2;

export interface DrawEntry {
  /** lottery_entry.id */
  id: string;
  /** application.id — the key linked-sibling relationships are expressed in. */
  applicationId: string;
  /** Lottery entries this applicant receives. Always >= 1. */
  weight: number;
  /** Weighted tier keys this applicant matched, for honest per-tier counts. */
  tierKeys: string[];
  /** Verified sibling of a student currently enrolled at this campus. */
  siblingOfEnrolled: boolean;
  /** application.ids of co-applying siblings in this same run. */
  linkedSiblingApplicationIds: string[];
}

export interface DrawnEntry {
  id: string;
  applicationId: string;
  priority_tier: number;
  random_number: number;
  final_rank: number;
  is_selected: boolean;
  placement: LotteryPlacement;
  weight: number;
  tierKeys: string[];
}

export interface DrawTierCount {
  key: string;
  applicants: number;
  /** Total tickets this tier contributed to the expanded pool. */
  entries: number;
}

/**
 * Per-tier cap enforcement accounting, one row per tier that carried an
 * active (>0) capPercent in this draw. Written so an authorizer can see the
 * cap actually operated: how many seats the tier was allowed, how many it
 * got, and how many otherwise-qualifying entries it turned away.
 */
export interface DrawTierCapAccounting {
  key: string;
  capPercent: number;
  /** floor(totalSeats * capPercent / 100) — the tier's seat ceiling. */
  seatLimit: number;
  /**
   * Seats this tier actually occupied once the cap was applied. Counts only
   * placement "draw" entries — a seat granted under this weighted
   * preference. Sibling-placed entries matching this tier never count here;
   * see siblingExemptCount.
   */
  selectedCount: number;
  /**
   * placement "draw" entries that belong to this tier, ranked within the
   * seat count, and would have been selected on rank alone, but were
   * skipped because this tier had already reached seatLimit. Each keeps its
   * final_rank; the seat it would have taken passed to the next eligible
   * entry.
   */
  displacedCount: number;
  /**
   * Entries that matched this tier's key but were seated on absolute
   * sibling grounds — placement "sibling_auto", "sibling_priority_waitlist",
   * or "linked_sibling" — rather than under this weighted preference.
   * Sibling preference is separate, uncapped, and absolute: these entries
   * were never candidates for this cap, could never be displaced by it, and
   * never counted toward selectedCount, regardless of whether they were
   * ultimately selected. Reported here so an auditor can see exactly who
   * matched the tier's criteria but was excluded from its cap, and why.
   */
  siblingExemptCount: number;
}

export interface DrawResult {
  ranked: DrawnEntry[];
  totalSeats: number;
  totalApplicants: number;
  /** Tickets in the expanded pool for the weighted portion of the draw. */
  totalPoolEntries: number;
  selectedCount: number;
  /**
   * Siblings actually SEATED before the draw. A sibling carrying the
   * "sibling_auto" placement who fell outside the seat count was not placed —
   * counting them here told a board that more sibling seats were awarded than
   * the grade even has.
   */
  siblingAutoPlaced: number;
  siblingPriorityWaitlisted: number;
  linkedSiblingActivated: number;
  tierCounts: DrawTierCount[];
  /** Cap enforcement accounting, one row per tier with an active cap. */
  capAccounting: DrawTierCapAccounting[];
}

export interface DrawOptions {
  /** Seat siblings of currently enrolled students before the draw. */
  siblingAutoOffer: boolean;
  /** Overflow siblings form a priority waitlist band ahead of the general one. */
  siblingOverflowPriority: boolean;
  /** Pull co-applying siblings in behind a drawn applicant. */
  linkedSiblingActivation: boolean;
  /**
   * Per-tier percentage caps, keyed by the same tier key carried in
   * DrawEntry.tierKeys (LotteryPolicyWeightedTier.key). Consistent with the
   * "0 = none set" convention in lottery-policy.ts: a key that is absent, or
   * whose value is 0 or undefined, means NO cap for that tier.
   *
   * A tier capped at C percent may occupy at most
   * floor(totalSeats * C / 100) SELECTED seats — but ONLY seats granted
   * under that weighted preference, i.e. entries with placement "draw". The
   * cap is enforced by walking the final ranked order (after the sibling
   * pre-pass and linked-sibling activation, so it sees every entry
   * regardless of how it got there): a "draw"-placed entry is selected only
   * while seats remain overall AND none of its capped tiers has already
   * reached its limit. An entry skipped for a full tier KEEPS its
   * final_rank — capping never renumbers anyone — it is simply not
   * selected, and the seat passes to the next eligible entry in rank order.
   *
   * Entries placed "sibling_auto", "sibling_priority_waitlist", or
   * "linked_sibling" are EXEMPT, even when their tierKeys also match a
   * capped tier: absolute sibling preference is a separate, uncapped rule,
   * not a seat "granted under" the weighted tier. Exempt entries are never
   * displaced by a full cap and never count toward its limit. See the
   * module doc (rule 4) and DrawResult.capAccounting.siblingExemptCount.
   */
  capPercents?: Record<string, number>;
}

// ─── Weighted pool expansion ───────────────────────────────────────────────

export interface PoolTicket {
  entryId: string;
  ticketId: string;
  ticketIndex: number;
}

/**
 * Expand entries into the ticket pool the draw actually runs over: an
 * applicant with weight 5 contributes exactly 5 tickets. Ticket zero keeps the
 * bare entry id so an unweighted applicant's random number is unchanged from
 * the pre-weighting engine.
 */
export function expandWeightedPool(entries: DrawEntry[]): PoolTicket[] {
  const tickets: PoolTicket[] = [];
  for (const entry of entries) {
    const weight = Math.max(1, Math.floor(entry.weight));
    for (let k = 0; k < weight; k++) {
      tickets.push({
        entryId: entry.id,
        ticketId: k === 0 ? entry.id : `${entry.id}#${k}`,
        ticketIndex: k,
      });
    }
  }
  return tickets;
}

/**
 * An applicant's draw position is their BEST ticket. Holding five tickets and
 * being ranked by the best of them is exactly what "five chances" means: it
 * multiplies the probability of landing near the front without ever
 * guaranteeing it, and it is reproducible from the seed.
 */
export function effectiveRandomByEntry(seed: string, entries: DrawEntry[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const ticket of expandWeightedPool(entries)) {
    const value = seededFloat(seed, ticket.ticketId);
    const current = best.get(ticket.entryId);
    if (current === undefined || value < current) best.set(ticket.entryId, value);
  }
  return best;
}

// ─── The draw ──────────────────────────────────────────────────────────────

function stableSort(entries: DrawEntry[], randomOf: (e: DrawEntry) => number): DrawEntry[] {
  // Sort by random number, then by entry id. The id tiebreak matters: two
  // applicants can hash to the same float, and "whichever the sort happened to
  // touch first" is not a defensible rule.
  return [...entries].sort((a, b) => {
    const ra = randomOf(a);
    const rb = randomOf(b);
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Run the complete policy-governed draw.
 *
 * Order of operations, which is the order the policy prescribes:
 *   1. Sibling pre-pass — absolute preference, randomized among themselves.
 *   2. Weighted draw over everyone else, ranked by best ticket.
 *   3. Linked-sibling activation — walking the drawn order, each newly placed
 *      applicant immediately pulls in their co-applying siblings.
 *   4. Seats fill from the top of the resulting order; everyone else is
 *      waitlisted in that same order.
 */
export function runPolicyDraw(
  seed: string,
  entries: DrawEntry[],
  totalSeats: number,
  options: DrawOptions
): DrawResult {
  if (!seed || seed.trim() === "") {
    throw new Error("Lottery seed must not be empty. Generate and store the seed before drawing.");
  }
  if (totalSeats < 0) {
    throw new Error("totalSeats must be >= 0.");
  }

  const seats = Math.floor(totalSeats);
  const randomByEntry = effectiveRandomByEntry(seed, entries);
  const randomOf = (e: DrawEntry) => randomByEntry.get(e.id) ?? seededFloat(seed, e.id);

  // ── 1. Sibling pre-pass ──────────────────────────────────────────────────
  // Randomized among themselves: plain seeded order on the bare entry id, not
  // the weighted best-ticket order. Weighting is a lottery mechanism; this
  // preference is categorical, and applying weights inside it would be a rule
  // the board did not adopt.
  const siblingEntries = options.siblingAutoOffer ? entries.filter((e) => e.siblingOfEnrolled) : [];
  const siblingIds = new Set(siblingEntries.map((e) => e.id));
  const siblingOrder = stableSort(siblingEntries, (e) => seededFloat(seed, e.id));

  const ordered: Array<{ entry: DrawEntry; placement: LotteryPlacement; random: number }> = [];

  siblingOrder.forEach((entry, index) => {
    const withinSeats = index < seats;
    ordered.push({
      entry,
      placement:
        withinSeats || !options.siblingOverflowPriority ? "sibling_auto" : "sibling_priority_waitlist",
      random: seededFloat(seed, entry.id),
    });
  });

  // ── 2. Weighted draw over everyone else ──────────────────────────────────
  const remaining = entries.filter((e) => !siblingIds.has(e.id));
  const drawOrder = stableSort(remaining, randomOf);

  // ── 3. Linked-sibling activation ─────────────────────────────────────────
  const byApplication = new Map<string, DrawEntry>();
  for (const entry of remaining) byApplication.set(entry.applicationId, entry);

  const placed = new Set<string>();
  let linkedSiblingActivated = 0;

  for (const entry of drawOrder) {
    if (placed.has(entry.id)) continue;
    placed.add(entry.id);
    ordered.push({ entry, placement: "draw", random: randomOf(entry) });

    if (!options.linkedSiblingActivation) continue;

    // Pull co-applying siblings in immediately behind the drawn applicant,
    // transitively: a set of three co-applying siblings all move together the
    // moment any one of them is drawn.
    const queue = [...entry.linkedSiblingApplicationIds];
    while (queue.length > 0) {
      const applicationId = queue.shift() as string;
      const sibling = byApplication.get(applicationId);
      if (!sibling || placed.has(sibling.id)) continue;
      placed.add(sibling.id);
      linkedSiblingActivated++;
      ordered.push({ entry: sibling, placement: "linked_sibling", random: randomOf(sibling) });
      queue.push(...sibling.linkedSiblingApplicationIds);
    }
  }

  // ── 4. Ranks ──────────────────────────────────────────────────────────────
  // Rank is purely positional — where an entry landed in the sibling
  // pre-pass / weighted-draw / linked-sibling order above. Capping (below)
  // must never renumber this; it only decides is_selected.
  const positioned = ordered.map((item, index) => {
    const rank = index + 1;
    let tier = TIER_GENERAL;
    if (item.placement === "sibling_auto" || item.placement === "sibling_priority_waitlist") {
      tier = TIER_SIBLING_ABSOLUTE;
    } else if (item.placement === "linked_sibling") {
      tier = TIER_LINKED_SIBLING;
    }
    return { item, rank, tier };
  });

  // ── 5. Cap-aware seat selection ──────────────────────────────────────────
  //
  // Per-tier caps are enforced here, on the FINAL rank order, so a capped
  // tier's seats are counted the same way regardless of where in that order
  // a "draw"-placed entry landed. capPercent 0/undefined for a key means no
  // cap: such keys are simply never added to capLimits below and never
  // constrain anyone.
  //
  // SIBLING EXEMPTION (see the module doc, rule 4, for the full rationale):
  // a cap bounds seats granted UNDER THE WEIGHTED TIER, not every applicant
  // who happens to match its criteria. Placement "sibling_auto",
  // "sibling_priority_waitlist", and "linked_sibling" are seats granted
  // under the separate, uncapped, absolute sibling preference — never under
  // a capped tier, even when the same child also matches one. Those three
  // placements are therefore skipped by the cap check entirely: they are
  // never displaced by a full tier and never increment capSelected. Only
  // placement "draw" is evaluated against capLimits below.
  const capLimits = new Map<string, number>(); // tier key -> seat ceiling
  for (const [key, pct] of Object.entries(options.capPercents ?? {})) {
    if (!pct || pct <= 0) continue;
    capLimits.set(key, Math.floor(seats * pct / 100));
  }
  const capSelected = new Map<string, number>();
  const capDisplaced = new Map<string, number>();
  const capSiblingExempt = new Map<string, number>();
  for (const key of capLimits.keys()) {
    capSelected.set(key, 0);
    capDisplaced.set(key, 0);
    capSiblingExempt.set(key, 0);
  }

  let seatsFilled = 0;
  const ranked: DrawnEntry[] = positioned.map(({ item, rank, tier }) => {
    let isSelected = false;
    const siblingGrounds = item.placement !== "draw";

    // Sibling-exemption accounting is independent of whether seats remain —
    // an entry either matches a capped tier's criteria under sibling
    // grounds or it doesn't, regardless of the eventual seat outcome.
    if (siblingGrounds) {
      for (const key of item.entry.tierKeys) {
        if (capLimits.has(key)) capSiblingExempt.set(key, (capSiblingExempt.get(key) ?? 0) + 1);
      }
    }

    if (seatsFilled < seats) {
      if (siblingGrounds) {
        // Absolute sibling preference: never subject to a weighted-tier cap.
        isSelected = true;
        seatsFilled++;
      } else {
        // A tier this entry belongs to is at its cap if it has a limit and
        // is already there. If ANY capped tier the entry belongs to is
        // full, the entry is displaced — it keeps its rank, the seat passes
        // on.
        const fullTierKeys = item.entry.tierKeys.filter((key) => {
          const limit = capLimits.get(key);
          return limit !== undefined && (capSelected.get(key) ?? 0) >= limit;
        });

        if (fullTierKeys.length === 0) {
          isSelected = true;
          seatsFilled++;
          for (const key of item.entry.tierKeys) {
            if (capLimits.has(key)) capSelected.set(key, (capSelected.get(key) ?? 0) + 1);
          }
        } else {
          for (const key of fullTierKeys) {
            capDisplaced.set(key, (capDisplaced.get(key) ?? 0) + 1);
          }
        }
      }
    }

    return {
      id: item.entry.id,
      applicationId: item.entry.applicationId,
      priority_tier: tier,
      random_number: item.random,
      final_rank: rank,
      is_selected: isSelected,
      placement: item.placement,
      weight: Math.max(1, Math.floor(item.entry.weight)),
      tierKeys: item.entry.tierKeys,
    };
  });

  const capAccounting: DrawTierCapAccounting[] = [...capLimits.entries()].map(([key, seatLimit]) => ({
    key,
    capPercent: options.capPercents?.[key] ?? 0,
    seatLimit,
    selectedCount: capSelected.get(key) ?? 0,
    displacedCount: capDisplaced.get(key) ?? 0,
    siblingExemptCount: capSiblingExempt.get(key) ?? 0,
  }));

  // ── Honest counts ────────────────────────────────────────────────────────
  const tierTotals = new Map<string, { applicants: number; entries: number }>();
  for (const entry of entries) {
    const weight = Math.max(1, Math.floor(entry.weight));
    for (const key of entry.tierKeys) {
      const current = tierTotals.get(key) ?? { applicants: 0, entries: 0 };
      current.applicants += 1;
      current.entries += weight;
      tierTotals.set(key, current);
    }
  }

  return {
    ranked,
    totalSeats: seats,
    totalApplicants: entries.length,
    totalPoolEntries: expandWeightedPool(remaining).length,
    selectedCount: ranked.filter((r) => r.is_selected).length,
    siblingAutoPlaced: ranked.filter((r) => r.placement === "sibling_auto" && r.is_selected).length,
    siblingPriorityWaitlisted: ranked.filter((r) => r.placement === "sibling_priority_waitlist")
      .length,
    linkedSiblingActivated,
    tierCounts: [...tierTotals.entries()].map(([key, v]) => ({ key, ...v })),
    capAccounting,
  };
}
