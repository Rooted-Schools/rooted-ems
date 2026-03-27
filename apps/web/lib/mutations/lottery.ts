import { createServerClient } from "@rooted-ems/database/server";
import { generateLotterySeed, runDeterministicLottery } from "@rooted-ems/utils";
import { AuditAction, logAuditEvent } from "@/lib/audit";
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

// ─── Create Draft Lottery Run ──────────────────────────

export async function createLotteryRun(
  input: CreateLotteryRunInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

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

  const { data: run, error } = await supabase
    .from("lottery_run")
    .insert({
      enrollment_window_id: input.enrollment_window_id,
      campus_id: input.campus_id,
      grade_level_id: input.grade_level_id,
      lottery_rule_set_id: input.lottery_rule_set_id ?? null,
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
    const entries = eligibleApps.map((app: Record<string, string>) => ({
      lottery_run_id: run.id,
      application_id: app.id,
      priority_tier: 0, // Default tier, can be updated later
    }));

    const { error: entryError } = await supabase
      .from("lottery_entry")
      .insert(entries);

    if (entryError) {
      console.error("[createLotteryRun] entries", entryError.message);
    }

    // Update those applications to "lottery_assigned" status
    const appIds = eligibleApps.map((a: Record<string, string>) => a.id);
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

// ─── Finalize as Official ──────────────────────────────

export async function finalizeLotteryRun(
  runId: string,
  executedBy: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Verify run is in preview status
  const { data: run, error: fetchError } = await supabase
    .from("lottery_run")
    .select("id, status, total_seats")
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
  const supabase = await createServerClient();

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

  // Get selected entries (those who won the lottery)
  const { data: selectedEntries, error: entriesError } = await supabase
    .from("lottery_entry")
    .select("id, application_id")
    .eq("lottery_run_id", runId)
    .eq("is_selected", true);

  if (entriesError || !selectedEntries || selectedEntries.length === 0) {
    return { data: null, error: "No selected entries found." };
  }

  let offersCreated = 0;
  const now = new Date().toISOString();

  for (const entry of selectedEntries) {
    const appId = (entry as Record<string, string>).application_id;
    const entryId = (entry as Record<string, string>).id;

    // Check if offer already exists for this application
    const { data: existingOffer } = await supabase
      .from("offer")
      .select("id")
      .eq("application_id", appId)
      .in("status", ["pending", "accepted"])
      .limit(1);

    if (existingOffer && existingOffer.length > 0) continue; // Skip if already offered

    // Create offer
    const { error: offerError } = await supabase
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
      });

    if (offerError) {
      console.error(`[sendOffersFromLottery] offer for ${appId}`, offerError.message);
      continue;
    }

    // Update application status
    await supabase
      .from("application")
      .update({ status: "offered", updated_at: now })
      .eq("id", appId);

    offersCreated++;
  }

  return { data: { offersCreated }, error: null };
}
