import { createServerClient } from "@rooted-ems/database/server";
import { summarizeRecipientStatuses, type RecipientStatusSummary } from "@/lib/campaign-recipients";

/**
 * Queries backing the campaign detail page
 * (app/staff/recruitment/campaigns/[id]) — what was sent, to whom, and what
 * evidence exists that it arrived.
 *
 * All reads use the user-scoped client (RLS), same pattern as
 * lib/queries/leads.ts getCampaigns: `campaign_staff` / `campaign_recipient_staff`
 * / `email_event_staff_read` already restrict rows to campuses the caller
 * holds a role on, so a wrong-campus id resolves to "no row" here exactly
 * the same way a nonexistent id does — the page's notFound() gate stays
 * unprobeable without a second, redundant filter.
 */

// ─── Campaign ────────────────────────────────────────────────────────────────

export interface CampaignDetail {
  id: string;
  campus_id: string;
  campus_name: string;
  name: string;
  template_key: string;
  payload: Record<string, unknown>;
  audience_stage: string;
  status: string;
  daily_limit: number;
  total_recipients: number;
  sent_count: number;
  created_at: string;
  completed_at: string | null;
}

export async function getCampaignDetail(id: string): Promise<CampaignDetail | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("lead_campaign")
    .select(
      "id, campus_id, name, template_key, payload, audience_stage, status, daily_limit, total_recipients, sent_count, created_at, completed_at, campus:campus_id (name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getCampaignDetail]", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const campus = row.campus as { name: string } | null;
  return {
    id: row.id as string,
    campus_id: row.campus_id as string,
    campus_name: campus?.name ?? "",
    name: row.name as string,
    template_key: row.template_key as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    audience_stage: row.audience_stage as string,
    status: row.status as string,
    daily_limit: row.daily_limit as number,
    total_recipients: row.total_recipients as number,
    sent_count: row.sent_count as number,
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

// ─── Recipient status counts (all recipients, not just the visible page) ────

const COUNT_PAGE_SIZE = 1000;

/**
 * Real per-status recipient counts for the whole campaign, not just the
 * paginated slice shown in the table. Pages through every row (same shape as
 * lib/queries/offer-history.ts getOfferAcceptHistory) so a campaign with
 * thousands of recipients still gets an exact count rather than an estimate
 * from the first page.
 */
export async function getCampaignRecipientStatusCounts(
  campaignId: string
): Promise<RecipientStatusSummary> {
  const supabase = await createServerClient();
  const rows: { status: string }[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("lead_campaign_recipient")
      .select("status")
      .eq("campaign_id", campaignId)
      .order("id")
      .range(page * COUNT_PAGE_SIZE, page * COUNT_PAGE_SIZE + COUNT_PAGE_SIZE - 1);

    if (error) {
      console.error("[getCampaignRecipientStatusCounts]", error.message);
      // A partial page here would understate counts and read as real data —
      // return nothing rather than reason from a truncated sample.
      return { total: 0, byStatus: {} };
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as { status: string }[]));
    if (data.length < COUNT_PAGE_SIZE) break;
  }

  return summarizeRecipientStatuses(rows);
}

// ─── Recipients (paginated) ─────────────────────────────────────────────────

export interface CampaignRecipientRow {
  id: string;
  lead_id: string;
  email: string;
  status: string;
  sent_at: string | null;
}

export interface CampaignRecipientsPage {
  rows: CampaignRecipientRow[];
  total: number;
}

/** One page of recipients, ordered by email for stable pagination. */
export async function getCampaignRecipientsPage(
  campaignId: string,
  page: number,
  pageSize: number
): Promise<CampaignRecipientsPage> {
  const supabase = await createServerClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("lead_campaign_recipient")
    .select("id, lead_id, email, status, sent_at", { count: "exact" })
    .eq("campaign_id", campaignId)
    .order("email", { ascending: true })
    .range(from, to);

  if (error) {
    console.error("[getCampaignRecipientsPage]", error.message);
    return { rows: [], total: 0 };
  }

  return { rows: (data ?? []) as CampaignRecipientRow[], total: count ?? 0 };
}

// ─── Delivery evidence ───────────────────────────────────────────────────────

export interface DeliveryEvidenceRow {
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

/**
 * Best-effort delivery evidence for a page of recipients, matched against
 * `email_event` (migration 00045). There is no `campaign_id` column on
 * email_event to join on directly, so this matches on what IS there:
 * `lead_id` (who), `kind = 'campaign'` (a batch send, not a journey step or
 * transactional email), the campaign's own rendered subject line (what),
 * and `sent_at >= <campaign created_at>` (a send can't predate the campaign
 * that produced it). Verified against the one production campaign: every one
 * of its 111 email_event rows matches exactly one recipient this way.
 *
 * This is a match, not a foreign key — if two campaigns to the same lead
 * ever share an identical subject, both their email_event rows satisfy the
 * filter above and the most recently sent one is kept, on the theory that a
 * later send is the more likely match for "this" campaign. That situation
 * has not been observed in production data.
 */
export async function getCampaignDeliveryEvidence(
  leadIds: string[],
  subject: string,
  sentAfter: string
): Promise<Map<string, DeliveryEvidenceRow>> {
  if (leadIds.length === 0) return new Map();

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("email_event")
    .select("lead_id, sent_at, delivered_at, opened_at, clicked_at")
    .eq("kind", "campaign")
    .eq("subject", subject)
    .gte("sent_at", sentAfter)
    .in("lead_id", leadIds);

  if (error) {
    console.error("[getCampaignDeliveryEvidence]", error.message);
    return new Map();
  }

  const map = new Map<string, DeliveryEvidenceRow & { sent_at: string }>();
  for (const row of (data ?? []) as {
    lead_id: string;
    sent_at: string;
    delivered_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
  }[]) {
    const existing = map.get(row.lead_id);
    if (!existing || row.sent_at > existing.sent_at) {
      map.set(row.lead_id, row);
    }
  }
  return map;
}
