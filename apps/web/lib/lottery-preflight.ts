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
import {
  enabledWeightedTiers,
  parseLotteryPolicyConfig,
  siblingAbsolutePreference,
  unsourcedWeightedTiers,
} from "@/lib/lottery-policy";
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
      "id, status, campus_id, grade_level_id, enrollment_window_id, total_seats, is_rehearsal, policy_snapshot, policy:policy_id (name, version)"
    )
    .eq("id", runId)
    .single();

  if (runError || !run) {
    console.error("[gatherPreflightFacts] run", runError?.message);
    return null;
  }

  const campusId = run.campus_id as string;

  // Policy.
  //
  // A run is governed by the snapshot frozen onto it at creation, never by
  // whatever the live policy row says today. Validating the live policy meant
  // a run could be blocked over a rule it was not drawn under, or cleared on
  // one it was. The live adopted policy is still read, but only to answer
  // "does this campus have one at all".
  const adopted = await getAdoptedPolicyForCampus(campusId);
  const snapshotParse = run.policy_snapshot ? parseLotteryPolicyConfig(run.policy_snapshot) : null;

  const policyConfig = snapshotParse ? snapshotParse.config : (adopted?.config ?? null);
  const policyConfigErrors = snapshotParse ? snapshotParse.errors : (adopted?.configErrors ?? []);

  const runPolicy = run.policy as unknown as { name?: string; version?: number } | null;
  const policyLabel = runPolicy?.name
    ? `${runPolicy.name} v${runPolicy.version}`
    : adopted
      ? `${adopted.row.name} v${adopted.row.version}`
      : null;

  let policySchemaMissing = false;
  {
    const probe = await supabase.from("lottery_policy").select("id").limit(1);
    if (probe.error && isMissingRelation(probe.error)) policySchemaMissing = true;
  }

  // Capacity plan for this campus/grade/school year, plus what is already
  // spoken for. The run is judged against seats that are still open.
  let capacitySeats: number | null = null;
  let seatsAccepted: number | null = null;
  const { data: window } = await supabase
    .from("enrollment_window")
    .select("school_year_id")
    .eq("id", run.enrollment_window_id as string)
    .single();

  if (window?.school_year_id) {
    const { data: plan } = await supabase
      .from("capacity_plan")
      .select("total_seats, seats_accepted")
      .eq("campus_id", campusId)
      .eq("grade_level_id", run.grade_level_id as string)
      .eq("school_year_id", window.school_year_id as string)
      .limit(1);
    const row = (plan ?? [])[0] as
      | { total_seats?: number; seats_accepted?: number }
      | undefined;
    if (row && typeof row.total_seats === "number") capacitySeats = row.total_seats;
    if (row && typeof row.seats_accepted === "number") seatsAccepted = row.seats_accepted;
  }

  // Offers still awaiting a family's answer hold a seat as surely as an
  // accepted one does. Null when it cannot be counted — the rules then fall
  // back to the softer total-capacity comparison rather than blocking on a
  // number nobody could verify.
  let pendingOfferCount: number | null = null;
  {
    const { count, error: offerError } = await supabase
      .from("offer")
      .select("id, application:application_id!inner(enrollment_window_id)", {
        count: "exact",
        head: true,
      })
      .eq("campus_id", campusId)
      .eq("grade_level_id", run.grade_level_id as string)
      .eq("status", "pending")
      .eq("application.enrollment_window_id", run.enrollment_window_id as string);
    if (offerError) {
      console.error("[gatherPreflightFacts] pending offers", offerError.message);
    } else {
      pendingOfferCount = count ?? 0;
    }
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
  const preference = policyConfig ? siblingAbsolutePreference(policyConfig) : null;
  const sibling = await deriveSiblingOfEnrolled(
    supabase,
    applicationIds,
    campusId,
    preference,
    policyConfig?.linkedSiblingActivation ?? false
  );

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

  // Weighted tier sources — which tiers read nothing, and which read something
  // the older applications in this run never answered.
  const unsourced = policyConfig ? unsourcedWeightedTiers(policyConfig) : [];
  const unsourcedKeys = new Set(unsourced.map((t) => t.key));
  const tiersMissingAnswers: Array<{
    label: string;
    fieldKey: string;
    applicationsMissing: number;
  }> = [];

  if (policyConfig && applicationIds.length > 0) {
    for (const tier of enabledWeightedTiers(policyConfig)) {
      if (unsourcedKeys.has(tier.key)) continue;
      if (tier.source.kind !== "application_answer") continue;
      const { data: answered, error: answerError } = await supabase
        .from("application_answer")
        .select("application_id")
        .in("application_id", applicationIds)
        .eq("field_key", tier.source.field);
      if (answerError) {
        console.error("[gatherPreflightFacts] tier answers", answerError.message);
        continue;
      }
      const seen = new Set(
        ((answered ?? []) as Array<{ application_id: string }>).map((r) => r.application_id)
      );
      const missing = applicationIds.filter((id) => !seen.has(id)).length;
      if (missing > 0) {
        tiersMissingAnswers.push({
          label: tier.label,
          fieldKey: tier.source.field,
          applicationsMissing: missing,
        });
      }
    }
  }

  return {
    isRehearsal: run.is_rehearsal === true,
    runStatus: run.status as string,

    policyConfig,
    policyLabel,
    policyConfigErrors,
    policySchemaMissing,

    capacitySeats,
    seatsAccepted,
    pendingOfferCount,
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

    unsourcedTierLabels: unsourced.map((t) => t.label),
    unsourcedTierFields: unsourced.map((t) => ({
      label: t.label,
      fieldKey: t.source.field || "(no field declared)",
    })),
    tiersMissingAnswers,
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
