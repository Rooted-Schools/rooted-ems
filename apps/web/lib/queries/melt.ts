/**
 * Registration melt queries.
 *
 * "Melt" is the industry term for accepted seats that never convert to a
 * showed-up student — the most expensive kind of loss because the family
 * already said yes. This module answers two questions for staff:
 *   1. How much of this cycle's registration is actually done? (headline
 *      stat on /staff/today)
 *   2. Which specific families have gone quiet long enough that a phone
 *      call — not another automated nudge — is the right next move?
 *      (Today "Needs a phone call" queue)
 *
 * Both queries key off real registration_packet / registration_item rows;
 * neither invents a number when the underlying data is empty.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";

/** True when the error says a named column is absent — migration not yet applied, not a missing row. */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

let warnedMissingCallEscalationColumns = false;
function warnMissingCallEscalationColumns(): void {
  if (warnedMissingCallEscalationColumns) return;
  warnedMissingCallEscalationColumns = true;
  console.warn(
    "[getCallEscalationQueue] registration_packet.contacted_at not present — migration 00036_registration_outreach.sql has not been applied. Call escalation queue is hidden until it runs."
  );
}

// ─── Headline completion stat ─────────────────────────────────────────────

export interface RegistrationCompletionStats {
  schoolYearName: string | null;
  /** Registration packets created (any status) for the current school year, in scope. */
  packetsCreated: number;
  /** Packets whose status is "complete" — every required item verified (see
   *  lib/mutations/registration.ts verifyRegistrationItem / skipRegistrationItem). */
  packetsComplete: number;
  /** null (not 0) when packetsCreated is 0 — there is no rate to report yet. */
  completionRate: number | null;
}

/**
 * Registration completion for the current school year, optionally scoped to
 * a set of campuses. "Complete" means registration_packet.status === "complete",
 * which the mutation layer only sets once every required registration_item is
 * verified or explicitly skipped — the same bar the staff verification UI uses.
 */
export async function getRegistrationCompletion(
  campusIds?: string[]
): Promise<RegistrationCompletionStats> {
  const supabase = createServiceRoleClient();

  const { data: currentSY, error: syError } = await supabase
    .from("school_year")
    .select("id, name")
    .eq("is_current", true)
    .maybeSingle();

  if (syError) {
    console.error("[getRegistrationCompletion] school_year", syError.message);
    return { schoolYearName: null, packetsCreated: 0, packetsComplete: 0, completionRate: null };
  }
  if (!currentSY?.id) {
    return { schoolYearName: null, packetsCreated: 0, packetsComplete: 0, completionRate: null };
  }

  // !inner makes the joined enrollment columns filterable (school_year_id,
  // campus_id) — same pattern as lib/queries/leads.ts getJourneyStats.
  let query = supabase
    .from("registration_packet")
    .select("id, status, enrollment:enrollment_id!inner (school_year_id, campus_id)")
    .eq("enrollment.school_year_id", currentSY.id as string);

  if (campusIds && campusIds.length > 0) {
    query = query.in("enrollment.campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getRegistrationCompletion] packets", error.message);
    return {
      schoolYearName: (currentSY.name as string) ?? null,
      packetsCreated: 0,
      packetsComplete: 0,
      completionRate: null,
    };
  }

  const rows = (data ?? []) as Array<{ status: string }>;
  const packetsCreated = rows.length;
  const packetsComplete = rows.filter((r) => r.status === "complete").length;
  const completionRate = packetsCreated > 0 ? Math.round((packetsComplete / packetsCreated) * 100) : null;

  return {
    schoolYearName: (currentSY.name as string) ?? null,
    packetsCreated,
    packetsComplete,
    completionRate,
  };
}

// ─── Call escalation queue ────────────────────────────────────────────────

export interface CallEscalationRow {
  packet_id: string;
  enrollment_id: string;
  application_id: string;
  student_name: string;
  guardian_name: string;
  /** null when the family has no phone on file — the card still shows honestly. */
  guardian_phone: string | null;
  campus_id: string;
  campus_name: string;
  days_stalled: number;
  outstanding_item_names: string[];
}

export interface CallEscalationResult {
  /** False when registration_packet.contacted_at (migration 00036) has not been applied yet. */
  available: boolean;
  rows: CallEscalationRow[];
}

const CALL_ESCALATION_DAYS = 7;

function prettifyItemType(itemType: string): string {
  return itemType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Packets stalled long enough that an automated nudge has stopped being
 * useful and a human call is the next real move. A packet qualifies when
 * ALL of the following hold, each derived from a real timestamp:
 *   - status is still pending/in_progress (not submitted/verified/complete)
 *   - created more than `days` ago (created_at) — this isn't a brand-new packet
 *   - no item activity in `days` — registration_packet.updated_at is bumped
 *     whenever a registration_item under it changes (see
 *     lib/mutations/registration.ts), the same proxy getStalledRegistrations
 *     uses for "last touched"
 *   - last_nudged_at is null or older than `days` — the automated nudge
 *     cron already had its shot and it didn't work
 *   - contacted_at is null or older than `days` — staff haven't already
 *     logged a call inside the window (see markContacted in
 *     app/staff/today/actions.ts)
 */
export async function getCallEscalationQueue(
  campusIds?: string[],
  days: number = CALL_ESCALATION_DAYS
): Promise<CallEscalationResult> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("registration_packet")
    .select(
      `
      id, enrollment_id, created_at, updated_at,
      last_nudged_at, contacted_at,
      enrollment:enrollment_id!inner (
        id, campus_id, application_id,
        student:student_id (first_name, last_name),
        campus:campus_id (name),
        application:application_id ( guardian:guardian_id (first_name, last_name, phone) )
      )
    `
    )
    .in("status", ["pending", "in_progress"])
    .lt("created_at", cutoff)
    .lte("updated_at", cutoff)
    .or(`last_nudged_at.is.null,last_nudged_at.lt.${cutoff}`)
    .or(`contacted_at.is.null,contacted_at.lt.${cutoff}`)
    .order("created_at", { ascending: true });

  if (campusIds && campusIds.length > 0) {
    query = query.in("enrollment.campus_id", campusIds);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingColumn(error)) {
      warnMissingCallEscalationColumns();
      return { available: false, rows: [] };
    }
    console.error("[getCallEscalationQueue] packets", error.message);
    return { available: true, rows: [] };
  }

  const packets = (data ?? []) as Array<Record<string, unknown>>;
  if (packets.length === 0) return { available: true, rows: [] };

  const enrollmentIds = packets
    .map((row) => (row.enrollment as Record<string, unknown> | null)?.id as string)
    .filter(Boolean);

  const { data: items, error: itemsError } = await supabase
    .from("registration_item")
    .select("enrollment_id, item_type")
    .in("enrollment_id", enrollmentIds)
    .eq("status", "pending");

  if (itemsError) {
    console.error("[getCallEscalationQueue] items", itemsError.message);
  }

  const outstandingByEnrollment = new Map<string, string[]>();
  for (const item of (items ?? []) as Array<Record<string, unknown>>) {
    const enrollmentId = item.enrollment_id as string;
    if (!outstandingByEnrollment.has(enrollmentId)) outstandingByEnrollment.set(enrollmentId, []);
    outstandingByEnrollment.get(enrollmentId)!.push(prettifyItemType(item.item_type as string));
  }

  const now = Date.now();
  const rows: CallEscalationRow[] = packets.map((row) => {
    const enrollment = row.enrollment as Record<string, unknown> | null;
    const student = enrollment?.student as Record<string, string> | null;
    const campus = enrollment?.campus as Record<string, string> | null;
    const application = enrollment?.application as Record<string, unknown> | null;
    const guardian = application?.guardian as Record<string, string | null> | null;
    const enrollmentId = (enrollment?.id as string) ?? "";
    const daysStalled = Math.floor((now - new Date(row.created_at as string).getTime()) / (1000 * 60 * 60 * 24));

    return {
      packet_id: row.id as string,
      enrollment_id: enrollmentId,
      application_id: (enrollment?.application_id as string) ?? "",
      student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown student",
      guardian_name: guardian ? `${guardian.first_name ?? ""} ${guardian.last_name ?? ""}`.trim() || "Unknown guardian" : "Unknown guardian",
      guardian_phone: guardian?.phone ?? null,
      campus_id: (enrollment?.campus_id as string) ?? "",
      campus_name: campus?.name ?? "",
      days_stalled: daysStalled,
      outstanding_item_names: outstandingByEnrollment.get(enrollmentId) ?? [],
    };
  });

  return { available: true, rows };
}
