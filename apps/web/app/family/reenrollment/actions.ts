"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { initializeRegistrationPacket } from "@/lib/mutations";

// ─── Accept Re-enrollment ──────────────────────────────────────────────────────

/**
 * Family accepts a re-enrollment offer.
 *
 * - Moves the application status from "offered" → "accepted"
 * - Activates the pending enrollment record
 * - Initializes the registration packet so the family can complete it
 * - Revalidates relevant pages
 */
export async function familyAcceptReenrollment(
  applicationId: string
): Promise<{ data: null; error: string | null }> {
  const session = await requireSession();
  const supabase = createServiceRoleClient();

  // Verify ownership: the application's guardian must belong to this user
  const { data: app, error: appErr } = await supabase
    .from("application")
    .select(
      `
      id,
      campus_id,
      grade_level_id,
      status,
      guardian:guardian_id (user_id, household:household_id (user_id))
    `
    )
    .eq("id", applicationId)
    .single();

  if (appErr || !app) {
    return { data: null, error: "Application not found." };
  }

  const row = app as unknown as {
    id: string;
    campus_id: string;
    grade_level_id: string;
    status: string;
    guardian: {
      user_id: string | null;
      household: { user_id: string | null } | null;
    } | null;
  };

  const guardianUserId = row.guardian?.user_id ?? null;
  const householdUserId = row.guardian?.household?.user_id ?? null;

  if (
    guardianUserId !== session.user_id &&
    householdUserId !== session.user_id
  ) {
    return { data: null, error: "Unauthorized." };
  }

  if (row.status !== "offered") {
    return {
      data: null,
      error: "This offer is no longer available.",
    };
  }

  // Transition application to "accepted"
  const { error: acceptAppErr } = await supabase
    .from("application")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("status", "offered");

  if (acceptAppErr) {
    return { data: null, error: acceptAppErr.message };
  }

  // Activate the linked pending enrollment
  const { data: enrollmentRows, error: enrollFetchErr } = await supabase
    .from("enrollment")
    .update({
      status: "active",
      enrolled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("application_id", applicationId)
    .eq("status", "pending")
    .select("id, school_year_id");

  if (enrollFetchErr) {
    return { data: null, error: enrollFetchErr.message };
  }

  // Initialize a registration packet for the newly activated enrollment
  const activated = enrollmentRows?.[0] as
    | { id: string; school_year_id: string }
    | undefined;

  if (activated) {
    await initializeRegistrationPacket({
      enrollment_id: activated.id,
      campus_id: row.campus_id,
      school_year_id: activated.school_year_id,
    });
  }

  revalidatePath("/family/reenrollment");
  revalidatePath("/family/dashboard");
  revalidatePath("/family/registration");
  revalidatePath("/staff/enrollment");
  revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");

  return { data: null, error: null };
}

// ─── Decline Re-enrollment ─────────────────────────────────────────────────────

/**
 * Family declines a re-enrollment offer.
 *
 * - Moves the application status from "offered" → "declined"
 * - Withdraws the pending enrollment record
 */
export async function familyDeclineReenrollment(
  applicationId: string
): Promise<{ data: null; error: string | null }> {
  const session = await requireSession();
  const supabase = createServiceRoleClient();

  // Verify ownership
  const { data: app, error: appErr } = await supabase
    .from("application")
    .select(
      `
      id,
      status,
      guardian:guardian_id (user_id, household:household_id (user_id))
    `
    )
    .eq("id", applicationId)
    .single();

  if (appErr || !app) {
    return { data: null, error: "Application not found." };
  }

  const row = app as unknown as {
    id: string;
    status: string;
    guardian: {
      user_id: string | null;
      household: { user_id: string | null } | null;
    } | null;
  };

  const guardianUserId = row.guardian?.user_id ?? null;
  const householdUserId = row.guardian?.household?.user_id ?? null;

  if (
    guardianUserId !== session.user_id &&
    householdUserId !== session.user_id
  ) {
    return { data: null, error: "Unauthorized." };
  }

  if (row.status !== "offered") {
    return {
      data: null,
      error: "This offer is no longer available.",
    };
  }

  // Transition application to "declined"
  const { error: declineErr } = await supabase
    .from("application")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("status", "offered");

  if (declineErr) {
    return { data: null, error: declineErr.message };
  }

  // Withdraw the pending enrollment
  await supabase
    .from("enrollment")
    .update({
      status: "withdrawn",
      withdrawn_at: new Date().toISOString(),
      withdrawal_reason: "Family declined re-enrollment offer.",
      updated_at: new Date().toISOString(),
    })
    .eq("application_id", applicationId)
    .eq("status", "pending");

  revalidatePath("/family/reenrollment");
  revalidatePath("/family/dashboard");
  revalidatePath("/staff/enrollment");
  revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");

  return { data: null, error: null };
}

// ─── Intent-to-Return Pulse ────────────────────────────────────────────────

const VALID_INTENTS = new Set(["yes", "undecided", "no"]);

/**
 * Family's one-tap answer to the spring intent-to-return pulse (see
 * lib/queries/reenrollment.ts). This is intentionally lighter-weight than
 * accept/decline above — it sets reenrollment_intent on the CURRENT active
 * enrollment, ahead of any formal seat offer, and can be changed anytime
 * before staff send one.
 */
export async function familySetReenrollmentIntent(
  enrollmentId: string,
  intent: "yes" | "undecided" | "no"
): Promise<{ data: null; error: string | null }> {
  if (!VALID_INTENTS.has(intent)) {
    return { data: null, error: "Invalid response." };
  }

  const session = await requireSession();
  const supabase = createServiceRoleClient();

  // Verify ownership: enrollment -> application -> guardian must belong to this user
  const { data: enrollment, error: enrollErr } = await supabase
    .from("enrollment")
    .select(
      `
      id,
      status,
      application:application_id (
        guardian:guardian_id (user_id, household:household_id (user_id))
      )
    `
    )
    .eq("id", enrollmentId)
    .single();

  if (enrollErr || !enrollment) {
    return { data: null, error: "Enrollment not found." };
  }

  const row = enrollment as unknown as {
    id: string;
    status: string;
    application: {
      guardian: {
        user_id: string | null;
        household: { user_id: string | null } | null;
      } | null;
    } | null;
  };

  const guardianUserId = row.application?.guardian?.user_id ?? null;
  const householdUserId = row.application?.guardian?.household?.user_id ?? null;

  if (guardianUserId !== session.user_id && householdUserId !== session.user_id) {
    return { data: null, error: "Unauthorized." };
  }

  if (row.status !== "active") {
    return { data: null, error: "This enrollment is no longer active." };
  }

  const { error: updateErr } = await supabase
    .from("enrollment")
    .update({
      reenrollment_intent: intent,
      reenrollment_intent_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId);

  if (updateErr) {
    // reenrollment_intent ships in migration 00038, applied by hand. Until it
    // lands, this update fails with 42703. Never hand a family a raw Postgres
    // string: it is internal detail, English-only, and tells them nothing they
    // can act on. Bilingual "EN / ES" slash form, matching the server-side
    // convention in app/(public)/inquire/actions.ts where there is no locale
    // context to switch on.
    console.error("[familySetReenrollmentIntent]", updateErr.message, { enrollmentId });
    return {
      data: null,
      error:
        "We could not save your answer right now. Please try again, or contact your school's enrollment office. / No pudimos guardar su respuesta en este momento. Intente de nuevo o comuníquese con la oficina de inscripciones de su escuela.",
    };
  }

  revalidatePath("/family/reenrollment");
  revalidatePath("/staff/enrollment");
  revalidatePath("/staff/reports");

  return { data: null, error: null };
}
