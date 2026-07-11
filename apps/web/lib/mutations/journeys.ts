import { createServiceRoleClient } from "@rooted-ems/database/server";

/**
 * Journey engine (LG-2). Auto-enroll a lead into a nurture sequence; advance
 * one step per day via cron; exit the instant the family takes the action
 * the journey was trying to produce. All service-role (runs inside response
 * flows and the cron); never throws.
 *
 * The exit rule is the product: "better communication, not more." A lead
 * that applies, RSVPs, gets a staff call, or unsubscribes leaves every
 * active journey immediately.
 */

export type JourneyKey = "push_to_apply" | "keep_the_seat";
export type ExitReason = "applied" | "rsvp" | "contacted" | "unsubscribed" | "manual";

/**
 * Enroll a lead in the active journey with this key for its campus (falling
 * back to the network-default template, campus_id NULL). Idempotent — a lead
 * is never enrolled in the same journey twice.
 */
export async function enrollLeadInJourney(leadId: string, key: JourneyKey): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    const { data: lead } = await supabase
      .from("lead")
      .select("id, campus_id, unsubscribed_at, email")
      .eq("id", leadId)
      .single();
    if (!lead || lead.unsubscribed_at || !lead.email) return; // no email / opted out → nothing to drip

    // Prefer a campus-specific journey, else the network default.
    const { data: journeys } = await supabase
      .from("journey")
      .select("id, campus_id")
      .eq("key", key)
      .eq("is_active", true)
      .or(`campus_id.eq.${lead.campus_id},campus_id.is.null`);
    const journey =
      (journeys ?? []).find((j: Record<string, unknown>) => j.campus_id === lead.campus_id) ??
      (journeys ?? [])[0];
    if (!journey) return;

    const { data: firstStep } = await supabase
      .from("journey_step")
      .select("delay_days")
      .eq("journey_id", (journey as Record<string, string>).id)
      .order("step_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstStep) return;

    const nextAt = new Date(
      Date.now() + ((firstStep.delay_days as number) ?? 0) * 24 * 60 * 60 * 1000
    ).toISOString();

    // Idempotent insert — unique(journey_id, lead_id) makes a repeat a no-op.
    await supabase
      .from("journey_enrollment")
      .upsert(
        {
          journey_id: (journey as Record<string, string>).id,
          lead_id: leadId,
          current_step: 0,
          status: "active",
          next_step_at: nextAt,
        },
        { onConflict: "journey_id,lead_id", ignoreDuplicates: true }
      );
  } catch (err) {
    console.error("[enrollLeadInJourney]", err);
  }
}

/** Look up a lead by its converted application and enroll it (keep_the_seat). */
export async function enrollByApplication(applicationId: string, key: JourneyKey): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();
    if (lead) await enrollLeadInJourney(lead.id as string, key);
  } catch (err) {
    console.error("[enrollByApplication]", err);
  }
}

/**
 * Exit every active journey for a lead. Called when the family does the
 * thing a journey was nudging toward. Cheap and idempotent.
 */
export async function exitJourneys(leadId: string, reason: ExitReason): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("journey_enrollment")
      .update({ status: "exited", exit_reason: reason, ended_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("status", "active");
  } catch (err) {
    console.error("[exitJourneys]", err);
  }
}

/** Exit journeys given an application id (apply/accept paths carry that, not lead id). */
export async function exitJourneysByApplication(applicationId: string, reason: ExitReason): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();
    if (lead) await exitJourneys(lead.id as string, reason);
  } catch (err) {
    console.error("[exitJourneysByApplication]", err);
  }
}
