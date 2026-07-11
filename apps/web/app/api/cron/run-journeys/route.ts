import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import {
  renderCampaignEmail,
  UNSUB_PLACEHOLDER,
  type CampaignPayload,
  type CampaignTemplateKey,
} from "@/lib/email-templates";
import { getSuppressedEmails, unsubscribeUrl } from "@/lib/email-compliance";

/**
 * Journey engine daily runner (LG-2). Advances every active enrollment whose
 * next step is due: renders the step template, sends it (with suppression +
 * one-click unsubscribe), logs it on the lead timeline, and schedules the
 * next step — or completes the journey when there are no more steps.
 *
 * Exits are enforced by hooks elsewhere (apply/RSVP/call/unsubscribe), but
 * this cron re-checks suppression and unsubscribe as a backstop so a stale
 * enrollment can never email someone it shouldn't.
 *
 * Runs daily (vercel.json, 16:30 UTC). Hard per-run cap.
 * Auth: CRON_SECRET via Authorization header.
 */

const RUN_CAP = 800;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("journey_enrollment")
    .select(
      `id, journey_id, lead_id, current_step,
       journey:journey_id (name),
       lead:lead_id (email, unsubscribed_at, unsubscribe_token, campus_id, first_name, application_id, campus:campus_id (name, email))`
    )
    .eq("status", "active")
    .lte("next_step_at", nowIso)
    .order("next_step_at", { ascending: true })
    .limit(RUN_CAP);

  if (error) {
    console.error("[cron/run-journeys] fetch", error.message);
    return NextResponse.json({ error: "Failed to fetch enrollments." }, { status: 500 });
  }

  const suppressed = await getSuppressedEmails(
    (due ?? []).map((e) => {
      const l = e.lead as unknown as { email?: string } | null;
      return l?.email ?? "";
    })
  );

  let sent = 0;
  let completed = 0;
  let exited = 0;

  for (const enr of due ?? []) {
    const lead = enr.lead as unknown as {
      email: string | null;
      unsubscribed_at: string | null;
      unsubscribe_token: string | null;
      first_name: string | null;
      campus: { name: string; email: string | null } | null;
    } | null;

    // Backstop exit checks.
    if (!lead?.email || lead.unsubscribed_at || suppressed.has(lead.email.toLowerCase())) {
      await supabase
        .from("journey_enrollment")
        .update({ status: "exited", exit_reason: "unsubscribed", ended_at: nowIso })
        .eq("id", enr.id as string);
      exited++;
      continue;
    }

    const nextOrder = (enr.current_step as number) + 1;
    const { data: step } = await supabase
      .from("journey_step")
      .select("template_key, payload")
      .eq("journey_id", enr.journey_id as string)
      .eq("step_order", nextOrder)
      .maybeSingle();

    if (!step) {
      await supabase
        .from("journey_enrollment")
        .update({ status: "completed", ended_at: nowIso })
        .eq("id", enr.id as string);
      completed++;
      continue;
    }

    const campusName = lead.campus?.name ?? "your school";
    const template = renderCampaignEmail(
      step.template_key as CampaignTemplateKey,
      (step.payload ?? {}) as CampaignPayload,
      campusName
    );
    const unsub = unsubscribeUrl(lead.unsubscribe_token ?? "");

    const result = await sendEmail({
      to: lead.email,
      subject: template.subject,
      html: template.html.replaceAll(UNSUB_PLACEHOLDER, unsub),
      text: template.text.replaceAll(UNSUB_PLACEHOLDER, unsub),
      replyTo: lead.campus?.email ?? undefined,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (!result.ok) {
      if (result.error === "email not configured") break;
      continue; // transient — retry same step next run
    }

    sent++;
    // Schedule the following step, or complete if this was the last.
    const { data: following } = await supabase
      .from("journey_step")
      .select("delay_days")
      .eq("journey_id", enr.journey_id as string)
      .eq("step_order", nextOrder + 1)
      .maybeSingle();

    const updates: Record<string, unknown> = { current_step: nextOrder };
    if (following) {
      updates.next_step_at = new Date(
        Date.now() + ((following.delay_days as number) ?? 1) * 24 * 60 * 60 * 1000
      ).toISOString();
    } else {
      updates.status = "completed";
      updates.ended_at = nowIso;
      completed++;
    }
    await supabase.from("journey_enrollment").update(updates).eq("id", enr.id as string);

    const journeyName = (enr.journey as unknown as { name?: string } | null)?.name ?? "journey";
    await Promise.all([
      supabase.from("lead_activity").insert({
        lead_id: enr.lead_id as string,
        activity_type: "email",
        body: `Journey step sent: "${journeyName}" (step ${nextOrder}).`,
      }),
      supabase.from("lead").update({ last_contact_at: nowIso }).eq("id", enr.lead_id as string),
    ]);
  }

  console.log(`[cron/run-journeys] sent ${sent}, completed ${completed}, exited ${exited}`);
  return NextResponse.json({ sent, completed, exited, timestamp: nowIso });
}
