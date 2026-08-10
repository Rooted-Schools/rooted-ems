import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { recordCronRun } from "@/lib/cron-heartbeat";
import { notifyLeadReengagement } from "@/lib/notify";

/**
 * Cron endpoint that re-engages gone-quiet leads: open leads with no
 * contact in QUIET_DAYS get one warm bilingual "still interested?" email
 * (+ SMS when consented) and land back in the staff follow-up queue.
 *
 * One automated re-engagement per lead, ever (reengaged_at is the
 * claim/throttle marker) — after that, staying in touch is a human's job.
 * Interest that survives a personal call is worth more than interest
 * flogged by a drip campaign.
 *
 * Runs on a schedule configured in vercel.json (daily at 17:00 UTC).
 * Authentication: CRON_SECRET via Authorization header as "Bearer <secret>".
 */

const QUIET_DAYS = 7;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service role: cron requests carry no session cookies. CRON_SECRET is
  // the auth boundary for this route.
  const supabase = createServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const quietCutoff = new Date(
    now.getTime() - QUIET_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Open, never-re-engaged leads whose last contact (or creation, if never
  // contacted) is older than the quiet window.
  const { data: leads, error: fetchErr } = await supabase
    .from("lead")
    .select("id, campus_id, first_name, email, phone, sms_consent, last_contact_at, created_at, unsubscribe_token")
    .in("stage", ["new", "contacted", "engaged"])
    .is("application_id", null)
    .is("reengaged_at", null)
    .is("unsubscribed_at", null) // LG-0.1: never re-engage an unsubscribed family
    .or(`last_contact_at.lt.${quietCutoff},and(last_contact_at.is.null,created_at.lt.${quietCutoff})`);

  if (fetchErr) {
    console.error("[cron/reengage-leads] fetch", fetchErr.message);
    await recordCronRun("reengage-leads", undefined, true);
    return NextResponse.json({ error: "Failed to fetch quiet leads." }, { status: 500 });
  }

  const checked = leads?.length ?? 0;
  const { getSuppressedEmails } = await import("@/lib/email-compliance");
  const suppressedSet = await getSuppressedEmails(
    (leads ?? []).map((l) => (l.email as string) ?? "")
  );
  let reengaged = 0;
  let errors = 0;

  for (const lead of leads ?? []) {
    try {
      // Atomic claim: only one runner flips reengaged_at from NULL.
      const { data: claimed, error: claimErr } = await supabase
        .from("lead")
        .update({ reengaged_at: nowIso, next_follow_up_at: nowIso })
        .eq("id", lead.id as string)
        .is("reengaged_at", null)
        .select("id");

      if (claimErr) {
        console.error(`[cron/reengage-leads] claim ${lead.id}`, claimErr.message);
        errors++;
        continue;
      }
      if (!claimed || claimed.length === 0) continue;

      // LG-0.1: skip addresses the provider told us are dead or complaining.
      const email = (lead.email as string | null)?.toLowerCase() ?? null;
      if (email && suppressedSet.has(email)) continue;

      await notifyLeadReengagement({
        lead: {
          first_name: lead.first_name as string,
          email: (lead.email as string | null) ?? null,
          phone: (lead.phone as string | null) ?? null,
          sms_consent: lead.sms_consent === true,
        },
        campusId: lead.campus_id as string,
        unsubscribeToken: (lead.unsubscribe_token as string | null) ?? null,
      });

      await supabase.from("lead_activity").insert({
        lead_id: lead.id as string,
        activity_type: "reengagement",
        body: `Automated re-engagement sent after ${QUIET_DAYS}+ quiet days.`,
      });

      reengaged++;
    } catch (err) {
      console.error(
        `[cron/reengage-leads] ${lead.id}`,
        err instanceof Error ? err.message : err
      );
      errors++;
    }
  }

  console.log(
    `[cron/reengage-leads] Checked ${checked} quiet leads, re-engaged ${reengaged}, errors ${errors}`
  );
  await recordCronRun("reengage-leads", { checked, reengaged, errors });
  return NextResponse.json({ checked, reengaged, errors, timestamp: nowIso });
}
