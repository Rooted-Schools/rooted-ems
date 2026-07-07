import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import {
  renderCampaignEmail,
  type CampaignPayload,
  type CampaignTemplateKey,
} from "@/lib/email-templates";

/**
 * Cron endpoint that drains active email campaigns at each campaign's
 * daily_limit per day. This throttle is the whole point: a 1,200-family
 * campaign goes out over ~8 days instead of one reputation-burning burst,
 * and every send lands on the lead's activity timeline.
 *
 * Runs daily (vercel.json, 15:30 UTC ≈ mid-morning US). A hard per-run cap
 * bounds total volume across campaigns.
 *
 * Authentication: CRON_SECRET via Authorization header as "Bearer <secret>".
 */

const RUN_CAP = 450; // total sends per run across all campaigns

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
  const nowIso = new Date().toISOString();

  const { data: campaigns, error: fetchErr } = await supabase
    .from("lead_campaign")
    .select("id, campus_id, name, template_key, payload, daily_limit, sent_count, total_recipients, campus:campus_id (name, email)")
    .eq("status", "sending")
    .order("created_at", { ascending: true });

  if (fetchErr) {
    console.error("[cron/send-campaigns] fetch", fetchErr.message);
    return NextResponse.json({ error: "Failed to fetch campaigns." }, { status: 500 });
  }

  let totalSent = 0;
  let totalFailed = 0;
  const perCampaign: Record<string, number> = {};

  for (const campaign of campaigns ?? []) {
    if (totalSent >= RUN_CAP) break;

    const campus = campaign.campus as unknown as { name: string; email: string | null } | null;
    const campusName = campus?.name ?? "your school";
    const template = renderCampaignEmail(
      campaign.template_key as CampaignTemplateKey,
      (campaign.payload ?? {}) as CampaignPayload,
      campusName
    );

    const batchSize = Math.min(campaign.daily_limit as number, RUN_CAP - totalSent);
    const { data: recipients, error: recErr } = await supabase
      .from("lead_campaign_recipient")
      .select("id, lead_id, email")
      .eq("campaign_id", campaign.id as string)
      .eq("status", "pending")
      .limit(batchSize);

    if (recErr) {
      console.error(`[cron/send-campaigns] recipients ${campaign.id}`, recErr.message);
      continue;
    }

    if (!recipients || recipients.length === 0) {
      // Fully drained — close it out.
      await supabase
        .from("lead_campaign")
        .update({ status: "complete", completed_at: nowIso })
        .eq("id", campaign.id as string)
        .eq("status", "sending");
      continue;
    }

    let sent = 0;
    for (const recipient of recipients) {
      // Claim before sending so a concurrent/retried run can't double-send.
      const { data: claimed } = await supabase
        .from("lead_campaign_recipient")
        .update({ status: "sent", sent_at: nowIso })
        .eq("id", recipient.id as string)
        .eq("status", "pending")
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const result = await sendEmail({
        to: recipient.email as string,
        subject: template.subject,
        html: template.html,
        text: template.text,
        replyTo: campus?.email ?? undefined,
      });

      if (result.ok) {
        sent++;
        await Promise.all([
          supabase.from("lead_activity").insert({
            lead_id: recipient.lead_id as string,
            activity_type: "email",
            body: `Campaign email sent: "${campaign.name}".`,
          }),
          supabase
            .from("lead")
            .update({ last_contact_at: nowIso })
            .eq("id", recipient.lead_id as string),
        ]);
      } else {
        totalFailed++;
        await supabase
          .from("lead_campaign_recipient")
          .update({ status: "failed" })
          .eq("id", recipient.id as string);
        if (result.error === "email not configured") break; // no point continuing
      }
    }

    totalSent += sent;
    perCampaign[campaign.name as string] = sent;
    await supabase
      .from("lead_campaign")
      .update({ sent_count: (campaign.sent_count as number) + sent })
      .eq("id", campaign.id as string);
  }

  console.log(
    `[cron/send-campaigns] sent ${totalSent}, failed ${totalFailed}`,
    perCampaign
  );

  return NextResponse.json({ sent: totalSent, failed: totalFailed, perCampaign, timestamp: nowIso });
}
