import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { suppressEmail } from "@/lib/email-compliance";
// Type-only — erased at compile time, so the lazy runtime `import()` below
// (kept for the same reason it was lazy before) is unaffected.
import type { createServiceRoleClient } from "@rooted-ems/database/server";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Resend webhook receiver (LG-0.1 + LG-2 engagement, migration 00045;
 * two-way email, migration 00046).
 *
 * Handles delivery-health events — email.bounced and email.complained go
 * straight to the suppression list so no bulk sender ever emails that
 * address again.
 *
 * Also handles email.delivered / email.opened / email.clicked: matched by
 * Resend's message id (`data.email_id`) against `email_event` (the row
 * lib/email.ts wrote at send time when a caller passed `meta`), stamping
 * delivered_at/opened_at/clicked_at (first-occurrence only) and incrementing
 * open_count/click_count on every occurrence. On the FIRST open or click for
 * a send with a lead_id, a lead_activity row is written so it shows on the
 * family timeline and journey roster. Entirely graceful when migration 00045
 * hasn't been applied yet, or when the id doesn't match any row (unknown ids
 * are ignored, never a 500 — Resend would just retry into the same no-op).
 *
 * Also handles email.received (inbound — 00046): a family replying to any
 * system email that carried INBOUND_REPLY_ADDRESS as its Reply-To. Built
 * against Resend's documented inbound receiving feature — see the header
 * comment in lib/inbound-email.ts for the doc URLs and the exact assumed
 * payload shape. IMPORTANT: per Resend's docs, the email.received webhook
 * event carries metadata only (from/to/subject/email_id), not the body — the
 * body is fetched separately via GET /emails/receiving/{email_id}
 * (fetchReceivedEmailBody in lib/inbound-email.ts) before handleInboundEmail
 * is called. Verified with the SAME Svix signature check as every other
 * event on this endpoint — Resend does not document a separate endpoint or
 * verification scheme for inbound, so no new endpoint was added.
 *
 * Security: Resend signs webhooks with the Svix scheme. Verification is
 * implemented dependency-free below. Env-gated on RESEND_WEBHOOK_SECRET —
 * without it the endpoint refuses everything (fail closed).
 */

function verifySvix(secret: string, id: string, timestamp: string, payload: string, signatureHeader: string): boolean {
  try {
    // Secret format: whsec_<base64 key>
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signedContent = `${id}.${timestamp}.${payload}`;
    const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
    // Header may carry multiple space-separated "v1,<sig>" entries.
    return signatureHeader.split(" ").some((part) => {
      const sig = part.split(",")[1];
      return (
        !!sig &&
        sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      );
    });
  } catch {
    return false;
  }
}

/** True when a Postgres error means "the table/relation doesn't exist yet" — same check as lib/email.ts. */
function isMissingEmailEventTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

/**
 * Match a delivery/open/click event to the `email_event` row lib/email.ts
 * wrote at send time (migration 00045), stamp it, and — on the first open or
 * first click for a send with a lead_id — log it to the family timeline.
 * Never throws; degrades to a silent no-op when the migration isn't applied
 * yet or the id doesn't match any row (both are expected, ordinary states,
 * not errors worth a log line on every webhook delivery).
 */
async function recordEngagementEvent(
  supabase: ServiceRoleClient,
  type: "email.delivered" | "email.opened" | "email.clicked",
  resendId: string | undefined
): Promise<void> {
  if (!resendId) return;
  try {
    const { data: existing, error: fetchError } = await supabase
      .from("email_event")
      .select("id, lead_id, subject, delivered_at, opened_at, clicked_at, open_count, click_count")
      .eq("resend_id", resendId)
      .maybeSingle();

    if (fetchError) {
      if (!isMissingEmailEventTable(fetchError)) {
        console.error("[webhooks/resend] email_event lookup failed", fetchError.message);
      }
      return;
    }
    if (!existing) return; // unknown id — ignore, never 500

    const row = existing as {
      id: string;
      lead_id: string | null;
      subject: string | null;
      delivered_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      open_count: number | null;
      click_count: number | null;
    };

    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    let firstOpen = false;
    let firstClick = false;

    if (type === "email.delivered" && !row.delivered_at) {
      updates.delivered_at = nowIso;
    }
    if (type === "email.opened") {
      if (!row.opened_at) {
        updates.opened_at = nowIso;
        firstOpen = true;
      }
      updates.open_count = (row.open_count ?? 0) + 1;
    }
    if (type === "email.clicked") {
      if (!row.clicked_at) {
        updates.clicked_at = nowIso;
        firstClick = true;
      }
      updates.click_count = (row.click_count ?? 0) + 1;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("email_event").update(updates).eq("id", row.id);
    }

    if ((firstOpen || firstClick) && row.lead_id) {
      const label = firstClick ? "Clicked" : "Opened";
      await supabase.from("lead_activity").insert({
        lead_id: row.lead_id,
        activity_type: "email",
        body: `${label}: ${row.subject ?? "email"}`,
      });
    }
  } catch (err) {
    console.error("[webhooks/resend] engagement tracking threw", err instanceof Error ? err.message : err);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  const payload = await request.text();

  if (!id || !timestamp || !signature || !verifySvix(secret, id, timestamp, payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Reject stale deliveries (replay protection, 5-minute window).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    return NextResponse.json({ error: "Stale timestamp" }, { status: 401 });
  }

  let event: {
    type?: string;
    data?: {
      to?: string[];
      bounce?: { subType?: string };
      email_id?: string;
      // email.received (00046) — tolerant of whatever else Resend sends;
      // unknown fields are simply never read.
      from?: string;
      subject?: string;
      message_id?: string;
    };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const recipients = event.data?.to ?? [];

  if (event.type === "email.received") {
    // Malformed/incomplete payload → acknowledge, do nothing. A family
    // reply we can't even identify a sender for isn't safe to guess at.
    const from = event.data?.from;
    if (!from) return NextResponse.json({ ok: true });

    const { handleInboundEmail, fetchReceivedEmailBody } = await import("@/lib/inbound-email");
    const emailId = event.data?.email_id;
    const text = emailId ? await fetchReceivedEmailBody(emailId) : null;

    try {
      await handleInboundEmail({
        fromEmail: from,
        toEmail: recipients[0],
        subject: event.data?.subject,
        text: text ?? undefined,
        providerId: emailId ?? event.data?.message_id,
      });
    } catch (err) {
      // handleInboundEmail already never throws, but belt-and-braces so a
      // truly unexpected failure still returns 200 rather than a retry storm.
      console.error("[webhooks/resend] email.received handler failed", err);
    }
    return NextResponse.json({ ok: true });
  }

  // LG-2 engagement tracking: opens/clicks land on the lead so journeys and
  // the lead detail reflect real interest.
  if (event.type === "email.opened" || event.type === "email.clicked") {
    const { createServiceRoleClient } = await import("@rooted-ems/database/server");
    const supabase = createServiceRoleClient();
    const col = event.type === "email.clicked" ? "last_email_clicked_at" : "last_email_opened_at";
    for (const to of recipients) {
      await supabase.from("lead").update({ [col]: new Date().toISOString() }).ilike("email", to.toLowerCase());
    }
    await recordEngagementEvent(supabase, event.type, event.data?.email_id);
    return NextResponse.json({ ok: true });
  }

  if (event.type === "email.delivered") {
    const { createServiceRoleClient } = await import("@rooted-ems/database/server");
    const supabase = createServiceRoleClient();
    await recordEngagementEvent(supabase, event.type, event.data?.email_id);
    return NextResponse.json({ ok: true });
  }

  if (event.type === "email.bounced") {
    // Suppress hard bounces; soft bounces (full mailbox etc.) get grace.
    const subType = event.data?.bounce?.subType ?? "";
    const isHard = !/mailboxfull|messagetoolarge|contentrejected|attachmentrejected/i.test(subType);
    if (isHard) {
      for (const to of recipients) await suppressEmail(to, "bounce", subType || "hard bounce");
    }
  } else if (event.type === "email.complained") {
    for (const to of recipients) await suppressEmail(to, "complaint", "recipient marked as spam");
  }
  // Any other event type (e.g. email.sent, email.delivery_delayed) is
  // acknowledged silently — nothing in this system consumes it yet.

  return NextResponse.json({ ok: true });
}
