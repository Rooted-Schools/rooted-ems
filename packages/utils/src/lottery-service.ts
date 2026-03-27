/**
 * Deterministic Lottery Service
 *
 * Replaces the broken Math.random() implementation in lottery mutations.
 *
 * PROBLEM WITH THE OLD CODE:
 *   const seed = Math.floor(Math.random() * 1000000).toString(); // seed generated...
 *   random_number: Math.random(), // ...but Math.random() used anyway — seed ignored
 *
 * WHY THIS MATTERS:
 *   Charter school lotteries in most states require a reproducible, documented
 *   random selection process. If a family or regulator challenges the result,
 *   you must be able to re-run the exact same lottery from stored data and
 *   get the exact same outcome. Math.random() makes that impossible.
 *
 * HOW THIS WORKS:
 *   Given the same seed string and the same entries, this function ALWAYS
 *   produces the same ranked output. The seed is stored in lottery_run.random_seed
 *   BEFORE the run executes. Anyone with the seed and entry IDs can verify
 *   the result independently.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LotteryServiceEntry {
  /** Lottery entry ID from the lottery_entry table */
  id: string;
  /**
   * Priority tier — lower number = higher priority.
   * 0 = general pool, lower numbers get drawn first within a tier.
   * Sibling preference, geographic preference, etc. are expressed as
   * negative tiers or lower tier numbers in the lottery_rule_set config.
   */
  priority_tier: number;
}

export interface RankedLotteryEntry extends LotteryServiceEntry {
  /** Deterministic float in [0, 1) derived from seed + entry id */
  random_number: number;
  /** 1-based rank — rank 1 is the highest (first selected) */
  final_rank: number;
  /** True if this entry's rank is within the available seat count */
  is_selected: boolean;
}

export interface LotteryRunResult {
  ranked: RankedLotteryEntry[];
  seed: string;
  total_entries: number;
  total_selected: number;
}

// ─── Core Hash Function ──────────────────────────────────────────────────────

/**
 * djb2 hash — maps any string to a stable unsigned 32-bit integer.
 * Same input always produces the same output.
 * Fast, simple, well-understood, non-cryptographic.
 *
 * Source: Dan Bernstein's classic string hash algorithm.
 */
function djb2Hash(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    // hash * 33 XOR char code, keep as unsigned 32-bit integer
    hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Produce a deterministic float in [0, 1) from a seed and an entry ID.
 *
 * The entry ID is mixed into the seed so every entry gets a different number
 * even when using the same seed — and the same entry always gets the same
 * number with the same seed.
 */
function seededFloat(seed: string, entryId: string): number {
  const combined = `${seed}:${entryId}`;
  const hash = djb2Hash(combined);
  // 0xFFFFFFFF = max unsigned 32-bit value
  // Dividing gives a float in [0, 1)
  return hash / 0xFFFFFFFF;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a seed for a lottery run.
 *
 * Uses crypto.randomUUID() for high-quality randomness at the moment the
 * lottery is kicked off. The seed is stored in the database BEFORE the run
 * executes — making every subsequent step deterministic and verifiable.
 *
 * Call this once per run. Store the result as lottery_run.random_seed
 * immediately, then pass it to runDeterministicLottery.
 */
export function generateLotterySeed(): string {
  return crypto.randomUUID();
}

/**
 * Run the lottery deterministically.
 *
 * Given the same seed and the same entries, this function always produces
 * the same ranked output. This is the guarantee that makes the lottery
 * auditable and defensible.
 *
 * @param seed - The seed stored in lottery_run.random_seed. Must be stored
 *               in the database BEFORE calling this function.
 * @param entries - The entries to rank. Each needs an id and priority_tier.
 * @param totalSeats - Entries with final_rank <= totalSeats are selected.
 * @returns Ranked entries sorted by priority_tier ASC, random_number ASC.
 */
export function runDeterministicLottery(
  seed: string,
  entries: LotteryServiceEntry[],
  totalSeats: number
): LotteryRunResult {
  if (!seed || seed.trim() === "") {
    throw new Error("Lottery seed must not be empty. Generate and store the seed before running.");
  }
  if (totalSeats < 0) {
    throw new Error("totalSeats must be >= 0");
  }
  if (entries.length === 0) {
    return {
      ranked: [],
      seed,
      total_entries: 0,
      total_selected: 0,
    };
  }

  // Assign a deterministic random number to each entry
  const withRandom: RankedLotteryEntry[] = entries.map((entry) => ({
    ...entry,
    random_number: seededFloat(seed, entry.id),
    final_rank: 0, // assigned below
    is_selected: false, // assigned below
  }));

  // Sort: lower priority_tier first (higher priority), then by random_number
  // Within the same tier, random_number determines order — and it's deterministic
  withRandom.sort((a, b) => {
    if (a.priority_tier !== b.priority_tier) {
      return a.priority_tier - b.priority_tier;
    }
    return a.random_number - b.random_number;
  });

  // Assign 1-based ranks and selection status
  let totalSelected = 0;
  for (let i = 0; i < withRandom.length; i++) {
    const rank = i + 1;
    const selected = rank <= totalSeats;
    withRandom[i].final_rank = rank;
    withRandom[i].is_selected = selected;
    if (selected) totalSelected++;
  }

  return {
    ranked: withRandom,
    seed,
    total_entries: entries.length,
    total_selected: totalSelected,
  };
}

/**
 * Verify that stored lottery results are reproducible from the stored seed.
 *
 * Use this for audit verification: given the stored seed and the stored
 * entry IDs + priority tiers, does re-running the lottery produce identical
 * ranks and selection outcomes?
 *
 * Returns true if and only if every stored entry has the same final_rank
 * and is_selected in the re-run as it did in the original run.
 *
 * @param seed - The seed stored in lottery_run.random_seed
 * @param storedResults - The entries as stored in lottery_entry after the run
 * @param totalSeats - Total seats from lottery_run.total_seats
 */
export function verifyLotteryResults(
  seed: string,
  storedResults: RankedLotteryEntry[],
  totalSeats: number
): boolean {
  if (storedResults.length === 0) return true;

  const { ranked: rerun } = runDeterministicLottery(
    seed,
    storedResults.map((e) => ({ id: e.id, priority_tier: e.priority_tier })),
    totalSeats
  );

  // Build a map of re-run results by entry id for fast lookup
  const rerunById = new Map(rerun.map((e) => [e.id, e]));

  return storedResults.every((stored) => {
    const fresh = rerunById.get(stored.id);
    if (!fresh) return false;
    return (
      fresh.final_rank === stored.final_rank &&
      fresh.is_selected === stored.is_selected
    );
  });
}
