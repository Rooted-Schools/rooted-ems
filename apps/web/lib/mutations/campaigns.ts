import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import {
  renderCampaignEmail,
  type CampaignPayload,
  type CampaignTemplateKey,
} from "@/lib/email-templates";

// ─── Types ─────────────────────────────────────────────

export interface CreateCampaignInput {
  campus_id: string;
  name: string;
  template_key: CampaignTemplateKey;
  payload: CampaignPayload;
  /** 'open' (new+contacted+engaged) or a single stage. */
  audience_stage: "open" | "new" | "contacted" | "engaged";
  daily_limit: number;
  /** When provided, the audience is exactly these leads (individually selected
   *  in the recruitment list) instead of a whole stage. Still filtered to
   *  emailable, non-unsubscribed, non-suppressed addresses. */
  lead_ids?: string[];
}

const AUDIENCE_STAGES: Record<string, string[]> = {
  open: ["new", "contacted", "engaged"],
  new: ["new"],
  contacted: ["contacted"],
  engaged: ["engaged"],
};

// ─── Mutations (RLS-scoped: staff can only campaign their campuses) ────────

/**
 * Create a campaign and snapshot its recipients. Recipients are frozen at
 * launch (audience edits later don't retarget) and only leads with an email
 * are included. Sending happens in the daily cron, never here — launching a
 * campaign is instant and reversible until the first batch goes out.
 */
export async function createCampaign(
  input: CreateCampaignInput,
  actorId: string
): Promise<MutationResult<{ id: string; recipients: number }>> {
  const supabase = await createServerClient();

  const individual = (input.lead_ids ?? []).filter(Boolean);
  const byIndividual = individual.length > 0;
  const stages = AUDIENCE_STAGES[input.audience_stage];
  if (!byIndividual && !stages) return { data: null, error: "Unknown audience." };
  const dailyLimit = Math.min(Math.max(input.daily_limit || 150, 10), 500);

  // Snapshot the audience (RLS restricts to the caller's campuses).
  // LG-0.1: unsubscribed and suppressed addresses never enter a campaign.
  // Individually-selected recipients replace the stage filter; the same
  // emailable/unsubscribed/suppressed guards still apply so a hand-picked list
  // can never message someone who opted out.
  let audienceQuery = supabase
    .from("lead")
    .select("id, email")
    .eq("campus_id", input.campus_id)
    .not("email", "is", null)
    .is("unsubscribed_at", null);
  audienceQuery = byIndividual
    ? audienceQuery.in("id", individual)
    : audienceQuery.in("stage", stages);
  const { data: rawLeads, error: leadErr } = await audienceQuery;

  if (leadErr) {
    console.error("[createCampaign] audience", leadErr.message);
    return { data: null, error: "Failed to load the audience." };
  }
  const { getSuppressedEmails } = await import("@/lib/email-compliance");
  const suppressedSet = await getSuppressedEmails(
    (rawLeads ?? []).map((l: Record<string, string>) => l.email)
  );
  const leads = (rawLeads ?? []).filter(
    (l: Record<string, string>) => !suppressedSet.has(l.email.toLowerCase())
  );
  if (leads.length === 0) {
    return { data: null, error: "No emailable leads match that audience." };
  }

  const { data: campaign, error } = await supabase
    .from("lead_campaign")
    .insert({
      campus_id: input.campus_id,
      name: input.name.trim().slice(0, 120) || "Untitled campaign",
      template_key: input.template_key,
      payload: input.payload,
      audience_stage: input.audience_stage,
      daily_limit: dailyLimit,
      total_recipients: leads.length,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createCampaign]", error.message);
    return { data: null, error: "Failed to create the campaign." };
  }

  const recipients = leads.map((l: Record<string, string>) => ({
    campaign_id: campaign.id,
    lead_id: l.id,
    email: l.email,
  }));
  const { error: recErr } = await supabase.from("lead_campaign_recipient").insert(recipients);
  if (recErr) {
    console.error("[createCampaign] recipients", recErr.message);
    await supabase.from("lead_campaign").delete().eq("id", campaign.id);
    return { data: null, error: "Failed to enroll recipients." };
  }

  await logAuditEvent({
    table_name: "lead_campaign",
    record_id: campaign.id,
    action: AuditAction.Create,
    actor_id: actorId,
    campus_id: input.campus_id,
    new_data: {
      name: input.name,
      template_key: input.template_key,
      audience_stage: input.audience_stage,
      recipients: leads.length,
      daily_limit: dailyLimit,
    },
  });

  return { data: { id: campaign.id, recipients: leads.length }, error: null };
}

/**
 * Stop a campaign — pending recipients are never sent. Sent emails are sent.
 *
 * `actorId` is the audit trail for the cancellation and must come from the
 * caller's session (see app/staff/recruitment/actions.ts), never from client
 * input.
 */
export async function cancelCampaign(
  campaignId: string,
  actorId: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  // Read the campus before the write so the audit row is filed against the
  // campus that owns the campaign rather than against nothing.
  const { data: campaign } = await supabase
    .from("lead_campaign")
    .select("campus_id")
    .eq("id", campaignId)
    .maybeSingle();

  const { error } = await supabase
    .from("lead_campaign")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "sending");
  if (error) {
    console.error("[cancelCampaign]", error.message);
    return { data: null, error: "Failed to cancel the campaign." };
  }
  await logAuditEvent({
    table_name: "lead_campaign",
    record_id: campaignId,
    action: AuditAction.StatusChange,
    actor_id: actorId,
    campus_id: (campaign?.campus_id as string | null) ?? null,
    new_data: { status: "cancelled" },
  });
  return { data: null, error: null };
}

/**
 * Send a one-off test of a template to the requesting staff member so they
 * can see exactly what families will receive before launching.
 */
export async function sendCampaignTest(
  templateKey: CampaignTemplateKey,
  payload: CampaignPayload,
  campusName: string,
  toEmail: string
): Promise<MutationResult> {
  const template = renderCampaignEmail(templateKey, payload, campusName);
  const result = await sendEmail({
    to: toEmail,
    subject: `[TEST] ${template.subject}`,
    html: template.html,
    text: template.text,
  });
  if (!result.ok) {
    return { data: null, error: result.error === "email not configured" ? "Email is not configured in this environment." : "Test send failed." };
  }
  return { data: null, error: null };
}
