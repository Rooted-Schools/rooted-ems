import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { notifyFamilyOfOffer, notifyWaitlistMovement } from "@/lib/notify";
import { resolveWaitlistOfferExpiry } from "@/lib/offer-deadlines";
import { recordWaitlistPositionHistory } from "./waitlist-history";

// ─── Types ─────────────────────────────────────────────

export interface AddToWaitlistInput {
  waitlist_id: string;
  application_id: string;
  position_number: number;
}

/**
 * Removal reasons that mean the FAMILY is out — the only ones that justify
 * marking their application withdrawn. Every other removal (a staff cleanup, a
 * grade change, an administrative correction) leaves the application status
 * exactly where it was; a family who never withdrew must never be recorded as
 * having withdrawn.
 */
const FAMILY_WITHDRAWAL_REASONS = new Set([
  "family_withdrew",
  "declined",
  "withdrawn",
  "no_longer_interested",
]);

export function isFamilyWithdrawalReason(reason: string): boolean {
  return FAMILY_WITHDRAWAL_REASONS.has(reason.trim().toLowerCase());
}

// ─── Mutations ─────────────────────────────────────────

/**
 * Add an application to a waitlist at a given position.
 * Updates the application status to "waitlisted".
 */
export async function addToWaitlist(
  input: AddToWaitlistInput
): Promise<MutationResult<{ id: string }>> {
  // Service role on purpose: called only from staff-gated paths (the
  // manual waitlist-add action, and completeLotteryResults which is itself
  // gated behind requireRoleOnCampus). Updates `application` directly, which
  // trips the same latent RLS recursion (application policy -> guardian
  // policy -> application policy) documented in
  // lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("waitlist_position")
    .insert({
      waitlist_id: input.waitlist_id,
      application_id: input.application_id,
      position_number: input.position_number,
      added_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[addToWaitlist]", error.message);
    return { data: null, error: "Failed to add to waitlist." };
  }

  // Update application status
  await supabase
    .from("application")
    .update({ status: "waitlisted", updated_at: new Date().toISOString() })
    .eq("id", input.application_id);

  // Fetch campus_id from the waitlist record for the audit event
  const { data: wl } = await supabase
    .from("waitlist")
    .select("campus_id")
    .eq("id", input.waitlist_id)
    .single();

  await logAuditEvent({
    table_name: "waitlist_position",
    record_id: data.id,
    action: AuditAction.Create,
    actor_id: null,
    campus_id: (wl?.campus_id as string) ?? null,
    new_data: {
      waitlist_id: input.waitlist_id,
      application_id: input.application_id,
      position_number: input.position_number,
    },
  });

  // First entry in this family's history ledger — the honest starting point
  // for any later "moved up from N" comparison.
  await recordWaitlistPositionHistory({
    waitlistPositionId: data.id,
    applicationId: input.application_id,
    positionNumber: input.position_number,
    changeType: "initial",
  });

  return { data: { id: data.id }, error: null };
}

/**
 * Promote a student from the waitlist — removes them and creates an offer.
 * This is the most common (and most consequential) waitlist action.
 *
 * Service role, not the user-scoped client: the auto-promotion path is the
 * expire-offers cron (app/api/cron/expire-offers/route.ts), which carries no
 * session cookies. Under RLS a user-scoped client sees zero rows there, so
 * every automatic promotion silently found "no waitlist position" and did
 * nothing. Callers are already gated — staff actions behind
 * requireStaffSession, the cron behind CRON_SECRET.
 *
 * `offeredBy` is a user id written to offer.offered_by (a UUID column).
 * Callers with no real user behind them (the cron) must pass null; a
 * sentinel string like "system" is not a UUID and fails the insert.
 *
 * `expiresAt` may be null, in which case the response window comes from the
 * campus's adopted lottery policy (lib/offer-deadlines.ts). An explicit
 * timestamp from a caller still wins.
 *
 * ORDER OF OPERATIONS — this is the part that must not be rearranged.
 * The position is CLAIMED (promoted_at set, so a concurrent caller cannot
 * take the same family), then the offer is inserted, and only once the offer
 * row exists is the position marked removed. If the offer insert fails the
 * claim is released and the family stays live on the waitlist. The previous
 * order marked the position promoted AND removed before inserting, so every
 * failed insert quietly deleted a family from the waitlist with no offer and
 * no notification.
 */
export async function promoteFromWaitlist(
  waitlistPositionId: string,
  offeredBy: string | null,
  expiresAt: string | null
): Promise<MutationResult<{ offer_id: string }>> {
  const supabase = createServiceRoleClient();

  // Get the waitlist position with related data
  const { data: position, error: fetchError } = await supabase
    .from("waitlist_position")
    .select(`
      id, application_id, waitlist_id, position_number,
      waitlist:waitlist_id (campus_id, grade_level_id)
    `)
    .eq("id", waitlistPositionId)
    .is("removed_at", null)
    .single();

  if (fetchError || !position) {
    return { data: null, error: "Waitlist position not found." };
  }

  const pos = position as unknown as Record<string, unknown>;
  const wl = pos.waitlist as unknown as Record<string, string> | null;

  if (!wl) {
    return { data: null, error: "Waitlist data not found." };
  }

  // ── Claim ────────────────────────────────────────────────────────────────
  // Only the caller that flips promoted_at from NULL proceeds. Nothing about
  // the family's place in line is destroyed yet.
  const { data: claimed, error: claimError } = await supabase
    .from("waitlist_position")
    .update({ promoted_at: new Date().toISOString() })
    .eq("id", waitlistPositionId)
    .is("promoted_at", null)
    .select("id")
    .single();

  if (claimError || !claimed) {
    return { data: null, error: "This waitlist position has already been promoted." };
  }

  const resolvedExpiresAt = expiresAt ?? (await resolveWaitlistOfferExpiry(wl.campus_id));

  // ── Offer first ──────────────────────────────────────────────────────────
  const { data: offer, error: offerError } = await supabase
    .from("offer")
    .insert({
      application_id: pos.application_id as string,
      campus_id: wl.campus_id,
      grade_level_id: wl.grade_level_id,
      status: "pending",
      offered_at: new Date().toISOString(),
      expires_at: resolvedExpiresAt,
      offered_by: offeredBy ?? null,
    })
    .select("id")
    .single();

  if (offerError || !offer) {
    console.error("[promoteFromWaitlist] offer", offerError?.message);
    // Release the claim so this family keeps their place in line.
    const { error: releaseError } = await supabase
      .from("waitlist_position")
      .update({ promoted_at: null })
      .eq("id", waitlistPositionId);
    if (releaseError) {
      console.error("[promoteFromWaitlist] claim release failed", releaseError.message, {
        waitlistPositionId,
      });
    }
    return { data: null, error: "Failed to create offer." };
  }

  // ── Only now is the family off the waitlist ──────────────────────────────
  const { error: updateError } = await supabase
    .from("waitlist_position")
    .update({
      removed_at: new Date().toISOString(),
      removal_reason: "promoted",
    })
    .eq("id", waitlistPositionId);

  if (updateError) {
    // The offer exists and the family will hear about it; the position row is
    // simply still marked active. Log loudly rather than failing the promotion.
    console.error("[promoteFromWaitlist] position update", updateError.message, {
      waitlistPositionId,
      offerId: offer.id,
    });
  }

  // Record the promotion in the history ledger — this row's own change.
  // (Everyone BEHIND this position who effectively moved up gets their own
  // "recalculated" row from notifyWaitlistMovement below.)
  await recordWaitlistPositionHistory({
    waitlistPositionId: waitlistPositionId,
    applicationId: pos.application_id as string,
    positionNumber: pos.position_number as number,
    changeType: "promoted",
    reason: "Promoted to a seat offer",
  });

  // Update application status to offered
  await supabase
    .from("application")
    .update({ status: "offered", updated_at: new Date().toISOString() })
    .eq("id", pos.application_id as string);

  await logAuditEvent({
    table_name: "waitlist_position",
    record_id: waitlistPositionId,
    action: AuditAction.StatusChange,
    actor_id: offeredBy ?? null,
    campus_id: wl.campus_id,
    old_data: { status: "active" },
    new_data: { removal_reason: "promoted" },
    metadata: {
      application_id: pos.application_id,
      offer_id: offer.id,
      expires_at: resolvedExpiresAt,
    },
  });

  // Notify the family immediately — they may have been waiting weeks.
  // Guarded: a notification failure must never roll back the promotion.
  await notifyFamilyOfOffer({
    applicationId: pos.application_id as string,
    offerId: offer.id,
    expiresAt: resolvedExpiresAt,
    campusId: wl.campus_id,
    viaWaitlist: true,
  }).catch((err) => console.error("[promoteFromWaitlist] notify failed", err));

  // Everyone behind the promoted student just moved up one place.
  await notifyWaitlistMovement({
    waitlistId: pos.waitlist_id as string,
    removedPositionNumber: pos.position_number as number,
    campusId: wl.campus_id,
  }).catch((err) => console.error("[promoteFromWaitlist] movement notify failed", err));

  return { data: { offer_id: offer.id }, error: null };
}

/**
 * Remove a student from the waitlist (withdrawn, no longer interested, etc.)
 */
export async function removeFromWaitlist(
  waitlistPositionId: string,
  reason: string,
  removedBy?: string
): Promise<MutationResult> {
  // Service role on purpose: called only from staff-gated paths
  // (requireStaffSession / requireRoleOnCampus in the calling actions).
  // Updates `application` directly, which trips the same latent RLS
  // recursion (application policy -> guardian policy -> application policy)
  // documented in lib/queries/recruitment-intel.ts.
  const supabase = createServiceRoleClient();

  // Fetch position to get the application_id and campus before removing
  const { data: position } = await supabase
    .from("waitlist_position")
    .select("application_id, waitlist_id, position_number, waitlist:waitlist_id (campus_id)")
    .eq("id", waitlistPositionId)
    .is("removed_at", null)
    .single();

  const { error } = await supabase
    .from("waitlist_position")
    .update({
      removed_at: new Date().toISOString(),
      removal_reason: reason,
    })
    .eq("id", waitlistPositionId)
    .is("removed_at", null);

  if (error) {
    return { data: null, error: "Failed to remove from waitlist." };
  }

  // Only an actual family withdrawal changes the application status. Removing
  // a position for an administrative reason says nothing about whether the
  // family still wants the seat, and stamping "withdrawn" on their application
  // took them out of every other queue they were in.
  const familyWithdrew = isFamilyWithdrawalReason(reason);
  if (position?.application_id && familyWithdrew) {
    await supabase
      .from("application")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", position.application_id);
  }

  const campusId =
    (position?.waitlist as unknown as Record<string, string> | null)?.campus_id ?? null;

  // Record the removal in this row's own history — before the "everyone
  // behind moved up" recalculation rows below.
  if (position?.application_id && position?.position_number != null) {
    await recordWaitlistPositionHistory({
      waitlistPositionId: waitlistPositionId,
      applicationId: position.application_id as string,
      positionNumber: position.position_number as number,
      changeType: "removed",
      reason,
    });
  }

  await logAuditEvent({
    table_name: "waitlist_position",
    record_id: waitlistPositionId,
    action: AuditAction.StatusChange,
    actor_id: removedBy ?? null,
    campus_id: campusId,
    old_data: { status: "active" },
    new_data: { removal_reason: reason },
    metadata: {
      application_id: position?.application_id ?? null,
      application_marked_withdrawn: familyWithdrew,
    },
  });

  // Everyone behind the removed student just moved up one place.
  if (position?.waitlist_id && position?.position_number != null) {
    await notifyWaitlistMovement({
      waitlistId: position.waitlist_id as string,
      removedPositionNumber: position.position_number as number,
      campusId: campusId ?? undefined,
    }).catch((err) => console.error("[removeFromWaitlist] movement notify failed", err));
  }

  return { data: null, error: null };
}

/**
 * Ensure a waitlist record exists for a campus/grade/school_year.
 * Returns the waitlist ID (creates if needed).
 */
export async function ensureWaitlist(
  campusId: string,
  gradeLevelId: string,
  schoolYearId: string,
  enrollmentWindowId: string
): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  // Try to find existing
  const { data: existing } = await supabase
    .from("waitlist")
    .select("id")
    .eq("campus_id", campusId)
    .eq("grade_level_id", gradeLevelId)
    .eq("school_year_id", schoolYearId)
    .single();

  if (existing) {
    return { data: { id: existing.id }, error: null };
  }

  // Create new
  const { data, error } = await supabase
    .from("waitlist")
    .insert({
      campus_id: campusId,
      grade_level_id: gradeLevelId,
      school_year_id: schoolYearId,
      enrollment_window_id: enrollmentWindowId,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return { data: null, error: "Failed to create waitlist." };
  }

  return { data: { id: data.id }, error: null };
}

// ─── Automatic promotion after a seat is vacated ───────────────────────────

/**
 * Resolve the school year an application belongs to, via its enrollment
 * window. Null when it cannot be read — callers must not guess.
 */
export async function resolveSchoolYearForApplication(
  supabase: ReturnType<typeof createServiceRoleClient>,
  applicationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("application")
    .select("enrollment_window:enrollment_window_id (school_year_id)")
    .eq("id", applicationId)
    .single();

  if (error) {
    console.error("[resolveSchoolYearForApplication]", error.message, { applicationId });
    return null;
  }

  const window = (data as unknown as Record<string, unknown> | null)?.enrollment_window as
    | Record<string, string>
    | null;
  return window?.school_year_id ?? null;
}

export interface PromoteNextInput {
  campusId: string;
  gradeLevelId: string;
  /** Preferred. When absent it is derived from vacatedApplicationId. */
  schoolYearId?: string | null;
  /** The application whose seat was vacated, used to resolve the school year. */
  vacatedApplicationId?: string | null;
}

/**
 * After a seat is vacated (offer declined, revoked, expired, or an enrollment
 * withdrawn) promote the next eligible waitlist candidate for the same campus,
 * grade, AND school year. Called synchronously so the family hears within
 * minutes rather than waiting for the nightly cron.
 *
 * The school-year scope matters: campus + grade alone matches the waitlist for
 * any year, so the moment a second year is live a 2027-28 decline could pull a
 * 2026-27 family off a waitlist they are still waiting on. When the year cannot
 * be resolved and more than one waitlist exists for the campus and grade, this
 * promotes nobody and says so — guessing is what the bug was.
 *
 * Failures are logged but never propagated: the primary operation has already
 * succeeded and must not be rolled back over a waitlist issue. Returns true
 * only when a family was actually promoted and offered a seat.
 */
export async function promoteNextWaitlistCandidate(input: PromoteNextInput): Promise<boolean> {
  const supabase = createServiceRoleClient();

  let schoolYearId = input.schoolYearId ?? null;
  if (!schoolYearId && input.vacatedApplicationId) {
    schoolYearId = await resolveSchoolYearForApplication(supabase, input.vacatedApplicationId);
  }

  let waitlistQuery = supabase
    .from("waitlist")
    .select("id, school_year_id")
    .eq("campus_id", input.campusId)
    .eq("grade_level_id", input.gradeLevelId);

  if (schoolYearId) {
    waitlistQuery = waitlistQuery.eq("school_year_id", schoolYearId);
  }

  const { data: waitlistRows, error: waitlistError } = await waitlistQuery;

  if (waitlistError) {
    console.error("[promoteNextWaitlistCandidate] waitlist", waitlistError.message);
    return false;
  }

  const rows = (waitlistRows ?? []) as Array<{ id: string; school_year_id: string | null }>;
  if (rows.length === 0) return false;

  if (!schoolYearId && rows.length > 1) {
    console.error(
      "[promoteNextWaitlistCandidate] could not resolve the school year and this campus/grade has more than one waitlist — promoting nobody rather than pulling a family from the wrong year",
      { campusId: input.campusId, gradeLevelId: input.gradeLevelId, waitlists: rows.length }
    );
    return false;
  }

  const waitlistId = rows[0].id;

  const { data: posRows } = await supabase
    .from("waitlist_position")
    .select("id")
    .eq("waitlist_id", waitlistId)
    .is("removed_at", null)
    .is("promoted_at", null)
    .order("position_number", { ascending: true })
    .limit(1);

  const nextPositionId = posRows?.[0]?.id as string | undefined;
  if (!nextPositionId) return false;

  // offered_by is a UUID column and there is no human behind an automatic
  // promotion, so it stays null. The deadline comes from the adopted policy.
  const result = await promoteFromWaitlist(nextPositionId, null, null);
  if (result.error) {
    console.error("[promoteNextWaitlistCandidate]", result.error);
    return false;
  }
  return true;
}
