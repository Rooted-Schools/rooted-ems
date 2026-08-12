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
 * DETERMINISM CONTRACT
 *
 * The hash below is the same djb2 used by packages/utils/src/lottery-service.ts,
 * and a weight-1 applicant receives exactly the same random number here as it
 * would there — ticket zero of every applicant is keyed on the bare entry id.
 * That parity is asserted in lib/__tests__/lottery-draw.test.ts, so introducing
 * weighting did not silently move every unweighted applicant.
 */

// ─── Deterministic randomness ──────────────────────────────────────────────

/** djb2 (Dan Bernstein). Same input, same unsigned 32-bit output, always. */
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

export interface DrawResult {
  ranked: DrawnEntry[];
  totalSeats: number;
  totalApplicants: number;
  /** Tickets in the expanded pool for the weighted portion of the draw. */
  totalPoolEntries: number;
  selectedCount: number;
  siblingAutoPlaced: number;
  siblingPriorityWaitlisted: number;
  linkedSiblingActivated: number;
  tierCounts: DrawTierCount[];
}

export interface DrawOptions {
  /** Seat siblings of currently enrolled students before the draw. */
  siblingAutoOffer: boolean;
  /** Overflow siblings form a priority waitlist band ahead of the general one. */
  siblingOverflowPriority: boolean;
  /** Pull co-applying siblings in behind a drawn applicant. */
  linkedSiblingActivation: boolean;
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

  // ── 4. Ranks and seats ───────────────────────────────────────────────────
  const ranked: DrawnEntry[] = ordered.map((item, index) => {
    const rank = index + 1;
    const isSelected = rank <= seats;
    let tier = TIER_GENERAL;
    if (item.placement === "sibling_auto" || item.placement === "sibling_priority_waitlist") {
      tier = TIER_SIBLING_ABSOLUTE;
    } else if (item.placement === "linked_sibling") {
      tier = TIER_LINKED_SIBLING;
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
    siblingAutoPlaced: ranked.filter((r) => r.placement === "sibling_auto").length,
    siblingPriorityWaitlisted: ranked.filter((r) => r.placement === "sibling_priority_waitlist")
      .length,
    linkedSiblingActivated,
    tierCounts: [...tierTotals.entries()].map(([key, v]) => ({ key, ...v })),
  };
}
