/**
 * Messaging pause switches, backed by the existing `setting` table (key
 * "welcome_messages_enabled", campus_id null — network-wide, no per-campus
 * override yet). Lets the owner pause the instant bilingual welcome
 * (email + consented SMS) that fires for every brand-new lead while campus
 * teams train, without touching lead creation, staff routing, or anything
 * else in the response engine.
 *
 * Default is ON: a missing row (nothing ever written) means welcome
 * messaging is enabled. The setting exists only to pause it, not to require
 * opt-in — a fresh environment or a row that was never created must not
 * silently go quiet.
 *
 * Fail-open on read errors, deliberately: a broken flag must never silently
 * stop family communication. The read path never throws.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import type { MutationResult } from "./mutations/applications";

const WELCOME_MESSAGES_KEY = "welcome_messages_enabled";

/**
 * Master pause for the automated, cron-driven outreach to leads — the daily
 * re-engagement nudge (cron/reengage-leads) and the automated nurture journeys
 * (cron/run-journeys). Separate from the instant welcome above: welcome fires
 * once when a lead is created, this governs the ongoing automated follow-up to
 * the whole existing lead list. The pre-launch "stop emailing everyone" switch.
 *
 * Same semantics as welcome: `setting` key, campus_id null (network-wide),
 * default ON (missing row = enabled), read path never throws and fails open —
 * a broken flag must not silently halt outreach forever without anyone seeing
 * it in the UI. Staff-created campaigns (cron/send-campaigns) are deliberate
 * and are NOT gated by this switch.
 */
const AUTOMATED_OUTREACH_KEY = "automated_outreach_enabled";

/**
 * Whether the instant welcome (email + consented SMS) should fire for a
 * brand-new lead. Missing row = true (on by default). Never throws — any
 * query error also resolves true, matching the "must not silently stop
 * family communication" rule.
 */
export async function isWelcomeMessagingEnabled(): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("setting")
      .select("value")
      .eq("key", WELCOME_MESSAGES_KEY)
      .is("campus_id", null)
      .maybeSingle();

    if (error) {
      console.error("[isWelcomeMessagingEnabled]", error.message);
      return true;
    }
    if (!data) return true; // no row written yet — on by default

    const value = data.value as { enabled?: boolean } | boolean | null;
    if (typeof value === "boolean") return value;
    if (value && typeof value.enabled === "boolean") return value.enabled;
    return true;
  } catch (err) {
    console.error("[isWelcomeMessagingEnabled]", err instanceof Error ? err.message : String(err));
    return true;
  }
}

/**
 * Set the welcome-messaging pause switch. `setting` has UNIQUE
 * (campus_id, key) but Postgres treats NULL campus_id rows as distinct, so
 * upsert-on-conflict can't dedupe them — same gotcha as
 * lib/cron-heartbeat.ts recordCronRun. Update first, insert only when
 * nothing matched.
 */
export async function setWelcomeMessagingEnabled(
  enabled: boolean,
  actorId: string
): Promise<MutationResult> {
  try {
    const supabase = createServiceRoleClient();
    const value = { enabled };

    const { data: before } = await supabase
      .from("setting")
      .select("value")
      .eq("key", WELCOME_MESSAGES_KEY)
      .is("campus_id", null)
      .maybeSingle();

    const { data: updated, error: updateError } = await supabase
      .from("setting")
      .update({ value })
      .eq("key", WELCOME_MESSAGES_KEY)
      .is("campus_id", null)
      .select("id");

    if (updateError) return { data: null, error: updateError.message };

    if ((updated ?? []).length === 0) {
      const { error: insertError } = await supabase
        .from("setting")
        .insert({ key: WELCOME_MESSAGES_KEY, campus_id: null, value });
      if (insertError) return { data: null, error: insertError.message };
    }

    await logAuditEvent({
      table_name: "setting",
      record_id: null,
      action: AuditAction.StatusChange,
      actor_id: actorId,
      campus_id: null,
      old_data: before ? { value: before.value } : undefined,
      new_data: { value },
      metadata: { key: WELCOME_MESSAGES_KEY },
    });

    return { data: null, error: null };
  } catch (err) {
    console.error("[setWelcomeMessagingEnabled]", err instanceof Error ? err.message : String(err));
    return { data: null, error: "Failed to update welcome messaging setting." };
  }
}

/**
 * Whether cron-driven automated outreach (re-engagement + nurture journeys)
 * should run. Missing row = true (on by default). Never throws; any error
 * resolves true, matching the welcome flag's fail-open rule.
 */
export async function isAutomatedOutreachEnabled(): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("setting")
      .select("value")
      .eq("key", AUTOMATED_OUTREACH_KEY)
      .is("campus_id", null)
      .maybeSingle();

    if (error) {
      console.error("[isAutomatedOutreachEnabled]", error.message);
      return true;
    }
    if (!data) return true; // no row written yet — on by default

    const value = data.value as { enabled?: boolean } | boolean | null;
    if (typeof value === "boolean") return value;
    if (value && typeof value.enabled === "boolean") return value.enabled;
    return true;
  } catch (err) {
    console.error("[isAutomatedOutreachEnabled]", err instanceof Error ? err.message : String(err));
    return true;
  }
}

/** Set the automated-outreach master pause switch. Mirrors setWelcomeMessagingEnabled. */
export async function setAutomatedOutreachEnabled(
  enabled: boolean,
  actorId: string
): Promise<MutationResult> {
  try {
    const supabase = createServiceRoleClient();
    const value = { enabled };

    const { data: before } = await supabase
      .from("setting")
      .select("value")
      .eq("key", AUTOMATED_OUTREACH_KEY)
      .is("campus_id", null)
      .maybeSingle();

    const { data: updated, error: updateError } = await supabase
      .from("setting")
      .update({ value })
      .eq("key", AUTOMATED_OUTREACH_KEY)
      .is("campus_id", null)
      .select("id");

    if (updateError) return { data: null, error: updateError.message };

    if ((updated ?? []).length === 0) {
      const { error: insertError } = await supabase
        .from("setting")
        .insert({ key: AUTOMATED_OUTREACH_KEY, campus_id: null, value });
      if (insertError) return { data: null, error: insertError.message };
    }

    await logAuditEvent({
      table_name: "setting",
      record_id: null,
      action: AuditAction.StatusChange,
      actor_id: actorId,
      campus_id: null,
      old_data: before ? { value: before.value } : undefined,
      new_data: { value },
      metadata: { key: AUTOMATED_OUTREACH_KEY },
    });

    return { data: null, error: null };
  } catch (err) {
    console.error("[setAutomatedOutreachEnabled]", err instanceof Error ? err.message : String(err));
    return { data: null, error: "Failed to update automated outreach setting." };
  }
}
