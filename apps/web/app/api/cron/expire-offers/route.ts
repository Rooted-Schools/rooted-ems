import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { expireOffer, promoteFromWaitlist } from "@/lib/mutations";

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
    return NextResponse.json(
      { error: "Failed to fetch expired offers." },
      { status: 500 }
    );
  }

  if (!expiredOffers || expiredOffers.length === 0) {
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

    // Find the waitlist for this specific campus+grade, then fetch the
    // top-ranked unserved position. Scoped at the DB layer so we never
    // miss a candidate because of an unrelated global limit.
    const { data: waitlistRows } = await supabase
      .from("waitlist")
      .select("id")
      .eq("campus_id", offer.campus_id)
      .eq("grade_level_id", offer.grade_level_id)
      .limit(1);

    const waitlistId = waitlistRows?.[0]?.id as string | undefined;

    let nextPosition: { id: string } | null = null;
    if (waitlistId) {
      const { data: posRows } = await supabase
        .from("waitlist_position")
        .select("id")
        .eq("waitlist_id", waitlistId)
        .is("removed_at", null)
        .is("promoted_at", null)
        .order("position_number", { ascending: true })
        .limit(1);
      nextPosition = posRows?.[0] ?? null;
    }

    if (nextPosition) {
      // Give the promoted student 7 days to respond
      const sevenDays = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      // offered_by is a UUID column: an auto-promotion has no real user
      // behind it, so it stays null rather than carrying a sentinel string.
      const promoteResult = await promoteFromWaitlist(
        nextPosition.id as string,
        null,
        sevenDays
      );

      if (!promoteResult.error && promoteResult.data) {
        promotedCount++;
      }
    }
  }

  console.log(
    `[cron/expire-offers] Expired ${expiredCount} offers, promoted ${promotedCount} from waitlist`
  );

  return NextResponse.json({
    expired: expiredCount,
    promoted: promotedCount,
    timestamp: now,
  });
}
