/**
 * Policy-governed lottery draw — pure functions, no database, no clock.
 *
 * This is the arithmetic heart of the lottery. It is kept free of Supabase and
 * of Date.now() on purpose: given the same seed and the same entries it must
 * produce the same result on any machine, in any year, forever. That property
 * is what lets a family, a board member, or an authorizer re-run a disputed
 * lottery from the stored record and get the identical outcome.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THREE STATE REGIMES — why this engine has N ordered absolute-preference
 * bands instead of one hardcoded "sibling" special case.
 *
 * Rooted EMS runs the same engine for three campuses under three different
 * admissions-preference laws. None of the three may be treated as the
 * general rule; each is cited here so nobody later "simplifies" one state's
 * shape into a global default.
 *
 *   SOUTH CAROLINA (C.R. Neal Academy) — S.C. Code Ann. 59-40-50(B)(8), as
 *   amended by 2026 Act No. 123, and the adopted board policy (Policy JBC
 *   Section IV): FOUR ordered absolute preferences — (1) returning students,
 *   (2) siblings (current or within 6 years), (3) children of employees AND
 *   charter committee/board members, capped TOGETHER at 20% of enrollment,
 *   (4) active-duty military dependents, capped at 10%. "A student eligible
 *   for more than one preference is enrolled under only one, at the school's
 *   discretion" and "No other basis for preference is permitted." SC has NO
 *   weighted-tier mechanism and NO geographic preference — a geographic
 *   preference is not on this list and must not be invented for SC.
 *
 *   WASHINGTON (Rooted School Vancouver) — RCW 28A.710.050(3): a MANDATORY
 *   sibling preference, plus OPTIONAL weighted preferences ("a weighted
 *   enrollment preference for at-risk students or to children of full-time
 *   employees... if the employees' children reside within the state"). No
 *   percentage caps of any kind. This is the shape the engine was originally
 *   built around, and it remains exactly representable as a single enabled
 *   absolute-preference band (key "sibling_current_enrolled", uncapped) plus
 *   the existing weighted-tier mechanism below.
 *
 *   OHIO (Rooted Schools Cleveland) — ORC 3314.06(H): preference SHALL be
 *   given to returning students AND to students residing in the district
 *   where the school is located (a MANDATORY geographic preference — the
 *   exact opposite of SC, where geography is not a permitted basis at all).
 *   Preference MAY be given to siblings. Preference MAY be given to children
 *   of full-time staff, "provided the total number of students receiving
 *   this preference is less than five per cent of the school's total
 *   enrollment" — an ABSOLUTE preference with a cap, not a weighted tier.
 *
 * Two consequences follow directly from this and are enforced by the shapes
 * below, not by convention:
 *   - A percentage cap in this engine is a property of an ABSOLUTE
 *     PREFERENCE BAND (DrawAbsoluteBand.capPercent) or, separately, of a
 *     WEIGHTED TIER (DrawOptions.capPercents) — never a global setting, and
 *     never assumed present or absent for a state that has not adopted it.
 *   - "One preference per student" (SC) falls out of BAND ASSIGNMENT being
 *     first-match-wins over the campus's own configured band order — see
 *     "BAND ASSIGNMENT" below. There is no separate flag for it, because a
 *     flag would be a second, possibly-inconsistent way to express the same
 *     rule the ordering already expresses.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ABSOLUTE-PREFERENCE BANDS — the generalization of the old single sibling
 * pre-pass, and where the equal-footing cap fix lives.
 *
 * DrawOptions.absoluteBands is an ORDERED array. Band i fills before band
 * i+1, which fills before the general weighted draw. An applicant belongs to
 * the FIRST band (in this order) whose key appears in their
 * DrawEntry.absolutePreferenceKeys; an applicant matching several bands'
 * criteria is nonetheless assigned to exactly one — "the school's
 * discretion" the SC statute refers to, exercised in advance by the order
 * the campus's adopted policy configures. This is deliberately NOT a
 * "cascade to your next-best matching band if the first one caps you out"
 * rule: SC's "enrolled under only one" reads as one attempt, not one
 * guaranteed-best-available attempt, and cascading would let a capped
 * band's overflow quietly re-inflate a lower band's numbers. An applicant
 * capped out of their one matched band falls all the way to the general
 * pool. This is a real interpretive choice — flagged for review.
 *
 * BAND ASSIGNMENT is a pure per-entry lookup (does this id's
 * absolutePreferenceKeys contain this band's key), so it does not depend on
 * any other entry, and a band's own cap only ever looks at that band's own
 * randomized member order. That is what makes the equal-footing fix below
 * NOT require any fixed-point iteration — see "WHY NO ITERATION IS NEEDED."
 *
 * PER-BAND CAPS AND THE EQUAL-FOOTING FIX. A capped band (e.g. SC's
 * staff/board tier at 20%, or its military tier at 10%; OH's staff tier at
 * 5%) may seat at most floor(totalSeats * capPercent / 100) applicants
 * UNDER THAT PREFERENCE. Band members beyond that count are not merely
 * marked unselected — because a rank computed WITH the preference still
 * carries the preference's advantage into the waitlist order, which is
 * exactly the defect SC's compliance review calls out ("a student who is
 * denied a preference because a cap has been reached still enters the
 * lottery on the same footing as any other applicant") and OH's statute
 * implies ("admitted by lot from all those submitting applications, EXCEPT
 * preference..."). So a band member beyond the cap is fully DEMOTED: their
 * band membership is discarded and they are merged into the same pool of
 * entries that runs through the ordinary weighted draw (step 2 below),
 * competing with whatever weight their own — unrelated — weighted-tier
 * matches earn them, exactly like any applicant who never held the
 * preference. For SC and OH, which declare no weighted tiers at all, this
 * is in effect the plain, unweighted lot the statutes describe; the engine
 * does not need to special-case "unweighted" because that falls out of the
 * campus's own policy shape (see DrawOptions.absoluteBands doc for the test
 * oracle this produces).
 *
 * WHY NO ITERATION IS NEEDED (termination and correctness argument). A
 * naive reading of "demoting one entry can change who else is capped out"
 * suggests a fixed-point loop. It is not needed here, because:
 *   1. Band membership is EXCLUSIVE (first-match-wins), so an entry can only
 *      ever be a candidate for the cap of the ONE band it is assigned to —
 *      there is no cross-band membership overlap to re-evaluate.
 *   2. Within a band, the cap boundary is a fixed count (seatLimit) applied
 *      to that band's own randomized order, independent of every other
 *      band and of the total-seat count. Removing a below-the-line
 *      (demoted) entry from that order cannot change which entries are
 *      above the line — it only shortens the tail. So each band's
 *      survivor/demoted split is computed once, from that band's own
 *      membership and cap alone, in a single pass.
 *   3. A demoted entry only ever moves DOWNSTREAM (into the general pool,
 *      processed after every band), never into a band ahead of the one
 *      that demoted it and never back into a band's own accounting. There
 *      is therefore no cycle for a fixed point to resolve.
 *   4. The one thing that IS sequential — how many overall seats remain
 *      once bands 0..i-1 have taken theirs — is threaded through as a
 *      single running counter while bands are processed in order, exactly
 *      once each, top to bottom. No band is ever revisited.
 * The whole band-resolution phase is therefore O(number of entries), single
 * pass, provably terminating, and (see the test suite) produces exactly the
 * same final position for a demoted student as re-running the entire draw
 * with that student's capped preference key removed from their entry —
 * the equal-footing test oracle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WEIGHTED ENTRIES AND THE (SEPARATE, PRE-EXISTING) WEIGHTED-TIER CAP.
 *
 *   2. WEIGHTED ENTRIES. A weighted applicant receives multiple entries in the
 *      draw — five for a child of contracted full-time staff, three for an
 *      economically disadvantaged applicant, one for everyone else. Multiplied
 *      chances, never a guarantee. This is WA's mechanism (RCW
 *      28A.710.050(3)); SC has none, and OH's only capped preference (staff
 *      children) is an absolute band, not a weighted tier — see the state
 *      regimes block above.
 *
 *   3. LINKED-SIBLING ACTIVATION. Siblings who are both new applicants gain
 *      sibling preference only once one of them has been drawn. At that moment
 *      the others are pulled in immediately behind the drawn sibling, for the
 *      remaining seats and for waitlist order alike. This always runs over the
 *      GENERAL pool (entries not seated in any absolute band), so a linked-in
 *      sibling is, by construction, never simultaneously a band member — it
 *      is admitted because its co-applicant was drawn, not under any capped
 *      preference, and stays exempt from every cap for that reason.
 *
 *   4. WEIGHTED-TIER PERCENTAGE CAPS (DrawOptions.capPercents). This is the
 *      cap mechanism added for weighted tiers specifically (tierKeys +
 *      weight), predating the absolute-preference band generalization above.
 *      IMPORTANT KNOWN LIMITATION, left unchanged on purpose: an entry
 *      displaced by a full weighted-tier cap KEEPS the final_rank it earned
 *      with the tier's weight still applied — it is marked not selected, but
 *      not demoted to an unweighted position. This is the same defect the
 *      equal-footing fix above solves for absolute-preference bands. It was
 *      NOT ported here because none of the three governing regimes actually
 *      need a capped WEIGHTED tier: WA's weighted tiers are uncapped by
 *      statute, SC has no weighted tiers at all, and OH's only percentage
 *      cap applies to an absolute preference (see the regimes block). A
 *      policy's weightedTiers.capPercent field therefore remains inert
 *      today (no adopted policy sets one), but if a future campus ever
 *      configures BOTH a weight and a capPercent on the same tier, this
 *      known limitation would apply. Flagging this explicitly rather than
 *      silently leaving it undocumented.
 *
 *      CRITICAL SCOPE LIMIT — a percentage cap bounds admissions GRANTED
 *      UNDER THAT WEIGHTED PREFERENCE. It is not a population quota on every
 *      applicant who happens to match the tier's criteria. Absolute
 *      preference bands and linked-sibling activation are separate,
 *      uncapped by this mechanism (bands have their OWN cap field), and
 *      placements "sibling_auto", "sibling_priority_waitlist",
 *      "absolute_auto", "absolute_priority_waitlist", and "linked_sibling"
 *      are EXEMPT from every weighted-tier cap: a full cap never displaces
 *      them, and they never count toward a cap's selectedCount. Only
 *      placement "draw" — admitted through the weighted lottery itself — is
 *      subject to weighted-tier caps. See DrawOptions.capPercents and
 *      DrawResult.capAccounting.
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
  | "absolute_auto"
  | "absolute_priority_waitlist"
  | "linked_sibling"
  | "draw";

/**
 * Priority bands written to lottery_entry.priority_tier for the SINGLE-BAND
 * shape (exactly one enabled, auto-offer absolute preference — RSV's live
 * adopted policy). Lower fills first.
 *
 * These three constants describe that one shape, not a fixed layout for
 * every campus. The engine's actual numbering (see runPolicyDraw) is: band i
 * (0-indexed, in DrawOptions.absoluteBands order) -> tier i; linked-sibling
 * activation -> tier absoluteBands.length; general pool -> tier
 * absoluteBands.length + 1. With exactly one band this reduces to 0/1/2,
 * matching these constants exactly, which is why RSV's stored governed runs
 * (the only live governed runs today) remain correctly interpreted without
 * any migration. A campus configuring more than one absolute preference (a
 * future SC or OH policy) gets more tier numbers (0..N-1 for its N bands),
 * not a redefinition of these three.
 */
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
  /**
   * Keys of every ENABLED absolute preference (LotteryPolicyConfig.
   * absolutePreferences) this applicant's record satisfies, in NO particular
   * order — DrawOptions.absoluteBands carries the campus's configured
   * priority order separately. An applicant can honestly satisfy more than
   * one preference's criteria (e.g. a returning student who also has a
   * sibling enrolled); which ONE of them actually governs is decided by band
   * assignment in runPolicyDraw, not by this field. Empty for an applicant
   * who matches no absolute preference.
   */
  absolutePreferenceKeys: string[];
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
 * Per-tier / per-band cap enforcement accounting. One row per WEIGHTED TIER
 * that carried an active (>0) capPercent, PLUS one row per ABSOLUTE
 * PREFERENCE BAND that carried an active capPercent — both mechanisms write
 * into this same array so an auditor has one place to look. Weighted-tier
 * keys and absolute-preference-band keys share this keyspace; a policy must
 * not reuse a key across both (the engine does not police that — it is a
 * policy-config authoring concern).
 */
export interface DrawTierCapAccounting {
  key: string;
  capPercent: number;
  /** floor(totalSeats * capPercent / 100) — the tier's or band's seat ceiling. */
  seatLimit: number;
  /**
   * Seats actually occupied UNDER this preference once the cap was applied.
   * For a weighted tier, counts only placement "draw" entries. For an
   * absolute band, counts that band's own placement ("sibling_auto"/
   * "absolute_auto") entries that were actually seated (not lost to overall
   * seat scarcity).
   */
  selectedCount: number;
  /**
   * Entries denied THIS preference because its cap was already full, and
   * returned to the general pool to compete on ordinary footing (see the
   * module doc's equal-footing section). For the pre-existing weighted-tier
   * mechanism this counts entries that kept their tier-weighted rank but
   * were marked not selected (the known, documented limitation above); for
   * an absolute-preference band it counts entries that were fully demoted
   * and re-ranked as ordinary general applicants.
   */
  displacedCount: number;
  /**
   * Of the entries counted in displacedCount, how many nonetheless ended up
   * is_selected = true — i.e. won a seat entirely on their own merit after
   * losing this preference. Always 0 for the pre-existing weighted-tier
   * mechanism, which does not re-run a displaced entry through the general
   * pool (see the module doc's "known limitation"). Populated for absolute
   * preference bands, where demoted entries genuinely re-compete.
   */
  recoveredCount: number;
  /**
   * Entries that matched this key's criteria but were seated on absolute
   * sibling/linked-sibling grounds rather than under this weighted tier —
   * see the module doc. Always 0 for an absolute-preference band row:
   * band assignment happens before linked-sibling activation and is
   * mutually exclusive with it by construction (a band member cannot also
   * be pulled in as a linked sibling), so there is no exemption scenario to
   * report for a band. Kept as a field on every row anyway so tier-rows and
   * band-rows share one shape.
   */
  siblingExemptCount: number;
}

/** One ordered absolute-preference band. See the module doc for the model. */
export interface DrawAbsoluteBand {
  /** Matched against DrawEntry.absolutePreferenceKeys. */
  key: string;
  /**
   * When true, a member who does not fit in this band because TOTAL SEATS
   * (not this band's own cap) ran out is placed on a priority waitlist band
   * ahead of the general waitlist, exactly like the original sibling
   * overflow rule. This is unrelated to capPercent: it only ever fires when
   * the whole campus is oversubscribed even for the highest preferences.
   */
  overflowToPriorityWaitlist: boolean;
  /**
   * Founders'/staff'/military-style cap: share of seats this band may seat
   * UNDER THIS PREFERENCE, 0/undefined = none set (the "0 = no cap"
   * convention shared with weighted tiers — see lottery-policy.ts).
   */
  capPercent?: number;
}

export interface DrawAbsoluteBandCount {
  key: string;
  /** Seated under this band (placement sibling_auto/absolute_auto, selected). */
  autoPlaced: number;
  /** Band members left off ONLY because total seats ran out (not the cap). */
  priorityWaitlisted: number;
  /** Band members denied the preference because ITS cap was full. */
  demoted: number;
  /** Of the demoted, how many won a seat anyway in the general pool. */
  demotedRecovered: number;
}

export interface DrawResult {
  ranked: DrawnEntry[];
  totalSeats: number;
  totalApplicants: number;
  /** Tickets in the expanded pool for the weighted portion of the draw. */
  totalPoolEntries: number;
  selectedCount: number;
  /**
   * Siblings actually SEATED before the draw, under the band whose key is
   * "sibling_current_enrolled". A sibling who fell outside the seat count
   * was not placed — counting them here told a board that more sibling
   * seats were awarded than the grade even has. Kept for backward
   * compatibility; see DrawResult.absoluteBandCounts for every band.
   */
  siblingAutoPlaced: number;
  siblingPriorityWaitlisted: number;
  linkedSiblingActivated: number;
  tierCounts: DrawTierCount[];
  /** Per-absolute-preference-band accounting, one row per configured band. */
  absoluteBandCounts: DrawAbsoluteBandCount[];
  /** Cap enforcement accounting — weighted tiers and absolute bands alike. */
  capAccounting: DrawTierCapAccounting[];
}

export interface DrawOptions {
  /**
   * Ordered absolute-preference bands, highest priority first. See the
   * module doc's "ABSOLUTE-PREFERENCE BANDS" section for the full model.
   * RSV's shape is exactly one entry, key "sibling_current_enrolled",
   * overflowToPriorityWaitlist true, capPercent unset — which reproduces
   * the pre-generalization engine's sibling pre-pass byte for byte (see
   * lib/__tests__/lottery-draw.test.ts, "RSV backward compatibility").
   * An empty array disables absolute preferences entirely: every entry
   * competes only in the general weighted draw.
   */
  absoluteBands: DrawAbsoluteBand[];
  /** Pull co-applying siblings in behind a drawn applicant. */
  linkedSiblingActivation: boolean;
  /**
   * Per-WEIGHTED-TIER percentage caps, keyed by DrawEntry.tierKeys /
   * LotteryPolicyWeightedTier.key. This is the pre-existing mechanism
   * described in the module doc's "known limitation" section — unrelated to
   * DrawAbsoluteBand.capPercent, which caps an absolute preference band
   * instead. A key that is absent, or whose value is 0 or undefined, means
   * NO cap for that tier ("0 = none set", shared with lottery-policy.ts).
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
 *   1. Absolute-preference bands, in configured order — each band randomized
 *      among its own members, capped independently (equal-footing demotion
 *      for anyone beyond its cap), then seated while overall seats remain.
 *   2. Weighted draw over everyone else (general-pool entries plus anyone
 *      demoted out of a band), ranked by best ticket.
 *   3. Linked-sibling activation — walking the drawn order, each newly placed
 *      applicant immediately pulls in their co-applying siblings.
 *   4. Seats fill from the top of the resulting order; everyone else is
 *      waitlisted in that same order. Weighted-tier caps (a separate,
 *      pre-existing mechanism — see the module doc) are enforced here too.
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
  const bands = options.absoluteBands ?? [];

  // ── 1. Absolute-preference bands ─────────────────────────────────────────
  //
  // Band assignment is first-match-wins over the campus's configured order —
  // see the module doc for why this is "one preference per student" without
  // a separate flag, and why the per-band cap below needs no iteration.
  const bandIndexByEntryId = new Map<string, number>();
  for (const e of entries) {
    for (let i = 0; i < bands.length; i++) {
      if (e.absolutePreferenceKeys.includes(bands[i].key)) {
        bandIndexByEntryId.set(e.id, i);
        break;
      }
    }
  }

  const ordered: Array<{ entry: DrawEntry; placement: LotteryPlacement; random: number }> = [];
  const demotedAll: DrawEntry[] = [];
  const bandSurvivorIds: string[][] = bands.map(() => []);
  const bandDemotedIds: string[][] = bands.map(() => []);

  let precedingBandCount = 0;
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const members = entries.filter((e) => bandIndexByEntryId.get(e.id) === i);
    // Randomized among themselves on the BARE entry id, not the weighted
    // best-ticket order: this preference is categorical, and applying
    // lottery weights inside an absolute preference would be a rule no
    // board adopted.
    const randomized = stableSort(members, (e) => seededFloat(seed, e.id));

    const capPercent = band.capPercent && band.capPercent > 0 ? band.capPercent : 0;
    const seatLimit = capPercent > 0 ? Math.floor((seats * capPercent) / 100) : Infinity;

    const survivors = capPercent > 0 ? randomized.slice(0, seatLimit) : randomized;
    const demoted = capPercent > 0 ? randomized.slice(seatLimit) : [];

    bandSurvivorIds[i] = survivors.map((e) => e.id);
    bandDemotedIds[i] = demoted.map((e) => e.id);
    demotedAll.push(...demoted);

    const autoLabel: LotteryPlacement =
      band.key === "sibling_current_enrolled" ? "sibling_auto" : "absolute_auto";
    const waitLabel: LotteryPlacement =
      band.key === "sibling_current_enrolled" ? "sibling_priority_waitlist" : "absolute_priority_waitlist";

    survivors.forEach((entry, idx) => {
      const overallIndex = precedingBandCount + idx;
      const withinSeats = overallIndex < seats;
      ordered.push({
        entry,
        placement: withinSeats || !band.overflowToPriorityWaitlist ? autoLabel : waitLabel,
        random: seededFloat(seed, entry.id),
      });
    });
    precedingBandCount += survivors.length;
  }

  const bandedIds = new Set<string>();
  for (const ids of bandSurvivorIds) for (const id of ids) bandedIds.add(id);

  // ── 2. Weighted draw over everyone else ──────────────────────────────────
  // "Everyone else" is every entry never assigned to a band, PLUS every
  // entry demoted out of a band by its cap — the equal-footing fix: a
  // demoted entry competes here with exactly the weight its own (unrelated)
  // weighted-tier matches earn it, precisely like an applicant who never
  // held the preference. See the module doc for why this needs no
  // iteration and why it satisfies the equal-footing test oracle exactly.
  const remaining = entries.filter((e) => !bandedIds.has(e.id));
  const randomByEntry = effectiveRandomByEntry(seed, remaining);
  const randomOf = (e: DrawEntry) => randomByEntry.get(e.id) ?? seededFloat(seed, e.id);
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
  // Rank is purely positional — where an entry landed in the band /
  // weighted-draw / linked-sibling order above. Weighted-tier capping
  // (below) must never renumber this; it only decides is_selected. Band
  // capping already happened above, before ranks exist, by construction.
  const positioned = ordered.map((item, index) => {
    const rank = index + 1;
    const bandIndex = bandIndexByEntryId.get(item.entry.id);
    let tier: number;
    if (bandIndex !== undefined && bandedIds.has(item.entry.id)) {
      tier = bandIndex;
    } else if (item.placement === "linked_sibling") {
      tier = bands.length;
    } else {
      tier = bands.length + 1;
    }
    return { item, rank, tier };
  });

  // ── 5. Weighted-tier cap-aware seat selection ────────────────────────────
  //
  // This is the pre-existing mechanism (see the module doc's "known
  // limitation"), UNCHANGED: it enforces DrawOptions.capPercents on
  // placement "draw" entries only. Absolute-preference-band members were
  // already resolved (survivor vs. demoted) in step 1 above and are exempt
  // here exactly like linked-sibling entries are.
  const capLimits = new Map<string, number>(); // tier key -> seat ceiling
  for (const [key, pct] of Object.entries(options.capPercents ?? {})) {
    if (!pct || pct <= 0) continue;
    capLimits.set(key, Math.floor((seats * pct) / 100));
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
    const bandOrLinkedGrounds = item.placement !== "draw";

    if (bandOrLinkedGrounds) {
      for (const key of item.entry.tierKeys) {
        if (capLimits.has(key)) capSiblingExempt.set(key, (capSiblingExempt.get(key) ?? 0) + 1);
      }
    }

    if (seatsFilled < seats) {
      if (bandOrLinkedGrounds) {
        // Absolute preference (any band) or linked-sibling activation: never
        // subject to a weighted-tier cap. A band's OWN cap was already
        // enforced in step 1.
        isSelected = true;
        seatsFilled++;
      } else {
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

  const selectedById = new Map(ranked.map((r) => [r.id, r.is_selected]));

  const weightedTierCapAccounting: DrawTierCapAccounting[] = [...capLimits.entries()].map(
    ([key, seatLimit]) => ({
      key,
      capPercent: options.capPercents?.[key] ?? 0,
      seatLimit,
      selectedCount: capSelected.get(key) ?? 0,
      displacedCount: capDisplaced.get(key) ?? 0,
      // Always 0 — see DrawTierCapAccounting.recoveredCount doc: the
      // pre-existing weighted-tier mechanism does not re-run a displaced
      // entry through the general pool, so there is nothing to recover.
      recoveredCount: 0,
      siblingExemptCount: capSiblingExempt.get(key) ?? 0,
    })
  );

  // ── Absolute-band accounting ─────────────────────────────────────────────
  const absoluteBandCounts: DrawAbsoluteBandCount[] = bands.map((band, i) => {
    const autoPlaced = bandSurvivorIds[i].filter((id) => selectedById.get(id) === true).length;
    const priorityWaitlisted = bandSurvivorIds[i].filter((id) => selectedById.get(id) === false).length;
    const demoted = bandDemotedIds[i].length;
    const demotedRecovered = bandDemotedIds[i].filter((id) => selectedById.get(id) === true).length;
    return { key: band.key, autoPlaced, priorityWaitlisted, demoted, demotedRecovered };
  });

  const bandCapAccounting: DrawTierCapAccounting[] = bands
    .map((band, i) => {
      const capPercent = band.capPercent && band.capPercent > 0 ? band.capPercent : 0;
      if (capPercent <= 0) return null;
      const seatLimit = Math.floor((seats * capPercent) / 100);
      const counts = absoluteBandCounts[i];
      const row: DrawTierCapAccounting = {
        key: band.key,
        capPercent,
        seatLimit,
        selectedCount: counts.autoPlaced,
        displacedCount: counts.demoted,
        recoveredCount: counts.demotedRecovered,
        // Always 0 for a band — see the field doc for why no exemption
        // scenario is structurally possible here.
        siblingExemptCount: 0,
      };
      return row;
    })
    .filter((row): row is DrawTierCapAccounting => row !== null);

  const capAccounting: DrawTierCapAccounting[] = [...weightedTierCapAccounting, ...bandCapAccounting];

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
    absoluteBandCounts,
    capAccounting,
  };
}
