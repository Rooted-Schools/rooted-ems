export const runtime = "edge";

import { createServerClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { expireOffer, promoteFromWaitlist } from "@/lib/mutations";

/**
 * Cron endpoint to expire pending offers that are past their deadline,
 * then auto-promote the next waitlist candidate for each vacated seat.
 *
 * Runs on a schedule configured in vercel.json (daily at 02:00 UTC).
 * Can also be triggered manually by staff via GET /api/cron/expire-offers.
 *
 * Authentication: set CRON_SECRET env var and pass ?secret=<value>,
 * or Vercel's built-in cron auth headers (x-vercel-signature) if preferred.
 */
export async function GET(request: NextRequest) {
  // Basic secret check (configure CRON_SECRET env var in Vercel)
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();
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

    // Try to promote the next person from the waitlist for this campus/grade
    const { data: waitlistPos } = await supabase
      .from("waitlist_position")
      .select(`
        id,
        waitlist:waitlist_id (campus_id, grade_level_id)
      `)
      .is("removed_at", null)
      .is("promoted_at", null)
      .order("position_number", { ascending: true })
      .limit(50);

    // Find the first active position matching this campus/grade
    const nextPosition = (waitlistPos ?? []).find(
      (p: Record<string, unknown>) => {
        const wl = p.waitlist as unknown as Record<string, string> | null;
        return (
          wl?.campus_id === offer.campus_id &&
          wl?.grade_level_id === offer.grade_level_id
        );
      }
    );

    if (nextPosition) {
      // Give the promoted student 7 days to respond
      const sevenDays = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const promoteResult = await promoteFromWaitlist(
        nextPosition.id as string,
        "system", // offered_by: system auto-promote
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
