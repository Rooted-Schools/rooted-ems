/**
 * Cron heartbeat: every scheduled automation records that it ran, and what it
 * did, into the existing `setting` table (key `cron:last_run:<job>`, campus
 * null). The Automation health card on /staff/settings reads these stamps so
 * staff can tell a healthy-but-patient automation from a dead one — the
 * difference is invisible otherwise.
 *
 * No migration: reuses `setting` (JSONB value). One deliberate workaround:
 * `setting` has UNIQUE (campus_id, key) but Postgres treats NULL campus_id
 * rows as distinct, so upsert-on-conflict can't dedupe them. We update first
 * and insert only when nothing matched. Crons don't run concurrently with
 * themselves, so the tiny race window is acceptable.
 *
 * Rule: never throw. A heartbeat failure must never break the cron run it
 * is reporting on (same rule as lib/notify.ts).
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";

export interface CronRunStamp {
  /** ISO timestamp of the completed run. */
  at: string;
  /** True when the run finished with an error after auth (partial/no work). */
  failed?: boolean;
  /** Small map of honest counters from the run, e.g. { sent: 4, completed: 1 }. */
  summary?: Record<string, number>;
}

const KEY_PREFIX = "cron:last_run:";

/**
 * Record a completed cron run. Call as the last step of every cron route —
 * on success with the run's real counters, and in catch/error paths with
 * failed: true so a crashing job still leaves a trace.
 */
export async function recordCronRun(
  jobKey: string,
  summary?: Record<string, number>,
  failed?: boolean
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const key = `${KEY_PREFIX}${jobKey}`;
    const value: CronRunStamp = { at: new Date().toISOString() };
    if (failed) value.failed = true;
    if (summary && Object.keys(summary).length > 0) value.summary = summary;

    const { data: updated, error: updateError } = await supabase
      .from("setting")
      .update({ value })
      .eq("key", key)
      .is("campus_id", null)
      .select("id");

    if (updateError) {
      console.error("[recordCronRun] update", jobKey, updateError.message);
      return;
    }
    if ((updated ?? []).length === 0) {
      const { error: insertError } = await supabase
        .from("setting")
        .insert({ key, campus_id: null, value });
      if (insertError) {
        console.error("[recordCronRun] insert", jobKey, insertError.message);
      }
    }
  } catch (err) {
    console.error("[recordCronRun]", jobKey, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Read every heartbeat stamp at once, keyed by job key. Jobs that have never
 * stamped are simply absent — the health card renders that honestly as
 * "no runs recorded yet", never as a fabricated time.
 */
export async function getCronHeartbeats(): Promise<Record<string, CronRunStamp>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("setting")
      .select("key, value, updated_at")
      .like("key", `${KEY_PREFIX}%`)
      .is("campus_id", null);

    if (error) {
      console.error("[getCronHeartbeats]", error.message);
      return {};
    }

    const stamps: Record<string, CronRunStamp> = {};
    for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
      const jobKey = row.key.slice(KEY_PREFIX.length);
      const value = row.value as CronRunStamp | null;
      if (!value?.at) continue;
      // If duplicate null-campus rows ever exist, keep the newest stamp.
      const existing = stamps[jobKey];
      if (!existing || new Date(value.at) > new Date(existing.at)) {
        stamps[jobKey] = value;
      }
    }
    return stamps;
  } catch (err) {
    console.error("[getCronHeartbeats]", err instanceof Error ? err.message : String(err));
    return {};
  }
}
