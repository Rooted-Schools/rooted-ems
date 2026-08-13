import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { generateLotterySeed, runDeterministicLottery } from "@rooted-ems/utils";
import { AuditAction, logAuditEvent, type AuditEventPayload } from "@/lib/audit";
import {
  anyChannelDelivered,
  notifyFamilyApplicationWaitlisted,
  notifyFamilyOfOffer,
} from "@/lib/notify";
import { ensureWaitlist, addToWaitlist } from "./waitlist";
import type { MutationResult } from "./applications";
import {
  parseLotteryPolicyConfig,
  siblingAbsolutePreference,
  enabledWeightedTiers,
  acceptanceExpiryFrom,
  NO_ADOPTED_POLICY_MESSAGE,
  type LotteryPolicyConfig,
} from "@/lib/lottery-policy";
import { getAdoptedPolicyForCampus, isMissingRelation } from "@/lib/queries/lottery-policy";
import {
  deriveSiblingOfEnrolled,
  deriveLinkedSiblings,
  matchWeightedTiers,
} from "@/lib/lottery-eligibility";
import {
  runPolicyDraw,
  TIER_GENERAL,
  TIER_LINKED_SIBLING,
  TIER_SIBLING_ABSOLUTE,
  type DrawEntry,
} from "@/lib/lottery-draw";

// ─── Types ─────────────────────────────────────────────

export interface CreateLotteryRunInput {
  enrollment_window_id: string;
  campus_id: string;
  grade_level_id: string;
  lottery_rule_set_id?: string;
  total_seats: number;
  notes?: string;
  /**
   * Dress rehearsal. Runs the complete pipeline against the real applicant
   * pool and writes only this run's own records — no application status
   * changes, no offers, no waitlist rows, no family notification of any kind.
   * A rehearsal can never be finalized as official; the database refuses it
   * (lottery_run_rehearsal_never_official, 00047_lottery_policy.sql).
   */
  is_rehearsal?: boolean;
}

// ─── Priority Tiers ────────────────────────────────────
//
// LEGACY PATH. Tiers come from lottery_rule_set.priority_tiers (JSONB, per
// campus). Runs created before the policy governance layer existed, and runs
// at a campus with no adopted policy, still resolve their tiers this way.
//
// Runs bound to an adopted policy do NOT use this: their tier bands come from
// lib/lottery-draw.ts (sibling absolute / linked sibling / general) and their
// weighting comes from the policy's weightedTiers. See resolveRunPolicy below.

interface TierMatcher {
  /** "column" matches a boolean column on application; "answer" matches application_answer. */
  source: "column" | "answer";
  /** Column name (allowlisted) or application_answer.field_key. */
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
 * answer key.
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
 *
 * NOTE on the answer matcher: application_answer's real columns are field_key
 * and value (00004_applications.sql:58-66). Earlier code here queried
 * question_key / answer_value, which do not exist, so the answer branch
 * silently matched nobody. Corrected.
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
          .select("application_id, value")
          .in("application_id", appIds)
          .eq("field_key", matcher.field);
        for (const row of data ?? []) {
          const r = row as Record<string, unknown>;
          const raw = r.value;
          const normalized =
            typeof raw === "boolean"
              ? raw
                ? "true"
                : "false"
              : String(raw ?? "").trim().toLowerCase();
          if (accepted.includes(normalized)) {
            matched.add(r.application_id as string);
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

// ─── Policy binding ────────────────────────────────────
//
// A run binds to its campus's ADOPTED policy at creation and carries a frozen
// copy forever (lottery_run.policy_snapshot, immutable by trigger). Preview,
// official, and every report read the snapshot — never the live policy row —
// so editing or superseding a policy afterward cannot retroactively change how
// a completed lottery reads.

export interface RunPolicyBinding {
  policyId: string | null;
  config: LotteryPolicyConfig | null;
  /** True when the run has no adopted policy behind it. */
  ungoverned: boolean;
  /** True when the governance columns are absent (migration 00047 not applied). */
  legacySchema: boolean;
}

async function resolveRunPolicy(
  supabase: ReturnType<typeof createServiceRoleClient>,
  runId: string
): Promise<RunPolicyBinding> {
  const { data, error } = await supabase
    .from("lottery_run")
    .select("policy_id, policy_snapshot")
    .eq("id", runId)
    .single();

  if (error) {
    if (isMissingRelation(error)) {
      console.warn(
        "[resolveRunPolicy] policy columns not present — migration 00047 has not been applied. Falling back to legacy rule-set behavior."
      );
      return { policyId: null, config: null, ungoverned: true, legacySchema: true };
    }
    console.error("[resolveRunPolicy]", error.message);
    return { policyId: null, config: null, ungoverned: true, legacySchema: false };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (!row.policy_id || !row.policy_snapshot) {
    return { policyId: null, config: null, ungoverned: true, legacySchema: false };
  }

  const { config, errors } = parseLotteryPolicyConfig(row.policy_snapshot);
  if (!config || errors.length > 0) {
    console.error("[resolveRunPolicy] policy snapshot failed validation", {
      runId,
      errors,
    });
    return { policyId: row.policy_id as string, config: null, ungoverned: true, legacySchema: false };
  }

  return {
    policyId: row.policy_id as string,
    config,
    ungoverned: false,
    legacySchema: false,
  };
}

// ─── Create Draft Lottery Run ──────────────────────────

export async function createLotteryRun(
  input: CreateLotteryRunInput
): Promise<MutationResult<{ id: string; governed: boolean; policyWarning: string | null }>> {
  // Service role on purpose: staff-only action (staffCreateLotteryRun gates
  // on requireRoleOnCampus for input.campus_id). Selects/updates `application`
  // directly, which trips the same latent RLS recursion (application policy
  // -> guardian policy -> application policy) documented in
  // lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();
  const isRehearsal = input.is_rehearsal === true;

  // Compute the next run_number for this campus/grade
  const { data: existing } = await supabase
    .from("lottery_run")
    .select("run_number")
    .eq("campus_id", input.campus_id)
    .eq("grade_level_id", input.grade_level_id)
    .order("run_number", { ascending: false })
    .limit(1);

  const nextRunNumber = ((existing?.[0] as Record<string, number> | undefined)?.run_number ?? 0) + 1;

  // Count eligible applicants for this campus + grade + enrollment window.
  // The window is what binds a run to a school year: without it, a 2027-28
  // lottery would draw every still-open 2026-27 applicant into the same pool.
  const { count: applicantCount } = await supabase
    .from("application")
    .select("id", { count: "exact", head: true })
    .eq("campus_id", input.campus_id)
    .eq("grade_level_id", input.grade_level_id)
    .eq("enrollment_window_id", input.enrollment_window_id)
    .in("status", ["verified", "lottery_assigned"]);

  // Resolve the campus's priority tiers before creating the run so the run
  // records which rule set actually governed entry tiers.
  const { ruleSetId, tiers } = await resolvePriorityTiers(
    supabase,
    input.campus_id,
    input.lottery_rule_set_id
  );

  // Bind the adopted policy. A campus with no adopted policy can still create
  // a run — staff need to be able to rehearse and to see the seat math — but
  // the run is flagged, and finalizeLotteryRun refuses to make it official.
  const adopted = await getAdoptedPolicyForCampus(input.campus_id);
  let policyWarning: string | null = null;
  if (!adopted) {
    policyWarning = `${NO_ADOPTED_POLICY_MESSAGE} This run can be previewed and rehearsed, but it cannot be finalized as official.`;
  } else if (adopted.configErrors.length > 0) {
    policyWarning = `The adopted policy for this campus has configuration problems: ${adopted.configErrors.join(" ")}`;
  }

  const baseRow: Record<string, unknown> = {
    enrollment_window_id: input.enrollment_window_id,
    campus_id: input.campus_id,
    grade_level_id: input.grade_level_id,
    lottery_rule_set_id: ruleSetId,
    status: "draft",
    run_number: nextRunNumber,
    total_applicants: applicantCount ?? 0,
    total_seats: input.total_seats,
    notes: input.notes ?? null,
  };

  const governedRow: Record<string, unknown> = {
    ...baseRow,
    is_rehearsal: isRehearsal,
    policy_id: adopted?.row.id ?? null,
    policy_snapshot: adopted ? adopted.row.config : null,
  };

  let { data: run, error } = await supabase
    .from("lottery_run")
    .insert(governedRow)
    .select("id")
    .single();

  // Graceful absence: if migration 00047 has not been applied, the governance
  // columns do not exist. Fall back to the legacy row shape and warn loudly
  // rather than failing the lottery.
  if (error && isMissingRelation(error)) {
    console.warn(
      "[createLotteryRun] governance columns absent — creating an ungoverned legacy run. Apply supabase/migrations/00047_lottery_policy.sql."
    );
    if (isRehearsal) {
      return {
        data: null,
        error:
          "Rehearsal runs need supabase/migrations/00047_lottery_policy.sql applied. Without it the database cannot guarantee a rehearsal stays out of the official record.",
      };
    }
    const retry = await supabase.from("lottery_run").insert(baseRow).select("id").single();
    run = retry.data;
    error = retry.error;
    policyWarning =
      "Lottery policy tables are not present in this database. This run is not governed by an adopted policy and cannot be finalized as official.";
  }

  if (error || !run) {
    console.error("[createLotteryRun]", error?.message);
    return { data: null, error: "Failed to create lottery run." };
  }

  // Auto-populate lottery entries from eligible applications — same
  // campus + grade + enrollment window scope as the count above.
  const { data: eligibleApps } = await supabase
    .from("application")
    .select("id")
    .eq("campus_id", input.campus_id)
    .eq("grade_level_id", input.grade_level_id)
    .eq("enrollment_window_id", input.enrollment_window_id)
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

    // Update those applications to "lottery_assigned" status.
    //
    // REHEARSAL ISOLATION: skipped entirely for a rehearsal. A dress rehearsal
    // writes only its own lottery_run and lottery_entry rows; it must leave
    // every application exactly as it found it.
    if (!isRehearsal) {
      await supabase
        .from("application")
        .update({ status: "lottery_assigned", updated_at: new Date().toISOString() })
        .in("id", appIds)
        .eq("status", "verified");
    }
  }

  return {
    data: { id: run.id, governed: !!adopted, policyWarning },
    error: null,
  };
}

// ─── Building draw entries from the governing policy ───

interface BuiltEntries {
  entries: DrawEntry[];
  summary: Record<string, unknown>;
}

async function buildPolicyDrawEntries(
  supabase: ReturnType<typeof createServiceRoleClient>,
  runId: string,
  campusId: string,
  config: LotteryPolicyConfig,
  rawEntries: Array<{ id: string; application_id: string }>
): Promise<BuiltEntries> {
  const applicationIds = rawEntries.map((e) => e.application_id);

  const preference = siblingAbsolutePreference(config);
  const sibling = await deriveSiblingOfEnrolled(
    supabase,
    applicationIds,
    campusId,
    preference,
    config.linkedSiblingActivation
  );
  const linked = deriveLinkedSiblings(sibling.guardiansByApplication);

  const tiers = enabledWeightedTiers(config);
  const tierMatch = await matchWeightedTiers(supabase, applicationIds, tiers, config.defaultWeight);

  const inRun = new Set(applicationIds);

  const entries: DrawEntry[] = rawEntries.map((raw) => ({
    id: raw.id,
    applicationId: raw.application_id,
    weight: tierMatch.weightByApplication.get(raw.application_id) ?? config.defaultWeight,
    tierKeys: tierMatch.tierKeysByApplication.get(raw.application_id) ?? [],
    siblingOfEnrolled: sibling.qualified.has(raw.application_id),
    linkedSiblingApplicationIds: (linked.get(raw.application_id) ?? []).filter((id) => inRun.has(id)),
  }));

  const summary: Record<string, unknown> = {
    sibling_method: sibling.method,
    sibling_qualified: sibling.qualified.size,
    sibling_claimed_unverified: sibling.claimedUnverified.size,
    sibling_linkage_unresolvable: sibling.linkageUnresolvable,
    linked_sibling_pairs: [...linked.values()].filter((v) => v.length > 0).length,
    tier_counts: tiers.map((tier) => ({
      key: tier.key,
      label: tier.label,
      weight: tier.weight,
      applicants: tierMatch.matchedCountByTier.get(tier.key) ?? 0,
      entries: (tierMatch.matchedCountByTier.get(tier.key) ?? 0) * tier.weight,
      unsourced: tierMatch.unsourcedTierKeys.includes(tier.key),
      source_field: tier.source.field,
    })),
    unsourced_tiers: tierMatch.unsourcedTierKeys,
    default_weight: config.defaultWeight,
  };

  return { entries, summary };
}

// ─── Run Preview (Deterministic — Seeded & Reproducible) ───────────────────
//
// The seed is generated and STORED BEFORE any result is computed, so even a
// crash partway through leaves a seed that reproduces the identical draw.
//
// Two draw paths:
//   - GOVERNED: the run carries a policy snapshot. The full policy pipeline
//     runs — sibling pre-pass, weighted entries, linked-sibling activation
//     (lib/lottery-draw.ts).
//   - LEGACY: no policy snapshot (pre-00047 run, or a campus with no adopted
//     policy). The original tier-ordered draw runs unchanged. Such a run can
//     be previewed but never finalized as official.

export async function runLotteryPreview(runId: string): Promise<
  MutationResult<{ governed: boolean; summary: Record<string, unknown> | null }>
> {
  // Service role: the governed path reads guardian_student, enrollment, and
  // application_answer across households, which trips the same latent RLS
  // recursion documented in lib/queries/recruitment-intel.ts.
  const authClient = await createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const supabase = createServiceRoleClient();

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

  const { data: entries, error: entriesError } = await supabase
    .from("lottery_entry")
    .select("id, application_id, priority_tier")
    .eq("lottery_run_id", runId);

  if (entriesError || !entries || entries.length === 0) {
    return { data: null, error: "No entries found for this lottery run." };
  }

  const rawEntries = (entries as Array<{ id: string; application_id: string; priority_tier: number }>).map(
    (e) => ({ id: e.id, application_id: e.application_id, priority_tier: e.priority_tier ?? 0 })
  );

  // ── Step 1: Generate seed and store it BEFORE computing results ──────────
  const seed = generateLotterySeed();

  const { error: seedError } = await supabase
    .from("lottery_run")
    .update({ random_seed: seed, updated_at: new Date().toISOString() })
    .eq("id", runId);

  if (seedError) {
    console.error("[runLotteryPreview] Failed to store seed", seedError.message);
    return { data: null, error: "Failed to initialize lottery run." };
  }

  // ── Step 2: Draw ─────────────────────────────────────────────────────────
  const binding = await resolveRunPolicy(supabase, runId);

  let upsertRows: Array<Record<string, unknown>>;
  let summary: Record<string, unknown> | null = null;
  const now = new Date().toISOString();

  if (binding.config) {
    const preference = siblingAbsolutePreference(binding.config);
    const built = await buildPolicyDrawEntries(
      supabase,
      runId,
      run.campus_id as string,
      binding.config,
      rawEntries
    );

    const result = runPolicyDraw(seed, built.entries, run.total_seats as number, {
      siblingAutoOffer: preference?.autoOfferBeforeDraw ?? false,
      siblingOverflowPriority: preference?.overflowToPriorityWaitlist ?? false,
      linkedSiblingActivation: binding.config.linkedSiblingActivation,
    });

    summary = {
      ...built.summary,
      governed: true,
      total_seats: result.totalSeats,
      total_applicants: result.totalApplicants,
      weighted_pool_entries: result.totalPoolEntries,
      selected: result.selectedCount,
      sibling_auto_placed: result.siblingAutoPlaced,
      sibling_priority_waitlisted: result.siblingPriorityWaitlisted,
      linked_sibling_activated: result.linkedSiblingActivated,
      drawn_at: now,
    };

    upsertRows = result.ranked.map((entry) => ({
      id: entry.id,
      lottery_run_id: runId,
      application_id: entry.applicationId,
      priority_tier: entry.priority_tier,
      random_number: entry.random_number,
      final_rank: entry.final_rank,
      is_selected: entry.is_selected,
      updated_at: now,
    }));
  } else {
    // Legacy path — unchanged behavior for ungoverned runs.
    const { ranked } = runDeterministicLottery(
      seed,
      rawEntries.map((e) => ({ id: e.id, priority_tier: e.priority_tier })),
      run.total_seats as number
    );
    const appIdByEntry = new Map(rawEntries.map((e) => [e.id, e.application_id]));
    upsertRows = ranked.map((entry) => ({
      id: entry.id,
      lottery_run_id: runId,
      application_id: appIdByEntry.get(entry.id) ?? "",
      priority_tier: entry.priority_tier,
      random_number: entry.random_number,
      final_rank: entry.final_rank,
      is_selected: entry.is_selected,
      updated_at: now,
    }));
    summary = {
      governed: false,
      note: binding.legacySchema
        ? "Lottery policy tables are not present in this database. This draw used the legacy rule-set ordering."
        : `${NO_ADOPTED_POLICY_MESSAGE} This draw used the legacy rule-set ordering and cannot be finalized as official.`,
      total_seats: run.total_seats,
      total_applicants: rawEntries.length,
      drawn_at: now,
    };
  }

  // ── Step 3: Batch update all entries in one operation ────────────────────
  const { error: upsertError } = await supabase
    .from("lottery_entry")
    .upsert(upsertRows, { onConflict: "id" });

  if (upsertError) {
    console.error("[runLotteryPreview] entry upsert", upsertError.message);
    return { data: null, error: "Failed to save lottery results." };
  }

  // ── Step 4: Update run status to preview ────────────────────────────────
  const runUpdate: Record<string, unknown> = {
    status: "preview",
    total_applicants: rawEntries.length,
    updated_at: now,
    draw_summary: summary,
  };

  let { error: runUpdateError } = await supabase
    .from("lottery_run")
    .update(runUpdate)
    .eq("id", runId);

  if (runUpdateError && isMissingRelation(runUpdateError)) {
    delete runUpdate.draw_summary;
    const retry = await supabase.from("lottery_run").update(runUpdate).eq("id", runId);
    runUpdateError = retry.error;
  }

  if (runUpdateError) {
    return { data: null, error: "Failed to update run status." };
  }

  // ── Step 5: Write audit event ───────────────────────────────────────────
  await logAuditEvent({
    table_name: "lottery_run",
    record_id: runId,
    action: AuditAction.StatusChange,
    actor_id: user?.id ?? null,
    campus_id: run.campus_id as string,
    old_data: { status: run.status },
    new_data: { status: "preview", random_seed: seed, total_applicants: rawEntries.length },
    metadata: {
      total_entries: rawEntries.length,
      total_seats: run.total_seats,
      selected: upsertRows.filter((r) => r.is_selected === true).length,
      governed: !!binding.config,
      policy_id: binding.policyId,
    },
  });

  return { data: { governed: !!binding.config, summary }, error: null };
}

// ─── Simulate (Read-Only What-If) ──────────────────────
//
// Seats fill strictly in band order, so per-band outcomes are a function of
// band counts and seat count alone — the random seed only decides WHICH
// individuals sit at the boundary. A simulation can therefore be exact about
// band-level results without running (or writing) anything.
//
// Simulate is NOT a rehearsal. It answers "how do the seats divide up", using
// whatever bands the entries already carry. It does not run the sibling
// pre-pass, does not apply weighting, and does not produce a ranked roster.
// For a full dress rehearsal, create a run with is_rehearsal and preview it.

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
  /** Governing policy label, or null when the run is ungoverned. */
  governed_by: string | null;
}

const GOVERNED_BAND_LABELS: Record<number, string> = {
  [TIER_SIBLING_ABSOLUTE]: "Sibling of a currently enrolled student",
  [TIER_LINKED_SIBLING]: "Sibling pulled in by the linked-sibling rule",
  [TIER_GENERAL]: "General weighted pool",
};

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

  const service = createServiceRoleClient();
  const binding = await resolveRunPolicy(service, runId);

  const { tiers } = await resolvePriorityTiers(
    supabase,
    run.campus_id as string,
    (run.lottery_rule_set_id as string | null) ?? undefined
  );

  const labelFor = (tier: number) => {
    if (binding.config) return GOVERNED_BAND_LABELS[tier] ?? "General weighted pool";
    return tiers[tier]?.label ?? "General pool";
  };

  const totalSeats = seatsOverride ?? (run.total_seats as number);

  // Count entries per band, then fill seats in band order.
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
      governed_by: binding.config ? binding.config.sourceDocument : null,
    },
    error: null,
  };
}

// ─── Finalize as Official ──────────────────────────────
//
// COMMIT ORDER AND WHY IT IS SAFE
//
// The Supabase JS client cannot open a multi-statement transaction, so this
// cannot be one atomic BEGIN/COMMIT. Instead the sequence is ordered so that
// every prefix of it is a consistent state, and every step is idempotent:
//
//   1. SNAPSHOT   — insert lottery_entry_snapshot rows. Guarded by the unique
//                   index idx_lottery_snapshot_unique_entry, and skipped
//                   outright when snapshots already exist for the run. A crash
//                   here leaves the run in `preview` with snapshots present;
//                   retrying finalize detects them and moves on.
//   2. RESULTS    — nothing to write. lottery_entry already holds the ranked
//                   results from preview; they are read into the snapshot in
//                   step 1 and are not mutated here. This is why the order is
//                   safe: the results exist before the snapshot, and the
//                   snapshot exists before the status.
//   3. STATUS     — flip lottery_run to `official`. This is the single
//                   observable commit point: every downstream action (send
//                   offers, waitlist non-selected, the report) requires
//                   status = official, so a crash before this step leaves a
//                   run that is simply still in preview.
//
// NO family notification happens here, and none happens as a side effect of
// the status flip. Notifications are a separate, resumable, ledgered fan-out
// (see sendOffersFromLottery / completeLotteryResults / resumeLotteryNotifications).

export async function finalizeLotteryRun(
  runId: string,
  executedBy: string
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  const { data: run, error: fetchError } = await supabase
    .from("lottery_run")
    .select("id, status, total_seats, campus_id, is_rehearsal")
    .eq("id", runId)
    .single();

  if (fetchError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (run.is_rehearsal === true) {
    return {
      data: null,
      error:
        "This is a test rehearsal and can never become the official record. Create a fresh run to hold the official lottery.",
    };
  }

  if (run.status !== "preview") {
    return { data: null, error: `Cannot finalize — status is ${run.status}, must be preview.` };
  }

  // GOVERNANCE GATE. An official lottery is a legal act taken under rules a
  // board adopted. Without an adopted policy behind the run, there is nothing
  // to take it under.
  const binding = await resolveRunPolicy(supabase, runId);
  if (!binding.config) {
    return { data: null, error: NO_ADOPTED_POLICY_MESSAGE };
  }

  // ── Step 1: SNAPSHOT ─────────────────────────────────────────────────────
  // Idempotent: if a previous finalize attempt crashed after writing
  // snapshots, they are already correct and are not rewritten.
  const { data: existingSnapshots, error: existingError } = await supabase
    .from("lottery_entry_snapshot")
    .select("id")
    .eq("lottery_run_id", runId)
    .limit(1);

  if (existingError) {
    console.error("[finalizeLotteryRun] snapshot check", existingError.message);
    return { data: null, error: "Failed to check existing lottery snapshots." };
  }

  let snapshotsWritten = 0;

  if ((existingSnapshots ?? []).length === 0) {
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
          policy_id: binding.policyId,
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
      snapshotsWritten = snapshots.length;
    }
  }

  // ── Step 3: STATUS (the commit point) ───────────────────────────────────
  //
  // .select("id") is load-bearing: without it a compare-and-set that matched
  // NOTHING returns no error, and finalize reported success on a run it never
  // flipped. Only a returned row proves the run went official, and only then
  // is the audit event true.
  const now = new Date().toISOString();
  const { data: flipped, error: runUpdateError } = await supabase
    .from("lottery_run")
    .update({
      status: "official",
      executed_by: executedBy,
      executed_at: now,
      finalized_at: now,
      updated_at: now,
    })
    .eq("id", runId)
    .eq("status", "preview")
    .select("id");

  if (runUpdateError) {
    console.error("[finalizeLotteryRun] status", runUpdateError.message);
    return { data: null, error: "Failed to finalize lottery run." };
  }

  if (!flipped || flipped.length === 0) {
    return {
      data: null,
      error: "This run is no longer in preview, so it was not finalized. Reload the run to see its current status.",
    };
  }

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
      snapshots_written: snapshotsWritten,
      snapshots_already_present: (existingSnapshots ?? []).length > 0,
      policy_id: binding.policyId,
    },
  });

  return { data: null, error: null };
}

// ─── Archive Lottery Run ───────────────────────────────

export async function archiveLotteryRun(
  runId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Same compare-and-set discipline as finalize: no returned row means nothing
  // was archived, and saying otherwise would be a lie about the record.
  const { data: flipped, error } = await supabase
    .from("lottery_run")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "official")
    .select("id");

  if (error) {
    console.error("[archiveLotteryRun]", error.message);
    return { data: null, error: "Failed to archive lottery run." };
  }

  if (!flipped || flipped.length === 0) {
    return {
      data: null,
      error: "Only an official run can be archived. This run is no longer official.",
    };
  }

  return { data: null, error: null };
}

// ─── Notification ledger ───────────────────────────────
//
// Every family notification a lottery produces gets a ledger row written in
// the same operation that commits the underlying record. The fan-out then
// walks pending rows. Because the ledger is keyed UNIQUE on
// (lottery_run_id, application_id, kind), a resume after a crashed fan-out
// sends exactly the families who were not reached and no one else.

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

interface LedgerRow {
  lottery_run_id: string;
  application_id: string;
  kind: "offer" | "waitlist";
  status: "pending";
  offer_id?: string | null;
  position_number?: number | null;
  student_name?: string | null;
  expires_at?: string | null;
}

/**
 * Write ledger rows. Returns false when the ledger table is absent, which
 * tells the caller to fall back to the legacy inline notification path.
 */
async function writeLedgerRows(supabase: ServiceClient, rows: LedgerRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const { error } = await supabase
    .from("lottery_notification")
    .upsert(rows, { onConflict: "lottery_run_id,application_id,kind", ignoreDuplicates: true });

  if (error) {
    if (isMissingRelation(error)) {
      console.warn(
        "[writeLedgerRows] lottery_notification table absent — falling back to inline notification. Apply supabase/migrations/00047_lottery_policy.sql to make the fan-out resumable."
      );
      return false;
    }
    console.error("[writeLedgerRows]", error.message);
    return false;
  }
  return true;
}

export interface FanOutResult {
  attempted: number;
  sent: number;
  failed: number;
}

/**
 * Send every pending notification for a run, marking each row as it goes.
 * Safe to call repeatedly: a row already marked 'sent' is never revisited.
 */
export async function runNotificationFanOut(
  supabase: ServiceClient,
  runId: string,
  campusId: string
): Promise<FanOutResult> {
  const result: FanOutResult = { attempted: 0, sent: 0, failed: 0 };

  const { data, error } = await supabase
    .from("lottery_notification")
    .select("id, application_id, kind, offer_id, position_number, student_name, expires_at, attempts")
    .eq("lottery_run_id", runId)
    .in("status", ["pending", "failed"]);

  if (error) {
    if (!isMissingRelation(error)) {
      console.error("[runNotificationFanOut]", error.message);
    }
    return result;
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  for (const row of rows) {
    result.attempted++;
    const applicationId = row.application_id as string;
    const attempts = ((row.attempts as number) ?? 0) + 1;

    try {
      // These notify functions never throw, so "no exception" proves nothing.
      // Read what they actually delivered: a guardian with no email address
      // and no portal account reaches zero channels, and marking that family
      // 'sent' is how a lottery result goes undelivered with a green ledger.
      const delivery =
        row.kind === "offer"
          ? await notifyFamilyOfOffer({
              applicationId,
              offerId: (row.offer_id as string) ?? "",
              expiresAt: (row.expires_at as string) ?? "",
              campusId,
              studentName: (row.student_name as string) ?? undefined,
            })
          : await notifyFamilyApplicationWaitlisted({
              applicationId,
              campusId,
              studentName: (row.student_name as string) ?? "your student",
              position: (row.position_number as number) ?? 0,
            });

      if (!anyChannelDelivered(delivery)) {
        const reason = "no email and no account on file";
        console.error("[runNotificationFanOut] nothing delivered", { applicationId, reason });
        await supabase
          .from("lottery_notification")
          .update({
            status: "failed",
            attempts,
            last_error: reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id as string);
        result.failed++;
        continue;
      }

      await supabase
        .from("lottery_notification")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id as string);

      result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[runNotificationFanOut] notify failed", { applicationId, message });
      await supabase
        .from("lottery_notification")
        .update({
          status: "failed",
          attempts,
          last_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id as string);
      result.failed++;
    }
  }

  return result;
}

/**
 * Resume an interrupted fan-out. This is the "Resume" action behind the
 * "notifications: X of Y sent" state on the run page.
 */
export async function resumeLotteryNotifications(
  runId: string,
  actorId: string
): Promise<MutationResult<FanOutResult>> {
  const supabase = createServiceRoleClient();

  const { data: run, error } = await supabase
    .from("lottery_run")
    .select("id, campus_id, status")
    .eq("id", runId)
    .single();

  if (error || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (run.status !== "official") {
    return {
      data: null,
      error: "Only an official run has family notifications to resume.",
    };
  }

  const result = await runNotificationFanOut(supabase, runId, run.campus_id as string);

  await logAuditEvent({
    table_name: "lottery_run",
    record_id: runId,
    action: AuditAction.Update,
    actor_id: actorId,
    campus_id: run.campus_id as string,
    new_data: { notifications_resumed: result.sent },
    metadata: { ...result },
  });

  return { data: result, error: null };
}

// ─── Send Offers From Lottery ──────────────────────────
//
// Two phases, deliberately separated:
//   COMMIT   — create every offer, move every application to `offered`, and
//              write a pending ledger row for each. No family is contacted.
//   FAN-OUT  — walk the ledger and notify. Crash-safe and resumable.
//
// The offer response deadline defaults to the governing policy's acceptance
// window (RSV: 14 days) rather than to a number typed into a dialog.
//
// Every offer created here writes its own audit event, plus one summary event
// for the run. This is the largest batch of consequential writes the product
// makes — the seats a public lottery just awarded — and until these events
// existed the only record of who issued them was offer.offered_by, a mutable
// column on the offer itself. An authorizer asking "who awarded this seat, and
// when" needs an answer that does not live inside the record being questioned.

/**
 * The audit event for an offer issued by a lottery.
 *
 * Deliberately the same field shape sendOffer uses for a hand-issued offer
 * (lib/mutations/offers.ts), so both kinds read identically in the Audit Trail
 * UI: an offer that came out of a lottery must not be harder to trace than one
 * a staff member typed. The lottery linkage rides in metadata, exactly as
 * sendOffer already carries lottery_entry_id there.
 *
 * Pure — it only shapes the payload, so the shape can be tested against
 * sendOffer's without standing up a database.
 */
export function buildLotteryOfferAuditEvent(input: {
  offerId: string;
  applicationId: string;
  campusId: string | null;
  /** The staff user who ran the send. Never null on this path. */
  offeredBy: string;
  expiresAt: string;
  /** The application's status before it was moved to `offered`, when known. */
  fromStatus: string | null;
  lotteryEntryId: string | null;
  runId: string;
}): AuditEventPayload {
  return {
    table_name: "offer",
    record_id: input.offerId,
    action: AuditAction.Create,
    actor_id: input.offeredBy,
    campus_id: input.campusId,
    new_data: {
      application_id: input.applicationId,
      status: "pending",
      expires_at: input.expiresAt,
    },
    metadata: {
      from_status: input.fromStatus,
      lottery_entry_id: input.lotteryEntryId,
      lottery_run_id: input.runId,
      issued_by: "lottery",
    },
  };
}

export async function sendOffersFromLottery(
  runId: string,
  expiresAt: string | null,
  offeredBy: string
): Promise<MutationResult<{ offersCreated: number; notifications: FanOutResult }>> {
  const supabase = createServiceRoleClient();

  const { data: run, error: runError } = await supabase
    .from("lottery_run")
    .select("id, status, campus_id, grade_level_id, is_rehearsal")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (run.is_rehearsal === true) {
    return {
      data: null,
      error: "This is a test rehearsal. Rehearsals never send offers to families.",
    };
  }

  if (run.status !== "official") {
    return { data: null, error: "Can only send offers from an official lottery run." };
  }

  // Policy-driven deadline. An explicit expiresAt from the caller still wins,
  // so staff can shorten or extend a window with their eyes open.
  const binding = await resolveRunPolicy(supabase, runId);
  let resolvedExpiresAt = expiresAt;
  if (!resolvedExpiresAt) {
    if (!binding.config) {
      return {
        data: null,
        error:
          "No response deadline was given and this run has no governing policy to take one from. Choose a deadline explicitly.",
      };
    }
    resolvedExpiresAt = acceptanceExpiryFrom(binding.config);
  }

  const { data: selectedEntries, error: entriesError } = await supabase
    .from("lottery_entry")
    .select(
      "id, application_id, application:application_id (status, student:student_id (first_name, last_name))"
    )
    .eq("lottery_run_id", runId)
    .eq("is_selected", true);

  if (entriesError || !selectedEntries || selectedEntries.length === 0) {
    return { data: null, error: "No selected entries found." };
  }

  let offersCreated = 0;
  let alreadyOffered = 0;
  let offerFailures = 0;
  const now = new Date().toISOString();
  const ledgerRows: LedgerRow[] = [];
  const legacyNotifications: Array<{ applicationId: string; offerId: string; studentName?: string }> = [];

  for (const entry of selectedEntries) {
    const entryRow = entry as unknown as Record<string, unknown>;
    const appId = entryRow.application_id as string;
    const entryId = entryRow.id as string;

    const app = entryRow.application as
      | { status?: string | null; student?: { first_name?: string; last_name?: string } | null }
      | null;
    const studentName = app?.student
      ? [app.student.first_name, app.student.last_name].filter(Boolean).join(" ") || undefined
      : undefined;
    // Read before the update below moves it, so the audit event can say what
    // the application actually was when the seat was offered.
    const fromStatus = app?.status ?? null;

    const { data: existingOffer } = await supabase
      .from("offer")
      .select("id")
      .eq("application_id", appId)
      .in("status", ["pending", "accepted"])
      .limit(1);

    if (existingOffer && existingOffer.length > 0) {
      // Already offered. Still ensure a ledger row exists so a family whose
      // offer was created but whose notification never went out is reachable
      // by Resume rather than silently skipped forever.
      ledgerRows.push({
        lottery_run_id: runId,
        application_id: appId,
        kind: "offer",
        status: "pending",
        offer_id: (existingOffer[0] as Record<string, string>).id,
        student_name: studentName ?? null,
        expires_at: resolvedExpiresAt,
      });
      alreadyOffered++;
      continue;
    }

    const { data: newOffer, error: offerError } = await supabase
      .from("offer")
      .insert({
        application_id: appId,
        campus_id: run.campus_id,
        grade_level_id: run.grade_level_id,
        lottery_entry_id: entryId,
        status: "pending",
        offered_at: now,
        expires_at: resolvedExpiresAt,
        offered_by: offeredBy,
      })
      .select("id")
      .single();

    if (offerError || !newOffer) {
      console.error(`[sendOffersFromLottery] offer for ${appId}`, offerError?.message);
      offerFailures++;
      continue;
    }

    // Only move an application that is still in a pre-offer state. Without the
    // precondition this overwrote whatever the application had become since
    // the draw — an accepted seat, a withdrawal — and stamped it "offered".
    const { data: statusMoved, error: statusError } = await supabase
      .from("application")
      .update({ status: "offered", updated_at: now })
      .eq("id", appId)
      .in("status", ["lottery_assigned", "verified", "waitlisted"])
      .select("id");

    if (statusError) {
      console.error(`[sendOffersFromLottery] status for ${appId}`, statusError.message);
    } else if (!statusMoved || statusMoved.length === 0) {
      console.warn(
        "[sendOffersFromLottery] application was not in a pre-offer status, leaving it as it is",
        { applicationId: appId, offerId: newOffer.id }
      );
    }

    // Attributable trail for THIS seat, written in the commit phase alongside
    // the offer it describes — not after the fan-out, where a notification
    // failure could cost us the record of an offer that was really made.
    await logAuditEvent(
      buildLotteryOfferAuditEvent({
        offerId: newOffer.id as string,
        applicationId: appId,
        campusId: (run.campus_id as string) ?? null,
        offeredBy,
        expiresAt: resolvedExpiresAt,
        fromStatus,
        lotteryEntryId: entryId,
        runId,
      })
    );

    ledgerRows.push({
      lottery_run_id: runId,
      application_id: appId,
      kind: "offer",
      status: "pending",
      offer_id: newOffer.id as string,
      student_name: studentName ?? null,
      expires_at: resolvedExpiresAt,
    });
    legacyNotifications.push({
      applicationId: appId,
      offerId: newOffer.id as string,
      studentName,
    });

    offersCreated++;
  }

  // ── Fan-out, only after every offer is committed ─────────────────────────
  const ledgered = await writeLedgerRows(supabase, ledgerRows);

  let notifications: FanOutResult = { attempted: 0, sent: 0, failed: 0 };

  if (ledgered) {
    notifications = await runNotificationFanOut(supabase, runId, run.campus_id as string);
  } else {
    // Legacy fallback: no ledger table, so notify inline and never throw per
    // family. Not resumable — the warning above says so.
    for (const item of legacyNotifications) {
      notifications.attempted++;
      try {
        const delivery = await notifyFamilyOfOffer({
          applicationId: item.applicationId,
          offerId: item.offerId,
          expiresAt: resolvedExpiresAt,
          campusId: run.campus_id as string,
          studentName: item.studentName,
        });
        if (anyChannelDelivered(delivery)) {
          notifications.sent++;
        } else {
          notifications.failed++;
          console.error("[sendOffersFromLottery] nothing delivered", {
            applicationId: item.applicationId,
            reason: "no email and no account on file",
          });
        }
      } catch (err) {
        notifications.failed++;
        console.error(`[sendOffersFromLottery] notify ${item.applicationId}`, err);
      }
    }
  }

  // One event for the run itself, so the batch is legible as a batch: an
  // authorizer reading the trail sees "this person released 42 seats from this
  // run on this date", not only 42 individual offers.
  await logAuditEvent({
    table_name: "lottery_run",
    record_id: runId,
    action: AuditAction.Update,
    actor_id: offeredBy,
    campus_id: (run.campus_id as string) ?? null,
    new_data: { offers_created: offersCreated, expires_at: resolvedExpiresAt },
    metadata: {
      selected_entries: selectedEntries.length,
      offers_created: offersCreated,
      already_offered: alreadyOffered,
      offer_failures: offerFailures,
      policy_id: binding.policyId,
      ledgered,
      notifications_sent: notifications.sent,
      notifications_failed: notifications.failed,
    },
  });

  return { data: { offersCreated, notifications }, error: null };
}

// ─── Complete Lottery Results (Waitlist Non-Selected) ──
//
// Closes the loop finalizeLotteryRun leaves open: everyone NOT selected sits
// at `lottery_assigned` with no waitlist entry and no notification until
// staff run this. Same two-phase shape as sendOffersFromLottery — every
// waitlist position is committed first, then the ledgered fan-out runs.
//
// Idempotent: safe to click twice. Applications that already have an active
// waitlist_position OR a pending/accepted offer are skipped.

export async function completeLotteryResults(
  runId: string,
  actorId: string
): Promise<MutationResult<{ waitlisted: number; notifications: FanOutResult }>> {
  const supabase = createServiceRoleClient();

  const { data: run, error: runError } = await supabase
    .from("lottery_run")
    .select("id, status, campus_id, grade_level_id, enrollment_window_id, is_rehearsal")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return { data: null, error: "Lottery run not found." };
  }

  if (run.is_rehearsal === true) {
    return {
      data: null,
      error: "This is a test rehearsal. Rehearsals never place families on a waitlist.",
    };
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
    return { data: { waitlisted: 0, notifications: { attempted: 0, sent: 0, failed: 0 } }, error: null };
  }

  const appIds = rows.map((r) => r.application_id);

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

  // Positions continue from the highest already on this waitlist. Restarting
  // at 1 on a second pass (a re-run, a later grade batch) gave two families
  // the same "you are #1" and made the ordering a lie.
  const { data: highest, error: highestError } = await supabase
    .from("waitlist_position")
    .select("position_number")
    .eq("waitlist_id", waitlistId)
    .order("position_number", { ascending: false })
    .limit(1);

  if (highestError) {
    console.error("[completeLotteryResults] highest position", highestError.message);
    return { data: null, error: "Failed to read the existing waitlist order." };
  }

  let position =
    ((highest ?? [])[0] as { position_number?: number } | undefined)?.position_number ?? 0;
  const ledgerRows: LedgerRow[] = [];

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
    ledgerRows.push({
      lottery_run_id: runId,
      application_id: row.application_id,
      kind: "waitlist",
      status: "pending",
      position_number: position,
      student_name: row.student_name,
    });
  }

  // ── Fan-out, only after every position is committed ──────────────────────
  const ledgered = await writeLedgerRows(supabase, ledgerRows);

  let notifications: FanOutResult = { attempted: 0, sent: 0, failed: 0 };

  if (ledgered) {
    notifications = await runNotificationFanOut(supabase, runId, run.campus_id as string);
  } else {
    for (const item of ledgerRows) {
      notifications.attempted++;
      try {
        const delivery = await notifyFamilyApplicationWaitlisted({
          applicationId: item.application_id,
          campusId: run.campus_id as string,
          studentName: item.student_name ?? "your student",
          position: item.position_number ?? 0,
        });
        if (anyChannelDelivered(delivery)) {
          notifications.sent++;
        } else {
          notifications.failed++;
          console.error("[completeLotteryResults] nothing delivered", {
            applicationId: item.application_id,
            reason: "no email and no account on file",
          });
        }
      } catch (err) {
        notifications.failed++;
        console.error("[completeLotteryResults] notify failed", err, {
          applicationId: item.application_id,
        });
      }
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
      notifications_sent: notifications.sent,
      notifications_failed: notifications.failed,
    },
  });

  return { data: { waitlisted, notifications }, error: null };
}
