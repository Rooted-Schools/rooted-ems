/**
 * Read-side helpers for the Automation health card on /staff/settings.
 *
 * Joins the static CRON_JOBS registry (lib/cron-jobs.ts) against the live
 * heartbeat stamps (lib/cron-heartbeat.ts) so staff can see, honestly,
 * whether each scheduled automation actually ran — never a fabricated time
 * and never a green light without evidence.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { CRON_JOBS, type CronJobInfo } from "@/lib/cron-jobs";
import { getCronHeartbeats, type CronRunStamp } from "@/lib/cron-heartbeat";

export type AutomationStatus = "ok" | "overdue" | "failed" | "unknown";

export interface AutomationHealthRow {
  job: CronJobInfo;
  stamp: CronRunStamp | null;
  status: AutomationStatus;
}

/**
 * One row per registered cron job. Status rules:
 *  - unknown: no heartbeat stamp has ever been recorded for this job.
 *  - failed:  the latest stamp recorded a failed run.
 *  - overdue: the latest stamp is older than 2x the job's expected cadence.
 *  - ok:      a recent, non-failed stamp exists.
 */
export async function getAutomationHealth(): Promise<AutomationHealthRow[]> {
  const heartbeats = await getCronHeartbeats();
  const now = Date.now();

  return CRON_JOBS.map((job) => {
    const stamp = heartbeats[job.key] ?? null;
    let status: AutomationStatus;

    if (!stamp) {
      status = "unknown";
    } else if (stamp.failed) {
      status = "failed";
    } else {
      const ageMinutes = (now - new Date(stamp.at).getTime()) / 60_000;
      status = ageMinutes > job.cadenceMinutes * 2 ? "overdue" : "ok";
    }

    return { job, stamp, status };
  });
}

/**
 * Count of active journey enrollments whose next step is more than a day
 * past due — a sign the journey engine (run-journeys cron) has stalled even
 * if its heartbeat looks fine. Returns null (never a fabricated 0) when the
 * count itself can't be verified, so the UI can say "could not check."
 */
export async function getOverdueJourneySteps(): Promise<number | null> {
  try {
    const supabase = createServiceRoleClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from("journey_enrollment")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lt("next_step_at", cutoff);

    if (error) {
      console.error("[getOverdueJourneySteps]", error.message);
      return null;
    }

    return count ?? 0;
  } catch (err) {
    console.error("[getOverdueJourneySteps]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
