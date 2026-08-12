/**
 * Reads for the lottery policy governance layer.
 *
 * Every function here degrades gracefully when supabase/migrations/
 * 00047_lottery_policy.sql has not been applied yet: the table is simply
 * absent, the read returns null or an empty list, and the caller reports "no
 * adopted policy" rather than crashing a lottery page. Absent is reported as
 * absent — never as a default policy, and never as an adopted one.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import {
  parseLotteryPolicyConfig,
  type LotteryPolicyConfig,
} from "@/lib/lottery-policy";

export interface LotteryPolicyRow {
  id: string;
  campus_id: string;
  name: string;
  version: number;
  status: "draft" | "adopted" | "superseded";
  config: unknown;
  adopted_date: string | null;
  adopted_note: string | null;
  created_at: string;
  updated_at: string;
  adopted_by_name?: string | null;
  created_by_name?: string | null;
}

/**
 * True when a PostgREST error is "this relation does not exist" — i.e. the
 * migration has not been applied. Anything else is a real failure and must not
 * be swallowed into a false "no policy" answer.
 */
export function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

export interface AdoptedPolicy {
  row: LotteryPolicyRow;
  config: LotteryPolicyConfig;
  /** Validation problems found in the stored config. Non-empty = unusable. */
  configErrors: string[];
}

/**
 * The one adopted policy governing a campus, or null. A draft is never
 * returned here: a draft has not been adopted by a board and cannot govern an
 * official lottery.
 */
export async function getAdoptedPolicyForCampus(campusId: string): Promise<AdoptedPolicy | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("lottery_policy")
    .select("id, campus_id, name, version, status, config, adopted_date, adopted_note, created_at, updated_at")
    .eq("campus_id", campusId)
    .eq("status", "adopted")
    .order("version", { ascending: false })
    .limit(1);

  if (error) {
    if (isMissingRelation(error)) {
      console.warn(
        "[getAdoptedPolicyForCampus] lottery_policy table not present — migration 00047 has not been applied. Treating this campus as having no adopted policy."
      );
      return null;
    }
    console.error("[getAdoptedPolicyForCampus]", error.message);
    return null;
  }

  const row = (data ?? [])[0] as LotteryPolicyRow | undefined;
  if (!row) return null;

  const { config, errors } = parseLotteryPolicyConfig(row.config);
  if (!config) {
    console.error("[getAdoptedPolicyForCampus] adopted policy config could not be parsed", {
      policyId: row.id,
      errors,
    });
    return null;
  }

  return { row, config, configErrors: errors };
}

/** Every policy version for a campus, newest first. Empty when absent. */
export async function getPolicyVersionsForCampus(campusId: string): Promise<LotteryPolicyRow[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("lottery_policy")
    .select(`
      id, campus_id, name, version, status, config,
      adopted_date, adopted_note, created_at, updated_at,
      adopter:adopted_by (full_name),
      author:created_by (full_name)
    `)
    .eq("campus_id", campusId)
    .order("version", { ascending: false });

  if (error) {
    if (isMissingRelation(error)) {
      console.warn(
        "[getPolicyVersionsForCampus] lottery_policy table not present — migration 00047 has not been applied."
      );
      return [];
    }
    console.error("[getPolicyVersionsForCampus]", error.message);
    return [];
  }

  return (data ?? []).map((raw: Record<string, unknown>) => {
    const adopter = raw.adopter as Record<string, string> | null;
    const author = raw.author as Record<string, string> | null;
    return {
      id: raw.id as string,
      campus_id: raw.campus_id as string,
      name: raw.name as string,
      version: raw.version as number,
      status: raw.status as LotteryPolicyRow["status"],
      config: raw.config,
      adopted_date: (raw.adopted_date as string) ?? null,
      adopted_note: (raw.adopted_note as string) ?? null,
      created_at: raw.created_at as string,
      updated_at: raw.updated_at as string,
      adopted_by_name: adopter?.full_name ?? null,
      created_by_name: author?.full_name ?? null,
    };
  });
}

export interface RunGovernance {
  policyId: string | null;
  policyName: string | null;
  policyVersion: number | null;
  adoptedDate: string | null;
  config: LotteryPolicyConfig | null;
  /** True when the run was created with no adopted policy to bind to. */
  ungoverned: boolean;
  /** Dress-rehearsal run. Never reaches official; stamped on every surface. */
  isRehearsal: boolean;
  /** What the draw actually did — real counts, written by the draw itself. */
  drawSummary: Record<string, unknown> | null;
}

const UNGOVERNED: RunGovernance = {
  policyId: null,
  policyName: null,
  policyVersion: null,
  adoptedDate: null,
  config: null,
  ungoverned: true,
  isRehearsal: false,
  drawSummary: null,
};

/**
 * What governed a specific run — read from the run's own frozen snapshot, not
 * from the live policy row. A policy edited or superseded after the run cannot
 * change how that run reads.
 */
export async function getRunGovernance(runId: string): Promise<RunGovernance> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("lottery_run")
    .select(
      "policy_id, policy_snapshot, is_rehearsal, draw_summary, policy:policy_id (name, version, adopted_date)"
    )
    .eq("id", runId)
    .single();

  if (error || !data) {
    if (error && !isMissingRelation(error)) {
      console.error("[getRunGovernance]", error.message);
    }
    return { ...UNGOVERNED };
  }

  const row = data as Record<string, unknown>;
  const policy = row.policy as Record<string, unknown> | null;
  const snapshot = row.policy_snapshot;
  const isRehearsal = row.is_rehearsal === true;
  const drawSummary = (row.draw_summary as Record<string, unknown> | null) ?? null;

  if (!row.policy_id || !snapshot) {
    return { ...UNGOVERNED, isRehearsal, drawSummary };
  }

  const { config } = parseLotteryPolicyConfig(snapshot);

  return {
    policyId: row.policy_id as string,
    policyName: (policy?.name as string) ?? null,
    policyVersion: (policy?.version as number) ?? null,
    adoptedDate: (policy?.adopted_date as string) ?? null,
    config,
    ungoverned: false,
    isRehearsal,
    drawSummary,
  };
}

export interface RunGovernanceSummary {
  runId: string;
  isRehearsal: boolean;
  policyLabel: string | null;
}

/**
 * Governance labels for a list of runs, in one tolerant query. Returns an
 * empty map when the governance columns are absent, so the lottery list still
 * renders on a database where migration 00047 has not been applied.
 */
export async function getRunGovernanceBatch(
  runIds: string[]
): Promise<Map<string, RunGovernanceSummary>> {
  const result = new Map<string, RunGovernanceSummary>();
  if (runIds.length === 0) return result;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("lottery_run")
    .select("id, is_rehearsal, policy:policy_id (name, version, adopted_date)")
    .in("id", runIds);

  if (error) {
    if (!isMissingRelation(error)) console.error("[getRunGovernanceBatch]", error.message);
    return result;
  }

  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const policy = raw.policy as Record<string, unknown> | null;
    result.set(raw.id as string, {
      runId: raw.id as string,
      isRehearsal: raw.is_rehearsal === true,
      policyLabel: policy?.name
        ? `${policy.name as string} v${policy.version as number}${
            policy.adopted_date ? ` (adopted ${policy.adopted_date as string})` : ""
          }`
        : null,
    });
  }

  return result;
}

export interface RehearsalEntrant {
  studentName: string;
  priorityTier: number;
  randomNumber: number;
  finalRank: number;
  isSelected: boolean;
}

/**
 * Roster for a REHEARSAL report. A rehearsal never reaches 'official', so it
 * never writes lottery_entry_snapshot rows — its report is built from the live
 * lottery_entry rows instead, and is stamped TEST REHEARSAL everywhere.
 *
 * This is a read. It writes nothing, which is the whole point of a rehearsal.
 */
export async function getRehearsalReportEntrants(runId: string): Promise<RehearsalEntrant[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("lottery_entry")
    .select(`
      priority_tier, random_number, final_rank, is_selected,
      application:application_id (student:student_id (first_name, last_name))
    `)
    .eq("lottery_run_id", runId)
    .order("final_rank", { ascending: true });

  if (error) {
    console.error("[getRehearsalReportEntrants]", error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => row.final_rank !== null)
    .map((row) => {
      const app = row.application as Record<string, unknown> | null;
      const student = app?.student as Record<string, string> | null;
      return {
        studentName: student ? `${student.first_name} ${student.last_name}` : "Unknown",
        priorityTier: (row.priority_tier as number) ?? 0,
        randomNumber: (row.random_number as number) ?? 0,
        finalRank: (row.final_rank as number) ?? 0,
        isSelected: (row.is_selected as boolean) ?? false,
      };
    });
}

export interface LotteryNotificationProgress {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  /** True when the ledger table is absent — progress cannot be reported. */
  unavailable: boolean;
}

/**
 * How far the post-commit family notification fan-out got for a run. Drives
 * the "notifications: X of Y sent — Resume" state on the run page.
 */
export async function getLotteryNotificationProgress(
  runId: string
): Promise<LotteryNotificationProgress> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("lottery_notification")
    .select("status")
    .eq("lottery_run_id", runId);

  if (error) {
    if (isMissingRelation(error)) {
      return { total: 0, sent: 0, pending: 0, failed: 0, unavailable: true };
    }
    console.error("[getLotteryNotificationProgress]", error.message);
    return { total: 0, sent: 0, pending: 0, failed: 0, unavailable: true };
  }

  const rows = (data ?? []) as Array<{ status: string }>;
  return {
    total: rows.length,
    sent: rows.filter((r) => r.status === "sent").length,
    pending: rows.filter((r) => r.status === "pending").length,
    failed: rows.filter((r) => r.status === "failed").length,
    unavailable: false,
  };
}
