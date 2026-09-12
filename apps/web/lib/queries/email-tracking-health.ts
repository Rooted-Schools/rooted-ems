import { createServiceRoleClient } from "@rooted-ems/database/server";

/**
 * Is the Resend engagement pipe actually live?
 *
 * Two independent things have to be true before delivered/opened/clicked
 * numbers can ever be non-zero, and each fails silently on its own:
 *   1. RESEND_WEBHOOK_SECRET is set, so /api/webhooks/resend can verify and
 *      accept Resend's signed events (a missing/mismatched secret → 401 →
 *      nothing recorded).
 *   2. Events are actually arriving — proven only by a real row in
 *      email_event carrying a delivered_at / opened_at / clicked_at.
 *
 * This reports both so staff can confirm tracking works without guessing from
 * a campaign that happens to read all zeros. It reads only whether the secret
 * is present (never its value) and the timestamps/counts of events — no
 * recipient PII beyond what the campaign pages already surface.
 */

export interface EmailTrackingHealth {
  /** Whether RESEND_WEBHOOK_SECRET is present in this environment. */
  webhookSecretConfigured: boolean;
  /** Most recent event timestamps, null when none of that kind exist yet. */
  lastDeliveredAt: string | null;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  /** All-time counts of events carrying each signal. */
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
}

async function latestTimestamp(
  supabase: ReturnType<typeof createServiceRoleClient>,
  column: "delivered_at" | "opened_at" | "clicked_at"
): Promise<string | null> {
  const { data, error } = await supabase
    .from("email_event")
    .select(column)
    .not(column, "is", null)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[getEmailTrackingHealth] latest ${column}`, error.message);
    return null;
  }
  const row = data as Record<string, string | null> | null;
  return row?.[column] ?? null;
}

async function signalCount(
  supabase: ReturnType<typeof createServiceRoleClient>,
  column: "delivered_at" | "opened_at" | "clicked_at"
): Promise<number> {
  const { count, error } = await supabase
    .from("email_event")
    .select("*", { count: "exact", head: true })
    .not(column, "is", null);

  if (error) {
    console.error(`[getEmailTrackingHealth] count ${column}`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getEmailTrackingHealth(): Promise<EmailTrackingHealth> {
  const supabase = createServiceRoleClient();

  const [
    lastDeliveredAt,
    lastOpenedAt,
    lastClickedAt,
    deliveredCount,
    openedCount,
    clickedCount,
  ] = await Promise.all([
    latestTimestamp(supabase, "delivered_at"),
    latestTimestamp(supabase, "opened_at"),
    latestTimestamp(supabase, "clicked_at"),
    signalCount(supabase, "delivered_at"),
    signalCount(supabase, "opened_at"),
    signalCount(supabase, "clicked_at"),
  ]);

  return {
    webhookSecretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    lastDeliveredAt,
    lastOpenedAt,
    lastClickedAt,
    deliveredCount,
    openedCount,
    clickedCount,
  };
}
