/**
 * Pure helpers for the campaign detail page
 * (app/staff/recruitment/campaigns/[id]) — status grouping and delivery-state
 * resolution, kept dependency-free (no Supabase client, no next/headers) so
 * both the "use client" component and lib/queries/campaign-detail.ts can
 * import them directly, and so they're unit-testable without mocking the
 * database. Same pattern as lib/lead-call-outcomes.ts.
 */

// ─── Recipient status grouping ──────────────────────────────────────────────

export interface RecipientStatusRow {
  status: string;
}

export interface RecipientStatusSummary {
  total: number;
  byStatus: Record<string, number>;
}

/**
 * Groups real lead_campaign_recipient rows by whatever is actually in their
 * `status` column. `lead_campaign_recipient.status` is a plain TEXT column
 * (no CHECK constraint) — the send cron currently writes 'pending' | 'sent' |
 * 'failed' | 'suppressed', but this reduces the rows as given rather than
 * assuming that list is complete, so a future status still gets counted
 * instead of silently dropped or miscounted as something it isn't.
 */
export function summarizeRecipientStatuses(rows: RecipientStatusRow[]): RecipientStatusSummary {
  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }
  return { total: rows.length, byStatus };
}

export const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  suppressed: "Suppressed",
};

/** Known label, or the raw status capitalized — never a guess at meaning. */
export function recipientStatusLabel(status: string): string {
  return RECIPIENT_STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

// ─── Delivery evidence ───────────────────────────────────────────────────────

export interface EmailEventEvidence {
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

export type DeliveryState =
  | { kind: "not_sent" }
  | { kind: "failed" }
  | { kind: "skipped"; status: string }
  | { kind: "sent_unrecorded" }
  | { kind: "delivered" }
  | { kind: "opened" }
  | { kind: "clicked" };

/**
 * What can honestly be said about ONE recipient's delivery, from the
 * recipient row's own status plus (if one was matched) an email_event row.
 *
 * - 'pending' and 'failed' need no lookup — the send cron already answers
 *   those definitively; they never fall through to the "sent" branches.
 * - Any other non-'sent' status (e.g. 'suppressed') is reported by its own
 *   name via `kind: "skipped"` rather than folded into an existing bucket —
 *   inventing a bucket for it here would be exactly the kind of gap-filling
 *   this file exists to avoid.
 * - 'sent' with no matched email_event, or a matched event whose delivered/
 *   opened/clicked timestamps are all still null, resolves to
 *   "sent_unrecorded": sent is confirmed, but there is no delivery evidence
 *   to show. Never reported as a failure, never as a fabricated zero.
 * - When more than one signal is present, the strongest one wins (clicked >
 *   opened > delivered) since each implies the ones before it.
 */
export function resolveDeliveryState(
  recipientStatus: string,
  event: EmailEventEvidence | null
): DeliveryState {
  if (recipientStatus === "pending") return { kind: "not_sent" };
  if (recipientStatus === "failed") return { kind: "failed" };
  if (recipientStatus !== "sent") return { kind: "skipped", status: recipientStatus };
  if (event?.clicked_at) return { kind: "clicked" };
  if (event?.opened_at) return { kind: "opened" };
  if (event?.delivered_at) return { kind: "delivered" };
  return { kind: "sent_unrecorded" };
}
