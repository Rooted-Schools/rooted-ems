import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { recordCronRun } from "@/lib/cron-heartbeat";
import { expireOffer } from "@/lib/mutations";
// Imported directly rather than through the barrel: the barrel is shared and
// this is the one caller outside lib/mutations that needs it.
import { promoteNextWaitlistCandidate } from "@/lib/mutations/waitlist";

/**
 * Cron endpoint to expire pending offers that are past their deadline,
 * then auto-promote the next waitlist candidate for each vacated seat.
 *
 * Runs on a schedule configured in vercel.json (daily at 02:00 UTC).
 * Can also be triggered manually by staff via GET /api/cron/expire-offers.
 *
 * Authentication: set CRON_SECRET env var and pass via Authorization header as "Bearer <secret>".
 */
export async function GET(request: NextRequest) {
  // Basic secret check (configure CRON_SECRET env var in Vercel)
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
  const now = new Date().toISOString();

  // Find all pending offers that have expired
  const { data: expiredOffers, error: fetchErr } = await supabase
    .from("offer")
    .select("id, application_id, campus_id, grade_level_id")
    .eq("status", "pending")
    .lt("expires_at", now);

  if (fetchErr) {
    console.error("[cron/expire-offers] fetch", fetchErr.message);
    await recordCronRun("expire-offers", undefined, true);
    return NextResponse.json(
      { error: "Failed to fetch expired offers." },
      { status: 500 }
    );
  }

  // Heartbeat on every return path, including this one. A no-op run is still a
  // run, and the preflight panel reads the absence of a heartbeat as "the
  // automation has never run" — which then reported a healthy cron as missing
  // on any day nothing happened to expire.
  if (!expiredOffers || expiredOffers.length === 0) {
    await recordCronRun("expire-offers", { expired: 0, promoted: 0 });
    return NextResponse.json({ expired: 0, promoted: 0 });
  }

  let expiredCount = 0;
  let promotedCount = 0;

  for (const offer of expiredOffers) {
    // Route through the mutation so the audit event fires for every expiry
    const expireResult = await expireOffer(offer.id as string);

    if (expireResult.error) {
      console.error(`[cron/expire-offers] expire ${offer.id}`, expireResult.error);
      continue;
    }

    expiredCount++;

    // One shared promotion path for the cron, the inline decline/revoke path,
    // and enrollment withdrawals. It resolves the waitlist by campus, grade
    // AND school year (never campus + grade alone, which reaches the wrong
    // year's waitlist as soon as two years are live), and takes the response
    // deadline from the campus's adopted policy rather than a hardcoded week.
    if (offer.campus_id && offer.grade_level_id) {
      const promoted = await promoteNextWaitlistCandidate({
        campusId: offer.campus_id as string,
        gradeLevelId: offer.grade_level_id as string,
        vacatedApplicationId: (offer.application_id as string | null) ?? null,
      });
      if (promoted) promotedCount++;
    }
  }

  console.log(
    `[cron/expire-offers] Expired ${expiredCount} offers, promoted ${promotedCount} from waitlist`
  );
  await recordCronRun("expire-offers", { expired: expiredCount, promoted: promotedCount });
  return NextResponse.json({
    expired: expiredCount,
    promoted: promotedCount,
    timestamp: now,
  });
}
