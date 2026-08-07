"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireStaffSession, getAccessibleCampusIds, hasMinRole } from "@/lib/auth/get-session";
import { notifyFamilyOfferExpiringSoon, notifyFamilyRegistrationNudge } from "@/lib/notify";
import { promoteFromWaitlist, createNote } from "@/lib/mutations";
import { isSmsConfigured } from "@/lib/sms";

export interface TextExpiringOffersResult {
  ok: boolean;
  smsConfigured: boolean;
  /** Families actually texted (opted in + phone on file) among the in-scope offers */
  texted: number;
  /** In-scope offers considered */
  total: number;
  error?: string;
}

/**
 * "Text all N" — reuses the real notifyFamilyOfferExpiringSoon fan-out
 * (in-app + email + SMS-when-consented). Never claims a text was sent when
 * TWILIO_* isn't configured; the caller should fall back to opening
 * /staff/offers in that case rather than show a fake success toast.
 */
export async function textExpiringOffers(offerIds: string[]): Promise<TextExpiringOffersResult> {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);

  if (offerIds.length === 0) {
    return { ok: true, smsConfigured: isSmsConfigured(), texted: 0, total: 0 };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("offer")
    .select(`
      id, application_id, campus_id, expires_at,
      application:application_id (
        student:student_id (first_name, last_name),
        guardian:guardian_id (phone, sms_consent)
      )
    `)
    .in("id", offerIds)
    .eq("status", "pending");

  if (error) {
    console.error("[textExpiringOffers]", error.message);
    return { ok: false, smsConfigured: isSmsConfigured(), texted: 0, total: 0, error: "Could not load offers." };
  }

  // Campus-scope: restrict to campuses this staff member can access.
  const rows = (data ?? []).filter((row: Record<string, unknown>) =>
    accessibleIds.length === 0 || accessibleIds.includes(row.campus_id as string)
  );

  const configured = isSmsConfigured();
  if (!configured) {
    return { ok: true, smsConfigured: false, texted: 0, total: rows.length };
  }

  let texted = 0;
  await Promise.all(
    rows.map(async (row: Record<string, unknown>) => {
      const app = row.application as unknown as Record<string, unknown> | null;
      const student = app?.student as unknown as Record<string, string> | null;
      const guardian = app?.guardian as unknown as Record<string, unknown> | null;
      const studentName = student ? `${student.first_name} ${student.last_name}` : undefined;
      if (guardian?.sms_consent === true && guardian?.phone) {
        texted += 1;
      }
      await notifyFamilyOfferExpiringSoon({
        applicationId: row.application_id as string,
        offerId: row.id as string,
        studentName,
        expiresAt: row.expires_at as string,
        campusId: row.campus_id as string,
      }).catch((err) => console.error("[textExpiringOffers] notify failed", err));
    })
  );

  revalidatePath("/staff/today");
  revalidatePath("/staff/dashboard");

  return { ok: true, smsConfigured: true, texted, total: rows.length };
}

export interface SendNudgesResult {
  ok: boolean;
  count: number;
  error?: string;
}

/**
 * "Send nudge" for stalled registrations — reuses notifyFamilyRegistrationNudge
 * for each enrollment, naming the family's real outstanding item types.
 */
export async function sendRegistrationNudges(enrollmentIds: string[]): Promise<SendNudgesResult> {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);

  if (enrollmentIds.length === 0) {
    return { ok: true, count: 0 };
  }

  const supabase = createServiceRoleClient();
  const { data: packets, error } = await supabase
    .from("registration_packet")
    .select(`
      enrollment_id,
      enrollment:enrollment_id (
        id, campus_id, application_id,
        student:student_id (first_name, last_name)
      )
    `)
    .in("enrollment_id", enrollmentIds);

  if (error) {
    console.error("[sendRegistrationNudges] packets", error.message);
    return { ok: false, count: 0, error: "Could not load registrations." };
  }

  const scoped = (packets ?? []).filter((row: Record<string, unknown>) => {
    const enrollment = row.enrollment as unknown as Record<string, unknown> | null;
    if (!enrollment) return false;
    return accessibleIds.length === 0 || accessibleIds.includes(enrollment.campus_id as string);
  });

  if (scoped.length === 0) {
    return { ok: true, count: 0 };
  }

  const scopedEnrollmentIds = scoped.map(
    (row: Record<string, unknown>) => (row.enrollment as Record<string, unknown>).id as string
  );

  const { data: items } = await supabase
    .from("registration_item")
    .select("enrollment_id, item_type")
    .in("enrollment_id", scopedEnrollmentIds)
    .eq("status", "pending");

  const missingByEnrollment = new Map<string, string[]>();
  for (const item of (items ?? []) as Record<string, unknown>[]) {
    const enrollmentId = item.enrollment_id as string;
    const itemType = item.item_type as string;
    const pretty = itemType
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    if (!missingByEnrollment.has(enrollmentId)) missingByEnrollment.set(enrollmentId, []);
    missingByEnrollment.get(enrollmentId)!.push(pretty);
  }

  let count = 0;
  await Promise.all(
    scoped.map(async (row: Record<string, unknown>) => {
      const enrollment = row.enrollment as unknown as Record<string, unknown>;
      const student = enrollment.student as unknown as Record<string, string> | null;
      const enrollmentId = enrollment.id as string;
      const missingNames = missingByEnrollment.get(enrollmentId) ?? [];
      if (missingNames.length === 0) return; // nothing outstanding — nothing to nudge about
      count += 1;
      await notifyFamilyRegistrationNudge({
        applicationId: enrollment.application_id as string,
        studentName: student ? `${student.first_name} ${student.last_name}` : undefined,
        campusId: enrollment.campus_id as string,
        missingNames,
      }).catch((err) => console.error("[sendRegistrationNudges] notify failed", err));
    })
  );

  revalidatePath("/staff/today");
  revalidatePath("/staff/dashboard");

  return { ok: true, count };
}

export interface ReleaseSeatsResult {
  ok: boolean;
  releasedCount: number;
  studentNames: string[];
  error?: string;
}

/**
 * "Release seats" — promotes the given waitlist positions to real offers via
 * the existing promoteFromWaitlist mutation (same path /staff/waitlist uses).
 * Requires enrollment_manager+, same as the rest of the offer/waitlist surface.
 */
export async function releaseSeats(waitlistPositionIds: string[]): Promise<ReleaseSeatsResult> {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);

  if (!hasMinRole(session, "enrollment_manager")) {
    return { ok: false, releasedCount: 0, studentNames: [], error: "Requires enrollment manager access." };
  }

  if (waitlistPositionIds.length === 0) {
    return { ok: true, releasedCount: 0, studentNames: [] };
  }

  const supabase = createServiceRoleClient();
  const { data: positions, error } = await supabase
    .from("waitlist_position")
    .select(`
      id,
      waitlist:waitlist_id (campus_id),
      application:application_id (student:student_id (first_name, last_name))
    `)
    .in("id", waitlistPositionIds)
    .is("removed_at", null);

  if (error) {
    console.error("[releaseSeats] positions", error.message);
    return { ok: false, releasedCount: 0, studentNames: [], error: "Could not load waitlist positions." };
  }

  const scoped = (positions ?? []).filter((row: Record<string, unknown>) => {
    const wl = row.waitlist as unknown as Record<string, unknown> | null;
    if (!wl) return false;
    return accessibleIds.length === 0 || accessibleIds.includes(wl.campus_id as string);
  });

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const studentNames: string[] = [];
  let releasedCount = 0;

  for (const row of scoped as Record<string, unknown>[]) {
    const app = row.application as unknown as Record<string, unknown> | null;
    const student = app?.student as unknown as Record<string, string> | null;
    const result = await promoteFromWaitlist(row.id as string, session.user_id, expiresAt);
    if (!result.error) {
      releasedCount += 1;
      if (student) studentNames.push(`${student.first_name} ${student.last_name}`);
    }
  }

  if (releasedCount > 0) {
    revalidatePath("/staff/today");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/offers");
    revalidatePath("/staff/waitlist");
    revalidatePath("/staff/seats");
    revalidatePath("/staff/applications");
  }

  return { ok: true, releasedCount, studentNames };
}

export interface MarkContactedResult {
  ok: boolean;
  error?: string;
}

/**
 * "Mark contacted" — the call-escalation queue's answer to a phone call that
 * just happened. Two things happen, matching lib/queries/melt.ts
 * getCallEscalationQueue's own stall conditions:
 *   1. A note is written on the linked application (existing notes mutation
 *      pattern — lib/mutations/notes.ts createNote) recording what's still
 *      outstanding. The note's author + created_at (both set by createNote)
 *      are the durable "who called and when" record.
 *   2. registration_packet.contacted_at is stamped with now, which is the
 *      exact column getCallEscalationQueue checks to decide whether a row
 *      belongs in the queue — stamping it removes this family from the list
 *      for the same 7 days a fresh call earns them.
 * Deliberately does NOT touch last_nudged_at — that column is reserved for
 * the automated nudge cron (see migration 00036_registration_outreach.sql).
 */
export async function markRegistrationContacted(enrollmentId: string): Promise<MarkContactedResult> {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);

  if (!enrollmentId) {
    return { ok: false, error: "Missing registration." };
  }

  const supabase = createServiceRoleClient();
  const { data: packet, error } = await supabase
    .from("registration_packet")
    .select(`
      id,
      enrollment:enrollment_id (
        id, campus_id, application_id,
        student:student_id (first_name, last_name)
      )
    `)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();

  if (error) {
    console.error("[markRegistrationContacted] packet", error.message);
    return { ok: false, error: "Could not load that registration." };
  }
  if (!packet) {
    return { ok: false, error: "Registration not found." };
  }

  const enrollment = packet.enrollment as unknown as Record<string, unknown> | null;
  const campusId = (enrollment?.campus_id as string) ?? undefined;
  const applicationId = (enrollment?.application_id as string) ?? undefined;
  const student = enrollment?.student as Record<string, string> | null;

  if (!campusId || (accessibleIds.length > 0 && !accessibleIds.includes(campusId))) {
    return { ok: false, error: "Not authorized for this campus." };
  }
  if (!applicationId) {
    return { ok: false, error: "This registration has no linked application to note the call on." };
  }

  // Outstanding items — reuses the same prettify pattern as sendRegistrationNudges
  // so the note reads exactly like what the family was told was missing.
  const { data: items } = await supabase
    .from("registration_item")
    .select("item_type")
    .eq("enrollment_id", enrollmentId)
    .eq("status", "pending");
  const missingNames = ((items ?? []) as Record<string, unknown>[]).map((i) =>
    (i.item_type as string)
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );

  const studentName = student ? `${student.first_name} ${student.last_name}` : "this student";
  const content =
    missingNames.length > 0
      ? `Called the family about ${studentName}'s registration — still outstanding: ${missingNames.join(", ")}.`
      : `Called the family about ${studentName}'s registration.`;

  const noteResult = await createNote({
    entity_type: "application",
    entity_id: applicationId,
    campus_id: campusId,
    content,
    is_internal: true,
  });

  if (noteResult.error) {
    console.error("[markRegistrationContacted] note", noteResult.error);
    return { ok: false, error: "Could not log the call." };
  }

  const { error: stampError } = await supabase
    .from("registration_packet")
    // contacted_at is from migration 00036 and isn't in the generated DB types yet.
    .update({ contacted_at: new Date().toISOString() } as never)
    .eq("id", packet.id as string);

  if (stampError) {
    console.error("[markRegistrationContacted] stamp", stampError.message);
    // The call is logged (the note above succeeded) — just be honest that
    // the queue itself may not have cleared.
    return { ok: true, error: "Logged the call, but the queue may not update until next refresh." };
  }

  revalidatePath("/staff/today");

  return { ok: true };
}
