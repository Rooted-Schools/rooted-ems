import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { notifyFamilyKeepTheSeat } from "@/lib/notify";

/**
 * Cron endpoint for the "keep the seat" step of the registration melt
 * program: melt doesn't stop the moment a packet is marked complete — a
 * family that goes quiet all summer, with no further touch until the first
 * day of school, is still a real risk of no-show. This sends exactly ONE
 * warm congratulations-and-what's-next email (+ consented SMS) per
 * enrollment, timed 2+ days after the registration packet was fully
 * verified so it doesn't collide with the registrationComplete email that
 * fires the moment verification finishes (see
 * lib/mutations/registration.ts verifyRegistrationItem / skipRegistrationItem
 * -> notifyFamilyRegistrationComplete), and only before the school year's
 * first day — there is no point congratulating a family after school has
 * already started.
 *
 * Eligibility, every condition derived from a real timestamp:
 *   - registration_packet.status === "complete"
 *   - registration_packet.verified_at is at least SEND_DELAY_DAYS old
 *   - registration_packet.keep_the_seat_sent_at is still null (never sent)
 *   - the enrollment's school_year.start_date is still in the future
 *
 * keep_the_seat_sent_at (migration 00036_registration_outreach.sql) is the
 * one-time send marker, claimed atomically the same way reminder_sent_at
 * (00026) and last_nudged_at (00027) are claimed by their crons.
 *
 * Runs on a schedule configured in vercel.json.
 * Authentication: CRON_SECRET via Authorization header as "Bearer <secret>".
 */

const SEND_DELAY_DAYS = 2;

/** True when the error says a named column is absent — migration not yet applied, not a missing row. */
function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

let warnedMissingKeepTheSeatColumn = false;
function warnMissingKeepTheSeatColumn(): void {
  if (warnedMissingKeepTheSeatColumn) return;
  warnedMissingKeepTheSeatColumn = true;
  console.warn(
    "[cron/keep-the-seat] registration_packet.keep_the_seat_sent_at not present — migration 00036_registration_outreach.sql has not been applied. Skipping this run."
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service role: cron requests carry no session cookies, so a user-scoped
  // client would be filtered to zero rows by RLS. The CRON_SECRET check
  // above is the auth boundary for this route.
  const supabase = createServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayDate = nowIso.slice(0, 10); // school_year.start_date is a DATE column
  const verifiedCutoff = new Date(now.getTime() - SEND_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Complete packets, verified long enough ago, never sent the keep-the-seat
  // touch. keep_the_seat_sent_at is from migration 00036 and isn't in the
  // generated DB types yet, hence the casts below.
  const { data: packets, error: fetchErr } = await supabase
    .from("registration_packet")
    .select(
      `
      id, enrollment_id, verified_at, keep_the_seat_sent_at,
      enrollment:enrollment_id (
        id, campus_id, school_year_id,
        student:student_id (first_name, last_name),
        school_year:school_year_id (start_date)
      )
    `
    )
    .eq("status", "complete")
    .lte("verified_at", verifiedCutoff)
    .is("keep_the_seat_sent_at" as never, null);

  if (fetchErr) {
    if (isMissingColumn(fetchErr)) {
      warnMissingKeepTheSeatColumn();
      return NextResponse.json({ skipped: "migration 00036 not applied" }, { status: 200 });
    }
    console.error("[cron/keep-the-seat] fetch", fetchErr.message);
    return NextResponse.json({ error: "Failed to fetch completed packets." }, { status: 500 });
  }

  // Only families still ahead of the first day of school — a congratulations
  // email in October about a summer milestone is noise, not warmth.
  const eligible = (packets ?? []).filter((row: Record<string, unknown>) => {
    const enrollment = row.enrollment as Record<string, unknown> | null;
    const schoolYear = enrollment?.school_year as Record<string, unknown> | null;
    const startDate = schoolYear?.start_date as string | null;
    return Boolean(startDate) && (startDate as string) > todayDate;
  });

  const checked = eligible.length;
  let sent = 0;
  let errors = 0;

  for (const packet of eligible) {
    try {
      const enrollment = packet.enrollment as unknown as {
        id: string;
        campus_id: string | null;
        school_year_id: string | null;
        student: { first_name: string; last_name: string } | null;
        school_year: { start_date: string | null } | null;
      } | null;
      if (!enrollment?.id || !enrollment.campus_id) continue;

      // Atomic claim: only one runner flips keep_the_seat_sent_at from NULL.
      const { data: claimed, error: claimErr } = await supabase
        .from("registration_packet")
        .update({ keep_the_seat_sent_at: nowIso } as never)
        .eq("id", packet.id as string)
        .is("keep_the_seat_sent_at" as never, null)
        .select("id");

      if (claimErr) {
        console.error(`[cron/keep-the-seat] claim ${packet.id}`, claimErr.message);
        errors++;
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // another run got it

      const student = enrollment.student;
      await notifyFamilyKeepTheSeat({
        enrollmentId: enrollment.id,
        studentName: student ? `${student.first_name} ${student.last_name}` : undefined,
        campusId: enrollment.campus_id,
        startDate: enrollment.school_year?.start_date ?? undefined,
      });

      sent++;
    } catch (err) {
      console.error(`[cron/keep-the-seat] ${packet.id}`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.log(`[cron/keep-the-seat] Checked ${checked} completed packets, sent ${sent}, errors ${errors}`);

  return NextResponse.json({ checked, sent, errors, timestamp: nowIso });
}
