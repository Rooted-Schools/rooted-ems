import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { notifyFamilyRegistrationNudge } from "@/lib/notify";

/**
 * Cron endpoint that nudges families whose registration packet has stalled
 * on missing required items. Scribbles/K12 Enroll's most-praised feature,
 * rebuilt on our stack: in-app + bilingual email + SMS (consented) pointing
 * at exactly what's still needed.
 *
 * Stall definition: packet not submitted, at least one required item still
 * pending, and the packet is older than NUDGE_INTERVAL_DAYS. Families are
 * re-nudged at most once per interval (registration_packet.last_nudged_at
 * is the throttle/claim marker, mirroring offer.reminder_sent_at).
 *
 * Runs on a schedule configured in vercel.json (daily at 16:00 UTC).
 *
 * Authentication: CRON_SECRET via Authorization header as "Bearer <secret>".
 */

const NUDGE_INTERVAL_DAYS = 4;

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
  const stallCutoff = new Date(
    now.getTime() - NUDGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Unsubmitted packets old enough to count as stalled and not nudged
  // within the interval. last_nudged_at is from migration 00027 and isn't
  // in the generated DB types yet, hence the casts below.
  const { data: packets, error: fetchErr } = await supabase
    .from("registration_packet")
    .select(
      `
      id, enrollment_id, created_at, last_nudged_at,
      enrollment:enrollment_id (
        application_id, campus_id, school_year_id,
        student:student_id (first_name, last_name)
      )
    `
    )
    .in("status", ["pending", "in_progress"])
    .lt("created_at", stallCutoff)
    .or(`last_nudged_at.is.null,last_nudged_at.lt.${stallCutoff}`);

  if (fetchErr) {
    console.error("[cron/nudge-registrations] fetch", fetchErr.message);
    return NextResponse.json(
      { error: "Failed to fetch stalled packets." },
      { status: 500 }
    );
  }

  const checked = packets?.length ?? 0;
  let nudged = 0;
  let errors = 0;

  for (const packet of packets ?? []) {
    try {
      const enrollment = packet.enrollment as unknown as {
        application_id: string | null;
        campus_id: string | null;
        school_year_id: string | null;
        student: { first_name: string; last_name: string } | null;
      } | null;
      if (!enrollment?.application_id || !enrollment.campus_id || !enrollment.school_year_id) {
        continue;
      }

      // Required items for this campus/year that the family hasn't finished.
      const [{ data: requirements }, { data: items }] = await Promise.all([
        supabase
          .from("packet_requirement")
          .select("item_type, name")
          .eq("campus_id", enrollment.campus_id)
          .eq("school_year_id", enrollment.school_year_id)
          .eq("is_required", true)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("registration_item")
          .select("item_type, status")
          .eq("enrollment_id", packet.enrollment_id as string),
      ]);

      const doneTypes = new Set(
        (items ?? [])
          .filter((i: Record<string, unknown>) =>
            ["submitted", "verified", "skipped"].includes(i.status as string)
          )
          .map((i: Record<string, unknown>) => i.item_type as string)
      );
      const missingNames = (requirements ?? [])
        .filter((r: Record<string, unknown>) => !doneTypes.has(r.item_type as string))
        .map((r: Record<string, unknown>) => r.name as string);

      if (missingNames.length === 0) continue;

      // Atomic claim: only one runner flips last_nudged_at inside the window.
      const { data: claimed, error: claimErr } = await supabase
        .from("registration_packet")
        .update({ last_nudged_at: nowIso } as never)
        .eq("id", packet.id as string)
        .or(`last_nudged_at.is.null,last_nudged_at.lt.${stallCutoff}`)
        .select("id");

      if (claimErr) {
        console.error(`[cron/nudge-registrations] claim ${packet.id}`, claimErr.message);
        errors++;
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // another run got it

      const student = enrollment.student;
      await notifyFamilyRegistrationNudge({
        applicationId: enrollment.application_id,
        studentName: student ? `${student.first_name} ${student.last_name}` : undefined,
        campusId: enrollment.campus_id,
        missingNames,
      });

      nudged++;
    } catch (err) {
      console.error(
        `[cron/nudge-registrations] ${packet.id}`,
        err instanceof Error ? err.message : err
      );
      errors++;
    }
  }

  console.log(
    `[cron/nudge-registrations] Checked ${checked} packets, nudged ${nudged}, errors ${errors}`
  );

  return NextResponse.json({ checked, nudged, errors, timestamp: nowIso });
}
