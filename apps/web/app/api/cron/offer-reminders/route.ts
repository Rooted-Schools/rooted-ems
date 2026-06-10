import { createServerClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { notifyFamilyOfferExpiringSoon } from "@/lib/notify";

/**
 * Cron endpoint to remind families about pending offers that expire within
 * the next 48 hours. Sends the in-app notification + bilingual email via
 * notifyFamilyOfferExpiringSoon, at most once per offer.
 *
 * Runs on a schedule configured in vercel.json (daily at 15:00 UTC, morning US time).
 * Can also be triggered manually by staff via GET /api/cron/offer-reminders.
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

  const supabase = await createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  // Pending offers expiring within 48h that haven't been reminded yet.
  // Note: reminder_sent_at is from migration 00026 and isn't in the generated
  // DB types yet, hence the filter/update casts below.
  const { data: offers, error: fetchErr } = await supabase
    .from("offer")
    .select(
      "id, application_id, campus_id, expires_at, application:application_id (student:student_id (first_name, last_name))"
    )
    .eq("status", "pending")
    .gte("expires_at", nowIso)
    .lte("expires_at", cutoffIso)
    .is("reminder_sent_at" as never, null);

  if (fetchErr) {
    console.error("[cron/offer-reminders] fetch", fetchErr.message);
    return NextResponse.json(
      { error: "Failed to fetch expiring offers." },
      { status: 500 }
    );
  }

  const checked = offers?.length ?? 0;
  let reminded = 0;
  let errors = 0;

  for (const offer of offers ?? []) {
    try {
      // Atomic claim: only one runner can flip reminder_sent_at from NULL.
      // If no row comes back, another run already claimed this offer — skip.
      const { data: claimed, error: claimErr } = await supabase
        .from("offer")
        // reminder_sent_at not in generated types yet (migration 00026)
        .update({ reminder_sent_at: nowIso } as never)
        .eq("id", offer.id as string)
        .is("reminder_sent_at" as never, null)
        .select("id");

      if (claimErr) {
        console.error(`[cron/offer-reminders] claim ${offer.id}`, claimErr.message);
        errors++;
        continue;
      }

      if (!claimed || claimed.length === 0) {
        // Already reminded by a concurrent/previous run — not an error.
        continue;
      }

      const student = (offer.application as unknown as {
        student: { first_name: string; last_name: string } | null;
      } | null)?.student ?? null;
      const studentName = student
        ? `${student.first_name} ${student.last_name}`
        : undefined;

      await notifyFamilyOfferExpiringSoon({
        applicationId: offer.application_id as string,
        offerId: offer.id as string,
        studentName,
        expiresAt: offer.expires_at as string,
        campusId: (offer.campus_id as string | null) ?? undefined,
      });

      reminded++;
    } catch (err) {
      console.error(
        `[cron/offer-reminders] notify ${offer.id}`,
        err instanceof Error ? err.message : err
      );
      errors++;
    }
  }

  console.log(
    `[cron/offer-reminders] Checked ${checked} offers, reminded ${reminded}, errors ${errors}`
  );

  return NextResponse.json({ checked, reminded, errors, timestamp: nowIso });
}
