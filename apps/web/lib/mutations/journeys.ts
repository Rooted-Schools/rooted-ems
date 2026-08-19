import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { requireRoleOnCampus, requireNetworkAccess } from "@/lib/auth/get-session";
import {
  refusalForTemplateKey,
  validateStepContent,
  mergeStepPayload,
  type JourneyStepContentInput,
} from "@/app/staff/recruitment/journeys/step-content-rules";

/**
 * Journey engine (LG-2). Auto-enroll a lead into a nurture sequence; advance
 * one step per day via cron; exit the instant the family takes the action
 * the journey was trying to produce. All service-role (runs inside response
 * flows and the cron); never throws.
 *
 * The exit rule is the product: "better communication, not more." A lead
 * that applies, RSVPs, gets a staff call, or unsubscribes leaves every
 * active journey immediately.
 *
 * The management functions below (pauseJourney onward) are different in
 * kind: staff-initiated, not system-triggered, so they run on the
 * user-scoped client (RLS enforced — journey_enrollment RLS in particular
 * ties access to the enrolled lead's campus, which is what makes per-lead
 * campus scoping real rather than just an app-layer check) and they DO
 * throw/return errors rather than swallowing them, because a staff member
 * clicking "Pause" needs to know if it didn't work.
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

// ─── Management (staff-initiated, /staff/recruitment/journeys) ────────────

/**
 * Pause a journey. Every enrolled family stops advancing — the cron's
 * is_active check (app/api/cron/run-journeys/route.ts) skips their due
 * steps without exiting them, so nothing is lost, nothing sends.
 */
export async function pauseJourney(journeyId: string, actorId: string): Promise<MutationResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("journey")
    .update({ is_active: false })
    .eq("id", journeyId)
    .select("campus_id")
    .maybeSingle();

  if (error) {
    console.error("[pauseJourney]", error.message);
    return { data: null, error: "Failed to pause the journey." };
  }
  if (!data) return { data: null, error: "Journey not found, or you don't have access to it." };

  await logAuditEvent({
    table_name: "journey",
    record_id: journeyId,
    action: AuditAction.StatusChange,
    actor_id: actorId,
    campus_id: (data.campus_id as string | null) ?? null,
    new_data: { is_active: false },
    metadata: { reason: "manual_pause" },
  });
  return { data: null, error: null };
}

/**
 * Resume a paused journey. Every enrolled family's next_step_at was left
 * untouched while paused, so anyone whose step came due during the pause
 * sends on the very next daily cron run — nobody is skipped forever, and
 * nobody gets a step re-sent.
 */
export async function resumeJourney(journeyId: string, actorId: string): Promise<MutationResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("journey")
    .update({ is_active: true })
    .eq("id", journeyId)
    .select("campus_id")
    .maybeSingle();

  if (error) {
    console.error("[resumeJourney]", error.message);
    return { data: null, error: "Failed to resume the journey." };
  }
  if (!data) return { data: null, error: "Journey not found, or you don't have access to it." };

  await logAuditEvent({
    table_name: "journey",
    record_id: journeyId,
    action: AuditAction.StatusChange,
    actor_id: actorId,
    campus_id: (data.campus_id as string | null) ?? null,
    new_data: { is_active: true },
    metadata: { reason: "manual_resume" },
  });
  return { data: null, error: null };
}

/**
 * Remove ONE family from ONE journey — the roster's "Remove from journey"
 * action. Unlike exitJourneys (system-triggered, exits every active journey
 * for a lead), this targets a single enrollment by id, reason always
 * "manual". Only an 'active' enrollment can be exited — a completed or
 * already-exited row is left alone rather than overwritten.
 */
export async function exitEnrollment(enrollmentId: string, actorId: string): Promise<MutationResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("journey_enrollment")
    .update({ status: "exited", exit_reason: "manual", ended_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .eq("status", "active")
    .select("lead_id, journey:journey_id (name)")
    .maybeSingle();

  if (error) {
    console.error("[exitEnrollment]", error.message);
    return { data: null, error: "Failed to remove this family from the journey." };
  }
  if (!data) {
    return { data: null, error: "This family is no longer active in the journey (already completed or removed)." };
  }

  const journeyName = (data.journey as unknown as { name?: string } | null)?.name ?? "the journey";
  await supabase.from("lead_activity").insert({
    lead_id: data.lead_id as string,
    activity_type: "note",
    body: `Removed from nurture journey "${journeyName}" by staff. No further journey emails will send.`,
  });

  await logAuditEvent({
    table_name: "journey_enrollment",
    record_id: enrollmentId,
    action: AuditAction.StatusChange,
    actor_id: actorId,
    campus_id: null,
    new_data: { status: "exited", exit_reason: "manual" },
  });
  return { data: null, error: null };
}

/**
 * Manually enroll one lead into a SPECIFIC journey (by id, not key) — the
 * "Enroll families" dialog on the journey detail page. Distinct from
 * enrollLeadInJourney above, which resolves the journey BY KEY for a lead's
 * own campus (the automatic, system-triggered path); here staff already
 * picked the exact journey row, campus-specific or network-default.
 *
 * Runs on the user-scoped client, so journey_enrollment RLS (tied to the
 * lead's own campus) is the real per-lead campus enforcement — the caller
 * (staffEnrollLeadsInJourney in actions.ts) also checks hasRoleOnCampus per
 * lead before calling this, so an out-of-access lead is skipped with a
 * reason before it ever reaches the database, not just rejected by RLS.
 */
export async function enrollLeadInJourneyById(
  leadId: string,
  journeyId: string,
  actorId: string
): Promise<MutationResult<{ enrolled: boolean; skip_reason?: string }>> {
  const supabase = await createServerClient();

  const { data: lead, error: leadError } = await supabase
    .from("lead")
    .select("id, campus_id, unsubscribed_at, email")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError || !lead) {
    return { data: null, error: "Lead not found, or you don't have access to this family's campus." };
  }
  if (lead.unsubscribed_at) return { data: { enrolled: false, skip_reason: "unsubscribed" }, error: null };
  if (!lead.email) return { data: { enrolled: false, skip_reason: "no email on file" }, error: null };

  const { data: firstStep } = await supabase
    .from("journey_step")
    .select("delay_days")
    .eq("journey_id", journeyId)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstStep) return { data: null, error: "This journey has no steps configured yet." };

  const nextAt = new Date(
    Date.now() + ((firstStep.delay_days as number) ?? 0) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: inserted, error } = await supabase
    .from("journey_enrollment")
    .upsert(
      { journey_id: journeyId, lead_id: leadId, current_step: 0, status: "active", next_step_at: nextAt },
      { onConflict: "journey_id,lead_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[enrollLeadInJourneyById]", error.message);
    return { data: null, error: "Failed to enroll this family." };
  }
  if (!inserted) {
    // ignoreDuplicates means a row for this (journey_id, lead_id) already
    // existed — active, completed, or exited. A real no-op, not a failure.
    return { data: { enrolled: false, skip_reason: "already enrolled" }, error: null };
  }

  await logAuditEvent({
    table_name: "journey_enrollment",
    record_id: inserted.id as string,
    action: AuditAction.Create,
    actor_id: actorId,
    campus_id: lead.campus_id as string,
    new_data: { journey_id: journeyId, lead_id: leadId },
    metadata: { source: "manual_staff_enroll" },
  });

  return { data: { enrolled: true }, error: null };
}

// ─── Step content editing ────────────────────────────────────────────────

export interface UpdateJourneyStepContentInput extends JourneyStepContentInput {
  stepId: string;
}

/**
 * Edit the wording of ONE nurture journey step.
 *
 * Authorization order matters and is the whole point of the first half of
 * this function: the caller supplies only a stepId, so the step's journey and
 * that journey's campus_id are resolved from the database FIRST, and the role
 * check runs against that resolved campus. A campus id from the client is
 * never trusted, and never even accepted — same rule the offers and lottery
 * mutations follow (see requireRoleOnCampus in lib/auth/get-session.ts).
 *
 * A journey with campus_id NULL is a network default: its emails go to
 * families at every campus, so editing it takes org-wide standing rather than
 * enrollment_manager at one campus. Both branches redirect on denial, which is
 * how requireRoleOnCampus and requireNetworkAccess signal refusal.
 *
 * Only a "custom" step can be edited. A built-in template's wording is written
 * in lib/email-templates.ts, so this refuses with an explanation rather than
 * flipping template_key to "custom" to make the edit fit.
 */
export async function updateJourneyStepContent(
  input: UpdateJourneyStepContentInput
): Promise<MutationResult> {
  const supabase = createServiceRoleClient();

  // 1. Resolve the step, its journey, and the journey's real campus.
  const { data: step, error: stepError } = await supabase
    .from("journey_step")
    .select("id, journey_id, step_order, template_key, payload, journey:journey_id (campus_id, name, is_active)")
    .eq("id", input.stepId)
    .maybeSingle();

  if (stepError) {
    console.error("[updateJourneyStepContent] lookup", stepError.message);
    return { data: null, error: "Failed to load this step." };
  }
  if (!step) return { data: null, error: "That step no longer exists." };

  const journey = step.journey as unknown as
    | { campus_id: string | null; name: string | null; is_active: boolean | null }
    | null;
  const campusId = journey?.campus_id ?? null;

  // 2. Authorize against the resolved campus, never a client-supplied one.
  const session = campusId
    ? await requireRoleOnCampus(campusId, "enrollment_manager")
    : await requireNetworkAccess();

  // 3. Refuse built-in templates outright.
  const refusal = refusalForTemplateKey(step.template_key as string);
  if (refusal) return { data: null, error: refusal };

  // 4. Validate content.
  const validation = validateStepContent(input);
  if (!validation.ok) return { data: null, error: validation.error };

  const existingPayload = (step.payload ?? {}) as Record<string, unknown>;
  const nextPayload = mergeStepPayload(existingPayload, validation.values);

  const { error: updateError } = await supabase
    .from("journey_step")
    .update({ payload: nextPayload })
    .eq("id", input.stepId);

  if (updateError) {
    console.error("[updateJourneyStepContent] update", updateError.message);
    return { data: null, error: "Failed to save this step." };
  }

  await logAuditEvent({
    table_name: "journey_step",
    record_id: input.stepId,
    action: AuditAction.Update,
    actor_id: session.user_id,
    campus_id: campusId,
    old_data: { payload: existingPayload },
    new_data: { payload: nextPayload },
    metadata: {
      journey_id: step.journey_id as string,
      step_order: step.step_order as number,
      template_key: step.template_key as string,
    },
  });

  return { data: null, error: null };
}
