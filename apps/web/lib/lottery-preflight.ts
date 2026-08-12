/**
 * Preflight readiness for a lottery run — fact gathering.
 *
 * The lottery is the one thing in this system that cannot be re-done. A
 * failure is not an outage, it is a family who was told the wrong thing about
 * their child's school year. So before a run can be finalized as official,
 * every condition it depends on is checked against live data and reported in
 * one honest sentence each.
 *
 * The split is deliberate: this file does the IO, lib/lottery-preflight-rules.ts
 * holds the pure decision logic over the facts it gathers.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { isEmailConfigured } from "@/lib/email";
import { isSmsConfigured } from "@/lib/sms";
import { getCronHeartbeats } from "@/lib/cron-heartbeat";
import { CRON_JOBS } from "@/lib/cron-jobs";
import { getDuplicateSuspects } from "@/lib/queries/staff";
import { getAdoptedPolicyForCampus, isMissingRelation } from "@/lib/queries/lottery-policy";
import { unsourcedWeightedTiers, siblingAbsolutePreference } from "@/lib/lottery-policy";
import { deriveSiblingOfEnrolled } from "@/lib/lottery-eligibility";
import {
  evaluatePreflight,
  preflightBlocks,
  preflightBlockingReasons,
  type PreflightFacts,
  type PreflightCheck,
} from "@/lib/lottery-preflight-rules";

export {
  evaluatePreflight,
  preflightBlocks,
  preflightBlockingReasons,
} from "@/lib/lottery-preflight-rules";
export type {
  PreflightStatus,
  PreflightCheck,
  PreflightFacts,
} from "@/lib/lottery-preflight-rules";

// ─── Fact gathering (IO) ───────────────────────────────────────────────────

const ELIGIBLE_ENTRY_STATUSES = ["verified", "lottery_assigned", "offered", "waitlisted"];

export async function gatherPreflightFacts(runId: string): Promise<PreflightFacts | null> {
  const supabase = createServiceRoleClient();

  const { data: run, error: runError } = await supabase
    .from("lottery_run")
    .select(
      "id, status, campus_id, grade_level_id, enrollment_window_id, total_seats, is_rehearsal, policy_snapshot"
    )
    .eq("id", runId)
    .single();

  if (runError || !run) {
    console.error("[gatherPreflightFacts] run", runError?.message);
    return null;
  }

  const campusId = run.campus_id as string;

  // Policy
  const adopted = await getAdoptedPolicyForCampus(campusId);
  let policySchemaMissing = false;
  {
    const probe = await supabase.from("lottery_policy").select("id").limit(1);
    if (probe.error && isMissingRelation(probe.error)) policySchemaMissing = true;
  }

  // Capacity plan for this campus/grade/school year
  let capacitySeats: number | null = null;
  const { data: window } = await supabase
    .from("enrollment_window")
    .select("school_year_id")
    .eq("id", run.enrollment_window_id as string)
    .single();

  if (window?.school_year_id) {
    const { data: plan } = await supabase
      .from("capacity_plan")
      .select("total_seats")
      .eq("campus_id", campusId)
      .eq("grade_level_id", run.grade_level_id as string)
      .eq("school_year_id", window.school_year_id as string)
      .limit(1);
    const row = (plan ?? [])[0] as { total_seats?: number } | undefined;
    if (row && typeof row.total_seats === "number") capacitySeats = row.total_seats;
  }

  // Entries and their application statuses
  const { data: entries } = await supabase
    .from("lottery_entry")
    .select("id, application_id, application:application_id (status)")
    .eq("lottery_run_id", runId);

  const entryRows = (entries ?? []) as Array<Record<string, unknown>>;
  const ineligibleEntryCount = entryRows.filter((e) => {
    const app = e.application as Record<string, unknown> | null;
    const status = app?.status as string | undefined;
    return !status || !ELIGIBLE_ENTRY_STATUSES.includes(status);
  }).length;

  // Sibling linkage — run the same derivation the draw uses, so the panel
  // reports what the draw would actually find rather than a proxy for it.
  const applicationIds = entryRows.map((e) => e.application_id as string);
  const preference = adopted ? siblingAbsolutePreference(adopted.config) : null;
  const sibling = await deriveSiblingOfEnrolled(supabase, applicationIds, campusId, preference);

  // Duplicates
  let duplicateSuspectCount: number | null = null;
  try {
    const suspects = await getDuplicateSuspects([campusId]);
    duplicateSuspectCount = suspects.length;
  } catch (err) {
    console.error("[gatherPreflightFacts] duplicates", err);
  }

  // Automation heartbeat
  const heartbeats = await getCronHeartbeats();
  const stamp = heartbeats["expire-offers"] ?? null;
  const cadence = CRON_JOBS.find((j) => j.key === "expire-offers")?.cadenceMinutes ?? 24 * 60;

  return {
    isRehearsal: run.is_rehearsal === true,
    runStatus: run.status as string,

    policyConfig: adopted?.config ?? null,
    policyLabel: adopted ? `${adopted.row.name} v${adopted.row.version}` : null,
    policyConfigErrors: adopted?.configErrors ?? [],
    policySchemaMissing,

    capacitySeats,
    runSeats: (run.total_seats as number) ?? 0,

    entryCount: entryRows.length,
    ineligibleEntryCount,

    siblingPreferenceEnabled: !!preference?.enabled,
    siblingLinkageUnresolvable: sibling.linkageUnresolvable,
    siblingQualifiedCount: sibling.qualified.size,
    siblingClaimedUnverifiedCount: sibling.claimedUnverified.size,

    duplicateSuspectCount,

    emailConfigured: isEmailConfigured(),
    smsConfigured: isSmsConfigured(),

    offerExpiryHeartbeatAgeMinutes: stamp
      ? (Date.now() - new Date(stamp.at).getTime()) / 60_000
      : null,
    offerExpiryHeartbeatFailed: stamp?.failed === true,
    offerExpiryCadenceMinutes: cadence,

    unsourcedTierLabels: adopted ? unsourcedWeightedTiers(adopted.config).map((t) => t.label) : [],
  };
}

export interface PreflightReport {
  checks: PreflightCheck[];
  blocked: boolean;
  reasons: string[];
}

export async function getPreflightReport(runId: string): Promise<PreflightReport | null> {
  const facts = await gatherPreflightFacts(runId);
  if (!facts) return null;
  const checks = evaluatePreflight(facts);
  return {
    checks,
    blocked: preflightBlocks(checks),
    reasons: preflightBlockingReasons(checks),
  };
}
