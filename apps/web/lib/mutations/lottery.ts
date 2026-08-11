import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { generateLotterySeed, runDeterministicLottery } from "@rooted-ems/utils";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { notifyFamilyApplicationWaitlisted, notifyFamilyOfOffer } from "@/lib/notify";
import { ensureWaitlist, addToWaitlist } from "./waitlist";
import type { MutationResult } from "./applications";

// ─── Types ─────────────────────────────────────────────

export interface CreateLotteryRunInput {
  enrollment_window_id: string;
  campus_id: string;
  grade_level_id: string;
  lottery_rule_set_id?: string;
  total_seats: number;
  notes?: string;
}

// ─── Priority Tiers ────────────────────────────────────
//
// Tiers come from lottery_rule_set.priority_tiers (JSONB, per campus) so each
// campus can encode what its authorizer permits — sibling preference, children
// of staff, geographic zones — without a code change. Tier order = priority:
// index 0 fills seats first. Applications matching no tier land in the general
// pool (tier = tiers.length).

interface TierMatcher {
  /** "column" matches a boolean column on application; "answer" matches application_answer. */
  source: "column" | "answer";
  /** Column name (allowlisted) or application_answer.question_key. */
  field: string;
  /** For answers: value that grants the tier (case-insensitive). Defaults to yes/true. */
  match_value?: string;
}

export interface PriorityTierDef {
  key: string;
  label: string;
  /** A tier matches when ANY of its matchers hit. */
  matchers: TierMatcher[];
}

// Boolean application columns a rule set may reference. Matcher fields are
// data from the DB, but they end up in query filters — never widen this
// beyond known boolean columns.
const MATCHABLE_APP_COLUMNS = new Set(["has_sibling_enrolled"]);

/**
 * Default rule set: sibling preference only — the behavior every campus had
 * before rule sets were wired up. Checks BOTH sibling signals: the
 * application column (set by staff-submitted apps) and the family form's
 * answer key. (The old code queried question_key "hasSiblingEnrolled", which
 * no writer ever produced, so sibling priority silently never applied to
 * family applications.)
 */
const DEFAULT_PRIORITY_TIERS: PriorityTierDef[] = [
  {
    key: "sibling",
    label: "Sibling enrolled at campus",
    matchers: [
      { source: "column", field: "has_sibling_enrolled" },
      { source: "answer", field: "has_sibling_at_school" },
    ],
  },
];

function coerceTierDefs(raw: unknown): PriorityTierDef[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const tiers: PriorityTierDef[] = [];
  for (const item of raw) {
    const t = item as Record<string, unknown>;
    if (typeof t?.key !== "string" || typeof t?.label !== "string" || !Array.isArray(t?.matchers)) {
      return null;
    }
    const matchers: TierMatcher[] = [];
    for (const m of t.matchers as Array<Record<string, unknown>>) {
      if (
        (m?.source !== "column" && m?.source !== "answer") ||
        typeof m?.field !== "string"
      ) {
        return null;
      }
      if (m.source === "column" && !MATCHABLE_APP_COLUMNS.has(m.field)) return null;
      matchers.push({
        source: m.source,
        field: m.field,
        match_value: typeof m.match_value === "string" ? m.match_value : undefined,
      });
    }
    if (matchers.length === 0) return null;
    tiers.push({ key: t.key, label: t.label, matchers });
  }
  return tiers;
}

interface ResolvedRuleSet {
  ruleSetId: string | null;
  tiers: PriorityTierDef[];
}

/**
 * Load the tier definitions for a run: the requested rule set, else the
 * campus's active rule set, else the sibling-only default. Malformed JSONB
 * falls back to the default rather than failing a lottery.
 */
async function resolvePriorityTiers(
  supabase: Awaited<ReturnType<typeof createServerClient>> | ReturnType<typeof createServiceRoleClient>,
  campusId: string,
  ruleSetId?: string
): Promise<ResolvedRuleSet> {
  let query = supabase
    .from("lottery_rule_set")
    .select("id, priority_tiers")
    .eq("campus_id", campusId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1);
  if (ruleSetId) {
    query = supabase
      .from("lottery_rule_set")
      .select("id, priority_tiers")
      .eq("id", ruleSetId)
      .limit(1);
  }
  const { data } = await query;
  const row = data?.[0] as Record<string, unknown> | undefined;
  if (!row) return { ruleSetId: null, tiers: DEFAULT_PRIORITY_TIERS };
  const tiers = coerceTierDefs(row.priority_tiers);
  if (!tiers) {
    console.warn("[resolvePriorityTiers] malformed priority_tiers, using default", {
      ruleSetId: row.id,
    });
    return { ruleSetId: row.id as string, tiers: DEFAULT_PRIORITY_TIERS };
  }
  return { ruleSetId: row.id as string, tiers };
}

/**
 * Assign each application its priority tier: the index of the FIRST tier
 * with any matching matcher, else tiers.length (general pool).
 */
async function assignPriorityTiers(
  supabase: Awaited<ReturnType<typeof createServerClient>> | ReturnType<typeof createServiceRoleClient>,
  appIds: string[],
  tiers: PriorityTierDef[]
): Promise<Map<string, number>> {
  const assignment = new Map<string, number>();
  if (appIds.length === 0) return assignment;

  for (let index = 0; index < tiers.length; index++) {
    const matched = new Set<string>();
    for (const matcher of tiers[index].matchers) {
      if (matcher.source === "column") {
        const { data } = await supabase
          .from("application")
          .select("id")
          .in("id", appIds)
          .eq(matcher.field, true);
        for (const row of data ?? []) matched.add((row as Record<string, string>).id);
      } else {
        const accepted = matcher.match_value
          ? [matcher.match_value.toLowerCase()]
          : ["yes", "true"];
        const { data } = await supabase
          .from("application_answer")
          .select("application_id, answer_value")
          .in("application_id", appIds)
          .eq("question_key", matcher.field);
        for (const row of data ?? []) {
          const r = row as Record<string, string>;
          if (accepted.includes((r.answer_value ?? "").toLowerCase())) {
            matched.add(r.application_id);
          }
        }
      }
    }
    for (const id of matched) {
      if (!assignment.has(id)) assignment.set(id, index);
    }
  }

  for (const id of appIds) {
    if (!assignment.has(id)) assignment.set(id, tiers.length);
  }
  return assignment;
}

// ─── Create Draft Lottery Run ──────────────────────────

export async function createLotteryRun(
  input: CreateLotteryRunInput
): Promise<MutationResult<{ id: string }>> {
  // Service role on purpose: staff-only action (staffCreateLotteryRun gates
  // on requireRoleOnCampus for input.campus_id). Selects/updates `application`
  // directly, which trips the same latent RLS recursion (application policy
  // -> guardian policy -> application policy) documented in
  // lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  // Compute the next run_number for this campus/grade
  const { data: existing } = await supabase
    .from("lottery_run")
    .select("run_number")
    .eq("campus_id", input.campus_id)
    .eq("grade_level_id", input.grade_level_id)
    .order("run_number", { ascending: false })
    .limit(1);

  const nextRunNumber = ((existing?.[0] as Record<string, number> | undefined)?.run_number ?? 0) + 1;

  // Count eligible applicants (verified status for this campus + grade)
  const { count: applicantCount } = await supabase
    .from("application")
    .select("id", { count: "exact", head: true })
    .eq("campus_id", input.campus_id)
    .eq("grade_level_id", input.grade_level_id)
    .in("status", ["verified", "lottery_assigned"]);

  // Resolve the campus's priority tiers before creating the run so the run
  // records which rule set actually governed entry tiers.
  const { ruleSetId, tiers } = await resolvePriorityTiers(
    supabase,
    input.campus_id,
    input.lottery_rule_set_id
  );

  const { data: run, error } = await supabase
    .from("lottery_run")
    .insert({
      enrollment_window_id: input.enrollment_window_id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      lottery_rule_set_id: ruleSetId,
      status: "draft",
      run_number: nextRunNumber,
      total_applicants: applicantCount ?? 0,
      total_seats: input.total_seats,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createLotteryRun]", error.message);
    return { data: null, error: "Failed to create lottery run." };
  }

  // Auto-populate lottery entries from eligible applications
  const { data: eligibleApps } = await supabase
    .from("application")
    .select("id")
    .eq("campus_id", input.campus_id)
    .eq("grade_level_id", input.grade_level_id)
    .in("status", ["verified", "lottery_assigned"]);

  if (eligibleApps && eligibleApps.length > 0) {
    const appIds = eligibleApps.map((a: Record<string, string>) => a.id);

    const tierByApp = await assignPriorityTiers(supabase, appIds, tiers);

    const entries = eligibleApps.map((app: Record<string, string>) => ({
      lottery_run_id: run.id,
      application_id: app.id,
      priority_tier: tierByApp.get(app.id) ?? tiers.length,
    }));

    const { error: entryError } = await supabase
      .from("lottery_entry")
      .insert(entries);

    if (entryError) {
      console.error("[createLotteryRun] entries", entryError.message);
    }

    // Update those applications to "lottery_assigned" status
    await supabase
      .from("application")
      .update({ status: "lottery_assigned", updated_at: new Date().toISOString() })
      .in("id", appIds)
      .eq("status", "verified");
  }

  return { data: { id: run.id }, error: null };
}

// ─── Run Preview (Deterministic — Seeded & Reproducible) ───────────────────
//
// WHAT CHANGED FROM THE ORIGINAL:
//   The original code used Math.random() and stored a seed that was never
//   actually used to influence the random numbers. Every run was unreproducible.
//
//   This version:
//   1. Generates a seed using crypto.randomUUID() for high-quality randomness
//   2. Stores the seed in the database FIRST — before any results are computed
//   3. Uses runDeterministicLottery() — a pure function that given the same
//      seed always produces the same ranked output (djb2 hash per entry)
//   4. Writes all entry updates in a single batch instead of N individual calls
//
//   To verify any run: take the stored random_seed, the entry IDs, and their
//   priority tiers — call runDeterministicLottery(seed, entries, totalSeats)
//   and the ranked output must be identical to what's stored.

export async function runLotteryPreview(
  runId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verify run exists and is in draft or preview status
  const { data: run, error: fetchError } = await supabase
    .from("lottery_run")
    .select("id, status, total_seats, campus_id")
    .eq("id", runId)
    .single();

  if (fetchError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (!["draft", "preview"].includes(run.status as string)) {
    return { data: null, error: `Cannot run preview — status is ${run.status}.` };
  }

  // Fetch all entries for this run
  const { data: entries, error: entriesError } = await supabase
    .from("lottery_entry")
    .select("id, priority_tier")
    .eq("lottery_run_id", runId);

  if (entriesError || !entries || entries.length === 0) {
    return { data: null, error: "No entries found for this lottery run." };
  }

  // ── Step 1: Generate seed and store it BEFORE computing results ────────────
  // Storing the seed first means: even if the update loop fails partway through,
  // the stored seed can be used to re-run and get identical results.
  const seed = generateLotterySeed();

  const { error: seedError } = await supabase
    .from("lottery_run")
    .update({
      random_seed: seed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (seedError) {
    console.error("[runLotteryPreview] Failed to store seed", seedError.message);
    return { data: null, error: "Failed to initialize lottery run." };
  }

  // ── Step 2: Run the deterministic lottery algorithm ────────────────────────
  const serviceEntries = (entries as Array<{ id: string; priority_tier: number }>).map((e) => ({
    id: e.id,
    priority_tier: e.priority_tier ?? 0,
  }));

  const { ranked } = runDeterministicLottery(seed, serviceEntries, run.total_seats as number);

  // ── Step 3: Batch update all entries in one operation ─────────────────────
  // The original code did N individual .update() calls — one per entry.
  // This replaces them with upsert on the full set.
  const now = new Date().toISOString();
  const entryUpdates = ranked.map((entry) => ({
    id: entry.id,
    lottery_run_id: runId,
    application_id: "", // populated from existing record — upsert key is id
    priority_tier: entry.priority_tier,
    random_number: entry.random_number,
    final_rank: entry.final_rank,
    is_selected: entry.is_selected,
    updated_at: now,
  }));

  // Fetch existing application_id values to complete the upsert payload
  const appIdMap = new Map(
    (entries as Array<{ id: string; application_id?: string }>)
      .map((e) => [e.id, e.application_id ?? ""])
  );

  const upsertRows = entryUpdates.map((row) => ({
    ...row,
    application_id: appIdMap.get(row.id) ?? "",
  }));

  // Re-fetch with application_id to build complete upsert rows
  const { data: fullEntries } = await supabase
    .from("lottery_entry")
    .select("id, application_id, priority_tier")
    .eq("lottery_run_id", runId);

  const fullAppIdMap = new Map(
    (fullEntries ?? []).map((e: Record<string, unknown>) => [
      e.id as string,
      e.application_id as string,
    ])
  );

  const finalUpsertRows = ranked.map((entry) => ({
    id: entry.id,
    lottery_run_id: runId,
    application_id: fullAppIdMap.get(entry.id) ?? "",
    priority_tier: entry.priority_tier,
    random_number: entry.random_number,
    final_rank: entry.final_rank,
    is_selected: entry.is_selected,
    updated_at: now,
  }));

  const { error: upsertError } = await supabase
    .from("lottery_entry")
    .upsert(finalUpsertRows, { onConflict: "id" });

  if (upsertError) {
    console.error("[runLotteryPreview] entry upsert", upsertError.message);
    return { data: null, error: "Failed to save lottery results." };
  }

  // ── Step 4: Update run status to preview ──────────────────────────────────
  const { error: runUpdateError } = await supabase
    .from("lottery_run")
    .update({
      status: "preview",
      total_applicants: entries.length,
      updated_at: now,
    })
    .eq("id", runId);

  if (runUpdateError) {
    return { data: null, error: "Failed to update run status." };
  }

  // ── Step 5: Write audit event ─────────────────────────────────────────────
  await logAuditEvent({
    table_name: "lottery_run",
    record_id: runId,
    action: AuditAction.StatusChange,
    actor_id: user?.id ?? null,
    campus_id: run.campus_id as string,
    old_data: { status: run.status },
    new_data: { status: "preview", random_seed: seed, total_applicants: entries.length },
    metadata: {
      total_entries: entries.length,
      total_seats: run.total_seats,
      selected: ranked.filter((e) => e.is_selected).length,
    },
  });

  return { data: null, error: null };
}

// ─── Simulate (Read-Only What-If) ──────────────────────
//
// Seats fill strictly in tier order, so per-tier outcomes are a function of
// tier counts and seat count alone — the random seed only decides WHICH
// individuals sit at the boundary tier. That means a simulation can be exact
// about tier-level results without running (or writing) anything: staff see
// "tier 1: all 8 seated; tier 2: 12 of 30 seated, 18 waitlisted" before
// committing to a preview or official run.

export interface TierSimulation {
  tier: number;
  label: string;
  entries: number;
  selected: number;
  waitlisted: number;
}

export interface LotterySimulation {
  total_seats: number;
  total_entries: number;
  selected_total: number;
  waitlisted_total: number;
  tiers: TierSimulation[];
}

export async function simulateLotteryRun(
  runId: string,
  seatsOverride?: number
): Promise<MutationResult<LotterySimulation>> {
  const supabase = await createServerClient();

  const { data: run, error: fetchError } = await supabase
    .from("lottery_run")
    .select("id, status, total_seats, campus_id, lottery_rule_set_id")
    .eq("id", runId)
    .single();

  if (fetchError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  const { data: entries, error: entriesError } = await supabase
    .from("lottery_entry")
    .select("priority_tier")
    .eq("lottery_run_id", runId);

  if (entriesError || !entries || entries.length === 0) {
    return { data: null, error: "No entries found for this lottery run." };
  }

  const { tiers } = await resolvePriorityTiers(
    supabase,
    run.campus_id as string,
    (run.lottery_rule_set_id as string | null) ?? undefined
  );
  const labelFor = (tier: number) => tiers[tier]?.label ?? "General pool";

  const totalSeats = seatsOverride ?? (run.total_seats as number);

  // Count entries per tier, then fill seats in tier order.
  const countByTier = new Map<number, number>();
  for (const e of entries) {
    const tier = ((e as Record<string, unknown>).priority_tier as number) ?? 0;
    countByTier.set(tier, (countByTier.get(tier) ?? 0) + 1);
  }

  let seatsLeft = Math.max(0, totalSeats);
  const tierResults: TierSimulation[] = [...countByTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, count]) => {
      const selected = Math.min(seatsLeft, count);
      seatsLeft -= selected;
      return {
        tier,
        label: labelFor(tier),
        entries: count,
        selected,
        waitlisted: count - selected,
      };
    });

  const selectedTotal = tierResults.reduce((sum, t) => sum + t.selected, 0);

  return {
    data: {
      total_seats: totalSeats,
      total_entries: entries.length,
      selected_total: selectedTotal,
      waitlisted_total: entries.length - selectedTotal,
      tiers: tierResults,
    },
    error: null,
  };
}

// ─── Finalize as Official ──────────────────────────────

export async function finalizeLotteryRun(
  runId: string,
  executedBy: string
): Promise<MutationResult> {
  // Service role on purpose: staff-only action (staffFinalizeLottery gates on
  // requireRoleOnCampus for the run's campus). Joins lottery_entry ->
  // application -> student, which trips the same latent RLS recursion
  // (application policy -> guardian policy -> application policy) documented
  // in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  // Verify run is in preview status
  const { data: run, error: fetchError } = await supabase
    .from("lottery_run")
    .select("id, status, total_seats, campus_id")
    .eq("id", runId)
    .single();

  if (fetchError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (run.status !== "preview") {
    return { data: null, error: `Cannot finalize — status is ${run.status}, must be preview.` };
  }

  // Fetch all entries with application data for snapshots
  const { data: entries, error: entriesError } = await supabase
    .from("lottery_entry")
    .select(`
      id, priority_tier, random_number, final_rank, is_selected,
      application:application_id (
        id,
        student:student_id (first_name, last_name),
        grade_level:grade_level_id (grade)
      )
    `)
    .eq("lottery_run_id", runId)
    .order("final_rank", { ascending: true });

  if (entriesError || !entries) {
    return { data: null, error: "Failed to fetch lottery entries." };
  }

  // Create immutable snapshots
  const snapshots = entries.map((entry: Record<string, unknown>) => {
    const app = entry.application as Record<string, unknown> | null;
    const student = app?.student as Record<string, string> | null;
    const grade = app?.grade_level as Record<string, string> | null;

    return {
      lottery_run_id: runId,
      lottery_entry_id: entry.id as string,
      application_id: (app?.id as string) ?? "",
      student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
      grade: grade?.grade ?? "",
      priority_tier: entry.priority_tier as number,
      random_number: entry.random_number as number,
      final_rank: entry.final_rank as number,
      is_selected: entry.is_selected as boolean,
      snapshot_data: {
        entry_id: entry.id,
        application_id: (app?.id as string) ?? "",
      },
    };
  });

  if (snapshots.length > 0) {
    const { error: snapError } = await supabase
      .from("lottery_entry_snapshot")
      .insert(snapshots);

    if (snapError) {
      console.error("[finalizeLotteryRun] snapshots", snapError.message);
      return { data: null, error: "Failed to create lottery snapshots." };
    }
  }

  // Update run status to official
  const now = new Date().toISOString();
  const { error: runUpdateError } = await supabase
    .from("lottery_run")
    .update({
      status: "official",
      executed_by: executedBy,
      executed_at: now,
      finalized_at: now,
      updated_at: now,
    })
    .eq("id", runId);

  if (runUpdateError) {
    return { data: null, error: "Failed to finalize lottery run." };
  }

  // Audit: lottery officially finalized — this is the most sensitive action
  await logAuditEvent({
    table_name: "lottery_run",
    record_id: runId,
    action: AuditAction.StatusChange,
    actor_id: executedBy,
    campus_id: run.campus_id as string ?? null,
    old_data: { status: "preview" },
    new_data: { status: "official", finalized_at: now },
    metadata: {
      total_seats: run.total_seats,
      snapshots_written: snapshots.length,
    },
  });

  return { data: null, error: null };
}

// ─── Archive Lottery Run ───────────────────────────────

export async function archiveLotteryRun(
  runId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("lottery_run")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "official");

  if (error) {
    return { data: null, error: "Failed to archive lottery run." };
  }

  return { data: null, error: null };
}

// ─── Send Offers From Lottery ──────────────────────────

export async function sendOffersFromLottery(
  runId: string,
  expiresAt: string,
  offeredBy: string
): Promise<MutationResult<{ offersCreated: number }>> {
  // Service role on purpose: staff-only action (staffSendLotteryOffers gates
  // on requireRoleOnCampus for the run's campus). Joins lottery_entry ->
  // application -> student and updates `application` directly, which trips
  // the same latent RLS recursion (application policy -> guardian policy ->
  // application policy) documented in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  // Get the run details
  const { data: run, error: runError } = await supabase
    .from("lottery_run")
    .select("id, status, campus_id, grade_level_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (run.status !== "official") {
    return { data: null, error: "Can only send offers from an official lottery run." };
  }

  // Get selected entries (those who won the lottery). The student join gives
  // the winner notification a real name rather than "your student".
  const { data: selectedEntries, error: entriesError } = await supabase
    .from("lottery_entry")
    .select("id, application_id, application:application_id (student:student_id (first_name, last_name))")
    .eq("lottery_run_id", runId)
    .eq("is_selected", true);

  if (entriesError || !selectedEntries || selectedEntries.length === 0) {
    return { data: null, error: "No selected entries found." };
  }

  let offersCreated = 0;
  const now = new Date().toISOString();

  for (const entry of selectedEntries) {
    const entryRow = entry as unknown as Record<string, unknown>;
    const appId = entryRow.application_id as string;
    const entryId = entryRow.id as string;

    // Check if offer already exists for this application
    const { data: existingOffer } = await supabase
      .from("offer")
      .select("id")
      .eq("application_id", appId)
      .in("status", ["pending", "accepted"])
      .limit(1);

    if (existingOffer && existingOffer.length > 0) continue; // Skip if already offered

    // Create offer
    const { data: newOffer, error: offerError } = await supabase
      .from("offer")
      .insert({
        application_id: appId,
        campus_id: run.campus_id,
        grade_level_id: run.grade_level_id,
        lottery_entry_id: entryId,
        status: "pending",
        offered_at: now,
        expires_at: expiresAt,
        offered_by: offeredBy,
      })
      .select("id")
      .single();

    if (offerError || !newOffer) {
      console.error(`[sendOffersFromLottery] offer for ${appId}`, offerError?.message);
      continue;
    }

    // Update application status
    await supabase
      .from("application")
      .update({ status: "offered", updated_at: now })
      .eq("id", appId);

    // Tell the family they won. Without this the seat offer exists only in
    // the staff console — the losing families are notified by
    // completeLotteryResults, so the winners must hear too. Never-throw per
    // offer: a notification failure must not skip the remaining winners or
    // undo the offer that was just written.
    const app = entryRow.application as
      | { student?: { first_name?: string; last_name?: string } | null }
      | null;
    const studentName = app?.student
      ? [app.student.first_name, app.student.last_name].filter(Boolean).join(" ") || undefined
      : undefined;

    await notifyFamilyOfOffer({
      applicationId: appId,
      offerId: newOffer.id as string,
      expiresAt,
      campusId: run.campus_id as string,
      studentName,
    }).catch((err) => console.error(`[sendOffersFromLottery] notify ${appId}`, err));

    offersCreated++;
  }

  return { data: { offersCreated }, error: null };
}

// ─── Complete Lottery Results (Waitlist Non-Selected) ──
//
// Closes the loop finalizeLotteryRun leaves open: everyone NOT selected sits
// at `lottery_assigned` with no waitlist entry and no notification until
// staff run this. Reuses ensureWaitlist/addToWaitlist (lib/mutations/
// waitlist.ts) rather than writing waitlist_position rows directly, so
// waitlist semantics (application status, audit logging) stay in one place.
//
// Idempotent: safe to click twice. Applications that already have an active
// waitlist_position OR a pending/accepted offer are skipped rather than
// double-added or re-notified.

export async function completeLotteryResults(
  runId: string,
  actorId: string
): Promise<MutationResult<{ waitlisted: number }>> {
  const supabase = await createServerClient();

  // The run carries campus_id/grade_level_id directly, but school_year_id
  // lives one hop away on enrollment_window (see supabase/migrations/
  // 00004_applications.sql: enrollment_window.school_year_id).
  const { data: run, error: runError } = await supabase
    .from("lottery_run")
    .select("id, status, campus_id, grade_level_id, enrollment_window_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (run.status !== "official") {
    return { data: null, error: `Cannot complete results — status is ${run.status}, must be official.` };
  }

  const { data: window, error: windowError } = await supabase
    .from("enrollment_window")
    .select("school_year_id")
    .eq("id", run.enrollment_window_id as string)
    .single();

  if (windowError || !window) {
    console.error("[completeLotteryResults] enrollment_window", windowError?.message);
    return { data: null, error: "Enrollment window not found for this lottery run." };
  }

  const waitlistResult = await ensureWaitlist(
    run.campus_id as string,
    run.grade_level_id as string,
    window.school_year_id as string,
    run.enrollment_window_id as string
  );

  if (waitlistResult.error || !waitlistResult.data) {
    return { data: null, error: waitlistResult.error ?? "Failed to resolve waitlist." };
  }

  const waitlistId = waitlistResult.data.id;

  // Non-selected snapshots, in lottery-rank order. The snapshot already
  // carries student_name, so no application/student join is needed here.
  const { data: snapshots, error: snapshotError } = await supabase
    .from("lottery_entry_snapshot")
    .select("application_id, final_rank, student_name")
    .eq("lottery_run_id", runId)
    .eq("is_selected", false)
    .order("final_rank", { ascending: true });

  if (snapshotError) {
    console.error("[completeLotteryResults] snapshots", snapshotError.message);
    return { data: null, error: "Failed to load lottery results." };
  }

  const rows = (snapshots ?? []) as Array<{
    application_id: string;
    final_rank: number;
    student_name: string;
  }>;

  if (rows.length === 0) {
    return { data: { waitlisted: 0 }, error: null };
  }

  const appIds = rows.map((r) => r.application_id);

  // Idempotency check, batched: an application already on an active waitlist
  // or already holding a pending/accepted offer is skipped.
  const [{ data: existingPositions }, { data: existingOffers }] = await Promise.all([
    supabase
      .from("waitlist_position")
      .select("application_id")
      .in("application_id", appIds)
      .is("removed_at", null),
    supabase
      .from("offer")
      .select("application_id")
      .in("application_id", appIds)
      .in("status", ["pending", "accepted"]),
  ]);

  const skip = new Set<string>([
    ...((existingPositions ?? []) as Array<{ application_id: string }>).map((r) => r.application_id),
    ...((existingOffers ?? []) as Array<{ application_id: string }>).map((r) => r.application_id),
  ]);

  let waitlisted = 0;
  // Sequential 1-based position among the families we actually add. This
  // matches both the rest of the waitlist system (positions start at 1, not
  // at seats+1) and what getWaitlistStandings will show the family on their
  // dashboard — so the "#N" in the email never disagrees with the portal.
  // Rows are already sorted by final_rank, so sequential order == lottery order.
  let position = 0;

  for (const row of rows) {
    if (skip.has(row.application_id)) continue;

    position++;
    const added = await addToWaitlist({
      waitlist_id: waitlistId,
      application_id: row.application_id,
      position_number: position,
    });

    if (added.error) {
      console.error("[completeLotteryResults] addToWaitlist", added.error, {
        applicationId: row.application_id,
      });
      position--; // roll back — this family wasn't actually placed
      continue;
    }

    waitlisted++;

    // Guarded so one family's notification failure never aborts the batch.
    try {
      await notifyFamilyApplicationWaitlisted({
        applicationId: row.application_id,
        campusId: run.campus_id as string,
        studentName: row.student_name,
        position,
      });
    } catch (err) {
      console.error("[completeLotteryResults] notify failed", err, {
        applicationId: row.application_id,
      });
    }
  }

  await logAuditEvent({
    table_name: "lottery_run",
    record_id: runId,
    action: AuditAction.Update,
    actor_id: actorId,
    campus_id: run.campus_id as string,
    new_data: { waitlisted },
    metadata: {
      total_non_selected: rows.length,
      waitlisted,
      skipped: rows.length - waitlisted,
    },
  });

  return { data: { waitlisted }, error: null };
}
