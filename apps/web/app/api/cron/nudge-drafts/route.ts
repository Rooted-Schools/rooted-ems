import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { recordCronRun } from "@/lib/cron-heartbeat";
import { notifyFamilyDraftReminder } from "@/lib/notify";

/**
 * Cron endpoint that reminds families who saved an application as a draft but
 * never submitted it, while the enrollment window is still open. A pilot
 * tester flagged that a family could save a draft, think they were done, and
 * silently miss the lottery.
 *
 * Draft definition: status 'draft', not touched within REMINDER_INTERVAL_DAYS
 * (so a family actively filling one out today is left alone), and whose
 * enrollment window is currently open and before its close date (so the
 * reminder is only sent while the draft can still be submitted). Families are
 * re-reminded at most once per interval (application.draft_reminder_sent_at is
 * the throttle/claim marker, mirroring registration_packet.last_nudged_at).
 *
 * Runs on a schedule configured in vercel.json.
 *
 * Authentication: CRON_SECRET via Authorization header as "Bearer <secret>".
 */

const REMINDER_INTERVAL_DAYS = 3;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service role: cron requests carry no session cookies, so a user-scoped
  // client would be filtered to zero rows by RLS. The CRON_SECRET check above
  // is the auth boundary for this route.
  const supabase = createServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(
    now.getTime() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Draft applications not touched within the interval and not reminded within
  // it. draft_reminder_sent_at (migration 00061) isn't in the generated DB
  // types yet, hence the casts below.
  const { data: drafts, error: fetchErr } = await supabase
    .from("application")
    .select(
      `
      id, campus_id, updated_at, draft_reminder_sent_at,
      student:student_id (first_name, last_name),
      enrollment_window:enrollment_window_id (status, open_date, close_date)
    `
    )
    .eq("status", "draft")
    .lt("updated_at", cutoff)
    .or(`draft_reminder_sent_at.is.null,draft_reminder_sent_at.lt.${cutoff}`);

  if (fetchErr) {
    console.error("[cron/nudge-drafts] fetch", fetchErr.message);
    await recordCronRun("nudge-drafts", undefined, true);
    return NextResponse.json({ error: "Failed to fetch drafts." }, { status: 500 });
  }

  const checked = drafts?.length ?? 0;
  let reminded = 0;
  let skipped = 0;
  let errors = 0;

  for (const draft of drafts ?? []) {
    try {
      const win = draft.enrollment_window as unknown as {
        status: string | null;
        open_date: string | null;
        close_date: string | null;
      } | null;

      // Only remind while the draft can still be submitted: the window is open
      // and we are between its open and close dates. Otherwise there is nothing
      // useful for the family to do, so stay silent.
      const openMs = win?.open_date ? new Date(win.open_date).getTime() : null;
      const closeMs = win?.close_date ? new Date(win.close_date).getTime() : null;
      const submittable =
        win?.status === "open" &&
        openMs !== null &&
        closeMs !== null &&
        now.getTime() >= openMs &&
        now.getTime() <= closeMs;
      if (!submittable) {
        skipped++;
        continue;
      }

      // Atomic claim: only one runner flips draft_reminder_sent_at inside the
      // window, so a draft is reminded at most once per interval.
      const { data: claimed, error: claimErr } = await supabase
        .from("application")
        .update({ draft_reminder_sent_at: nowIso } as never)
        .eq("id", draft.id as string)
        .or(`draft_reminder_sent_at.is.null,draft_reminder_sent_at.lt.${cutoff}`)
        .select("id");

      if (claimErr) {
        console.error(`[cron/nudge-drafts] claim ${draft.id}`, claimErr.message);
        errors++;
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // another run got it

      const student = draft.student as unknown as { first_name: string; last_name: string } | null;
      await notifyFamilyDraftReminder({
        applicationId: draft.id as string,
        studentName: student ? `${student.first_name} ${student.last_name}` : undefined,
        campusId: (draft.campus_id as string) ?? undefined,
        closeDate: win?.close_date ?? null,
      });

      reminded++;
    } catch (err) {
      console.error(
        `[cron/nudge-drafts] ${draft.id}`,
        err instanceof Error ? err.message : err
      );
      errors++;
    }
  }

  console.log(
    `[cron/nudge-drafts] Checked ${checked} drafts, reminded ${reminded}, skipped ${skipped}, errors ${errors}`
  );
  await recordCronRun("nudge-drafts", { checked, reminded, skipped, errors });
  return NextResponse.json({ checked, reminded, skipped, errors, timestamp: nowIso });
}
