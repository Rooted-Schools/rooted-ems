/**
 * Inbound email — the receiving half of two-way email.
 *
 * Outbound already works (lib/email.ts → Resend REST, fired from
 * lib/notify.ts). A parent's reply used to land at the campus's real inbox
 * and stop there — this app never saw it. This module is what the Resend
 * inbound webhook (app/api/webhooks/resend/route.ts) calls once a delivery
 * has been proven authentic (same Svix verification as every other Resend
 * event) AND the INBOUND_REPLY_ADDRESS choke point (lib/email.ts) has routed
 * a reply here instead of straight to the campus.
 *
 * Built against Resend's documented inbound receiving feature:
 *   - https://resend.com/docs/dashboard/receiving/introduction — enabling
 *     inbound receiving (Resend-managed receiving address, or MX records on
 *     a custom domain/subdomain).
 *   - https://resend.com/docs/dashboard/webhooks/introduction — the
 *     `email.received` webhook event (Dashboard → Webhooks → Add Webhook →
 *     event type `email.received`).
 *
 * IMPORTANT — the webhook payload is metadata only. Per Resend's own
 * documentation, `email.received` carries sender/recipient/subject/
 * attachment-list metadata but NOT the body: "Webhooks do not include the
 * email body, headers, or attachments, only their metadata." The body must
 * be fetched separately with `GET /emails/receiving/{email_id}` (Bearer
 * RESEND_API_KEY). `fetchReceivedEmailBody` below does that fetch. The
 * webhook handler in route.ts is the caller that has the `email_id` and
 * makes this second request before calling handleInboundEmail here.
 *
 * Assumed `email.received` payload shape (tolerant — unknown fields are
 * ignored, and every field below is optional at the call site; a missing
 * field degrades rather than throwing):
 *   {
 *     type: "email.received",
 *     created_at: string,
 *     data: {
 *       email_id: string,
 *       created_at: string,
 *       from: string,            // may be bare or "Name <addr>"
 *       to: string[],
 *       bcc?: string[],
 *       cc?: string[],
 *       received_for?: string[], // present when delivered via an alias/forward
 *       message_id?: string,
 *       subject?: string,
 *       attachments?: unknown[], // metadata only, never fetched here
 *     }
 *   }
 * And the separate GET /emails/receiving/{email_id} response is assumed to
 * carry (at least): { html?: string, text?: string, headers?: object,
 * from?: string, to?: string[], subject?: string }.
 *
 * What handleInboundEmail does, in order (mirrors lib/inbound-sms.ts, the
 * blueprint for this module):
 *   1. Loop guard: if the sender is one of this app's own addresses
 *      (FROM_ADDRESS or INBOUND_REPLY_ADDRESS), stop — this is a forward
 *      loop or a misdirected system email, never a real family reply.
 *   2. Match the sender — guardian by email first (case-insensitive exact),
 *      then CRM lead.
 *   3. Resolve the campus: guardian → their latest application's campus;
 *      lead → lead.campus_id.
 *   4. Store the row in `inbound_email` (graceful when migration 00046
 *      hasn't been applied — log once, continue, never lose the reply).
 *   5. Record it where staff actually look: a lead_activity entry for a
 *      lead (does NOT stamp last_contact_at — see the comment at the call
 *      site), or an internal note on the guardian's latest application.
 *   6. Notify campus staff in-app (unmatched or campus-less → system
 *      admins, exactly like inbound-sms).
 *   7. Forward a full copy to the campus's real inbox with the parent's own
 *      address as the forward's Reply-To, so a human still gets it and can
 *      reply directly to the family. Skipped when there's no campus inbox,
 *      when nobody matched (admins were already notified), or when the
 *      campus inbox IS the parent's address (a same-address self-send would
 *      just be a loop).
 *
 * Rules this module keeps, no exceptions (same as lib/inbound-sms.ts):
 *   - Never throws. The webhook must always be able to return 200; a
 *     database or network problem here is ours, not Resend's, and a
 *     non-200 just buys us a retry storm.
 *   - Never notifies across campuses. An unmatched sender belongs to no
 *     campus, so nobody is paged about it beyond system_admins.
 *   - Never invents data. If `inbound_email` isn't there yet, we say so in
 *     the log and still deliver the reply to staff with the body embedded.
 *
 * Migration dependency: supabase/migrations/00046_inbound_email.sql.
 * Migrations are applied manually, so every path here degrades if absent.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { sendNotification } from "@/lib/mutations/communications";
import { sendEmail, isOwnSendingAddress } from "@/lib/email";

// ─── Resend "get received email body" fetch ──────────────────────────────────

const RECEIVING_ENDPOINT = "https://api.resend.com/emails/receiving";
const FETCH_TIMEOUT_MS = 10_000;

let warnedNotConfiguredForFetch = false;

/**
 * Fetch the full body of a received email from Resend's Receiving API
 * (GET /emails/receiving/{email_id}), since the email.received webhook event
 * itself carries metadata only. Tolerant of whatever shape comes back —
 * `text` is read defensively and everything else is ignored. Never throws;
 * returns null on any failure so the caller can still process the reply
 * using whatever metadata the webhook itself provided.
 */
export async function fetchReceivedEmailBody(emailId: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedNotConfiguredForFetch) {
      console.debug("[fetchReceivedEmailBody] RESEND_API_KEY not set — cannot fetch inbound body");
      warnedNotConfiguredForFetch = true;
    }
    return null;
  }
  try {
    const response = await fetch(`${RECEIVING_ENDPOINT}/${encodeURIComponent(emailId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[fetchReceivedEmailBody] Resend API error", response.status, { emailId });
      return null;
    }
    const body = await response.json().catch(() => null);
    const text = body && typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text
      : null;
    return text;
  } catch (err) {
    console.error("[fetchReceivedEmailBody] request failed", err instanceof Error ? err.message : err, {
      emailId,
    });
    return null;
  }
}

// ─── Email matching ──────────────────────────────────────────────────────────

/**
 * Escape LIKE wildcards before an address goes into an `ilike` filter — same
 * rule as lib/mutations/leads.ts escapeLike. Duplicated rather than imported:
 * that function isn't exported, and this module intentionally doesn't reach
 * into the mutations layer (same reasoning lib/inbound-sms.ts gives for
 * duplicating notifyStaff/getStaffUserIdsForCampus rather than importing
 * lib/notify.ts — inbound and outbound stay decoupled).
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Extract the bare address from "Name <addr>" or return the trimmed input. */
function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

// ─── Missing-table tolerance ─────────────────────────────────────────────────

let warnedMissingInboundTable = false;

/** True when the error says the relation itself is absent, not that a row was. */
function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "42P01" || code === "PGRST205" || code === "PGRST106") return true;
  return /does not exist|schema cache|could not find the table/i.test(error.message ?? "");
}

function warnMissingInboundTable(context: string): void {
  if (warnedMissingInboundTable) return;
  warnedMissingInboundTable = true;
  console.warn(
    `[handleInboundEmail] inbound_email table not present (${context}) — migration 00046_inbound_email.sql has not been applied. ` +
      "Inbound replies are being logged and routed to staff notifications only, not stored."
  );
}

// ─── Public entry point ──────────────────────────────────────────────────────

export interface InboundEmailInput {
  fromEmail: string;
  toEmail?: string;
  subject?: string;
  text?: string;
  /** Resend's `data.email_id` (or `message_id`) when the provider gives us one — the dedupe key. */
  providerId?: string;
}

export interface InboundEmailOutcome {
  /** True when this providerId had already been recorded, or the sender was one of our own addresses. */
  skipped: "duplicate" | "own_address" | "unusable_address" | null;
  matched: "guardian" | "lead" | "none";
  /** True when the message row was actually written. */
  stored: boolean;
  /** True when campus staff were notified. */
  notified: boolean;
  /** True when the campus-inbox forward was sent and confirmed. */
  forwarded: boolean;
}

const UNHANDLED: InboundEmailOutcome = {
  skipped: "unusable_address",
  matched: "none",
  stored: false,
  notified: false,
  forwarded: false,
};

/**
 * Process one inbound email reply. Returns a description of what happened
 * (useful in tests and logs) and never throws — the webhook returns 200
 * regardless.
 */
export async function handleInboundEmail(input: InboundEmailInput): Promise<InboundEmailOutcome> {
  try {
    return await processInboundEmail(input);
  } catch (err) {
    console.error("[handleInboundEmail] unexpected", err);
    return UNHANDLED;
  }
}

async function processInboundEmail({
  fromEmail,
  toEmail,
  subject,
  text,
  providerId,
}: InboundEmailInput): Promise<InboundEmailOutcome> {
  const from = bareAddress(fromEmail ?? "");
  if (!from || !from.includes("@")) {
    console.warn("[handleInboundEmail] unusable From address — ignoring", { providerId });
    return UNHANDLED;
  }

  // ── Loop guard. A reply that appears to come FROM one of our own sending
  // addresses is a forward loop (or a misconfigured alias), never a family.
  if (isOwnSendingAddress(from)) {
    console.warn("[handleInboundEmail] sender matches our own sending address — ignoring", {
      from,
      providerId,
    });
    return { skipped: "own_address", matched: "none", stored: false, notified: false, forwarded: false };
  }

  const supabase = createServiceRoleClient();
  const body = (text ?? "").slice(0, 5000);
  const preview = (text ?? "").trim().slice(0, 200);

  // ── Dedupe by provider id when Resend gives us one. When it doesn't (or
  // the table is absent), we cannot dedupe at all — proceed rather than
  // silently dropping a reply.
  let canStore = true;
  if (providerId) {
    const existing = await supabase.from("inbound_email").select("id").eq("provider_id", providerId).maybeSingle();
    if (existing.error) {
      if (isMissingRelation(existing.error)) {
        warnMissingInboundTable("dedupe lookup");
        canStore = false;
      } else {
        console.error("[handleInboundEmail] dedupe lookup failed", existing.error.message, { providerId });
      }
    } else if (existing.data) {
      return { skipped: "duplicate", matched: "none", stored: false, notified: false, forwarded: false };
    }
  }

  // ── Match the sender: guardian first, then CRM lead. Case-insensitive
  // exact match on the address, same pattern as leads.ts's dedupe lookup.
  const guardianResult = await supabase
    .from("guardian")
    .select("id, first_name, last_name, email")
    .ilike("email", escapeLike(from))
    .limit(1);
  if (guardianResult.error) {
    console.error("[handleInboundEmail] guardian lookup failed", guardianResult.error.message);
  }
  const guardian = (guardianResult.data?.[0] ?? null) as
    | { id: string; first_name?: string; last_name?: string; email?: string }
    | null;

  type LeadMatch = { id: string; first_name?: string; last_name?: string; campus_id?: string | null };
  let lead: LeadMatch | null = null;
  if (!guardian) {
    const leadResult = await supabase
      .from("lead")
      .select("id, first_name, last_name, campus_id")
      .ilike("email", escapeLike(from))
      .limit(1);
    if (leadResult.error) {
      console.error("[handleInboundEmail] lead lookup failed", leadResult.error.message);
    }
    lead = (leadResult.data?.[0] ?? null) as LeadMatch | null;
  }

  const matched: InboundEmailOutcome["matched"] = guardian ? "guardian" : lead ? "lead" : "none";

  // ── Resolve campus + the application to attach a guardian note to.
  let campusId: string | null = null;
  let applicationId: string | null = null;
  if (guardian) {
    const app = await supabase
      .from("application")
      .select("id, campus_id")
      .eq("guardian_id", guardian.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (app.error) {
      console.error("[handleInboundEmail] application lookup failed", app.error.message);
    } else if (app.data) {
      const row = app.data as { id?: string; campus_id?: string | null };
      applicationId = row.id ?? null;
      campusId = row.campus_id ?? null;
    }
  } else if (lead) {
    campusId = lead.campus_id ?? null;
  }

  const displayName =
    [guardian?.first_name ?? lead?.first_name, guardian?.last_name ?? lead?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || null;
  const who = displayName ?? from;

  // ── Store the row.
  const stored = canStore
    ? await storeInboundEmail({
        supabase,
        providerId: providerId ?? null,
        fromEmail: from,
        toEmail: toEmail ?? null,
        subject: subject ?? null,
        bodyText: body,
        guardianId: guardian?.id ?? null,
        leadId: guardian ? null : (lead?.id ?? null),
        campusId,
      })
    : false;

  console.info("[handleInboundEmail] inbound email", {
    providerId: providerId ?? null,
    matched,
    campusId,
    stored,
    subject: subject ?? null,
    body: stored ? undefined : preview,
  });

  // ── LEAD path: log to the family timeline. Deliberately does NOT stamp
  // lead.last_contact_at — logLeadActivity does that for staff-initiated
  // touches (a call, a text, an email WE sent), but a reply is the family
  // reaching out to US. Treating it as "we contacted them" would be
  // backwards and would incorrectly reset any contact-cadence tracking that
  // reads last_contact_at as "when did staff last reach out."
  if (lead) {
    const { error } = await supabase.from("lead_activity").insert({
      lead_id: lead.id,
      activity_type: "email",
      body: `Replied by email: ${subject ?? "(no subject)"}${preview ? `\n\n${preview}` : ""}`,
    });
    if (error) console.error("[handleInboundEmail] lead_activity insert failed", error.message);
  }

  // ── GUARDIAN path: internal note on their latest application, matching
  // the existing "Internal notes" pattern (lib/mutations/notes.ts
  // createNote) — but inserted directly via the service-role client, since
  // createNote requires an authenticated session and this is a webhook.
  // created_by is left NULL ("system/automation", same convention
  // lead_activity.actor_id already uses; see migration 00046's comment on
  // note.created_by).
  if (guardian && applicationId) {
    const { error } = await supabase.from("note").insert({
      entity_type: "application",
      entity_id: applicationId,
      campus_id: campusId,
      content: `Email reply: ${subject ?? "(no subject)"}${preview ? `\n\n${preview}` : ""}`,
      is_internal: true,
      created_by: null,
    });
    if (error) console.error("[handleInboundEmail] note insert failed", error.message);
  }

  // ── Notify campus staff (unmatched or campus-less → system admins).
  // When the sender is enrolled in an active journey, say so in the alert:
  // a mid-sequence reply is exactly when a human should take over, and the
  // journey context saves staff a lookup.
  let journeyContext = "";
  if (matched === "lead" && lead) {
    try {
      const { data: enrollment } = await supabase
        .from("journey_enrollment")
        .select("current_step, journey:journey_id (name)")
        .eq("lead_id", lead.id)
        .eq("status", "active")
        .maybeSingle();
      const journeyName = (enrollment?.journey as unknown as { name?: string } | null)?.name;
      if (journeyName) {
        journeyContext = ` (in ${journeyName}, after step ${enrollment?.current_step ?? 0})`;
      }
    } catch {
      // Context is a nicety — never let it block the alert.
    }
  }
  let notified = false;
  const subjectLine = `Email reply from ${who}${journeyContext}`;
  const notificationBody = preview || "(empty message)";
  const link =
    matched === "lead" && lead
      ? `/staff/recruitment/${lead.id}`
      : applicationId
        ? `/staff/applications/${applicationId}`
        : null;

  if (campusId && link) {
    notified = await notifyCampusStaff({ supabase, campusId, subject: subjectLine, body: notificationBody, link });
  } else if (guardian) {
    notified = await notifySystemAdmins({ supabase, subject: subjectLine, body: notificationBody });
  } else if (matched === "none") {
    notified = await notifySystemAdmins({ supabase, subject: subjectLine, body: notificationBody });
  }

  // ── Forward a full copy to the campus's real inbox. Skipped when there's
  // no campus inbox to send to, or nobody matched at all (admins already
  // got the in-app alert above and there's no "family" inbox in play).
  //
  // Campus-native mode: when INBOUND_REPLY_ADDRESS is unset, outbound
  // Reply-To is the campus inbox itself and inbound copies reach us via the
  // campus's own Google forwarding — meaning the original already sits in
  // that inbox. Forwarding it back would duplicate every reply, so skip.
  let forwarded = false;
  const campusNativeMode = !process.env.INBOUND_REPLY_ADDRESS;
  if (campusId && !campusNativeMode) {
    const campusResult = await supabase.from("campus").select("email").eq("id", campusId).maybeSingle();
    const campusEmail = (campusResult.data as { email?: string | null } | null)?.email ?? null;
    if (campusEmail && bareAddress(campusEmail).toLowerCase() !== from.toLowerCase()) {
      const forwardSubject = `Fwd (family reply): ${subject ?? "(no subject)"}`;
      const forwardText =
        "Family reply, also recorded on their timeline. Reply goes directly to the family.\n\n" +
        (text ?? "");
      const result = await sendEmail({
        to: campusEmail,
        subject: forwardSubject,
        html: `<p>Family reply, also recorded on their timeline. Reply goes directly to the family.</p><pre>${escapeHtml(text ?? "")}</pre>`,
        text: forwardText,
        replyTo: from,
        preserveReplyTo: true,
      });
      if (result.ok) {
        forwarded = true;
        if (stored) await stampForwarded(supabase, providerId ?? null, from, subject ?? null);
      } else if (result.error !== "email not configured") {
        console.error("[handleInboundEmail] forward failed", result.error);
      }
    }
  }

  return { skipped: null, matched, stored, notified, forwarded };
}

/** Minimal HTML escaping for embedding the raw reply text in the forward's HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function storeInboundEmail({
  supabase,
  providerId,
  fromEmail,
  toEmail,
  subject,
  bodyText,
  guardianId,
  leadId,
  campusId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  providerId: string | null;
  fromEmail: string;
  toEmail: string | null;
  subject: string | null;
  bodyText: string;
  guardianId: string | null;
  leadId: string | null;
  campusId: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from("inbound_email").insert({
    provider_id: providerId,
    from_email: fromEmail,
    to_email: toEmail,
    subject,
    body_text: bodyText,
    matched_guardian_id: guardianId,
    matched_lead_id: leadId,
    campus_id: campusId,
  });

  if (!error) return true;

  if (isMissingRelation(error)) {
    warnMissingInboundTable("insert");
    return false;
  }
  // A unique-violation on provider_id means a concurrent retry won the race.
  if (error.code === "23505") return false;

  console.error("[handleInboundEmail] insert failed", error.message, { providerId });
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stampForwarded(supabase: any, providerId: string | null, fromEmail: string, subject: string | null): Promise<void> {
  try {
    let query = supabase.from("inbound_email").update({ forwarded_at: new Date().toISOString() });
    query = providerId
      ? query.eq("provider_id", providerId)
      : query.eq("from_email", fromEmail).eq("subject", subject);
    const { error } = await query;
    if (error) console.error("[handleInboundEmail] forwarded_at stamp failed", error.message);
  } catch (err) {
    console.error("[handleInboundEmail] forwarded_at stamp threw", err);
  }
}

// ─── Staff notification ──────────────────────────────────────────────────────
//
// Minimal replication of lib/notify.ts's notifyStaff + getStaffUserIdsForCampus
// (and identical in shape to lib/inbound-sms.ts's own copy). Duplicated on
// purpose: notify.ts is an outbound-events module and pulling an inbound
// dependency through it would tangle the two directions.

async function notifyCampusStaff({
  supabase,
  campusId,
  subject,
  body,
  link,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  campusId: string;
  subject: string;
  body: string;
  link: string;
}): Promise<boolean> {
  const { data, error } = await supabase.from("user_campus_role").select("user_id").eq("campus_id", campusId);
  if (error) {
    console.error("[handleInboundEmail] staff lookup failed", error.message, { campusId });
    return false;
  }
  const userIds = ((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id).filter(Boolean);
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) {
    console.warn("[handleInboundEmail] no staff assigned to campus — reply not routed", { campusId });
    return false;
  }
  const result = await sendNotification({
    recipientUserIds: unique,
    campusId,
    channel: "in_app",
    subject,
    body,
    link,
  });
  if (result.error) {
    console.error("[handleInboundEmail] notification failed", result.error, { campusId });
    return false;
  }
  return true;
}

async function notifySystemAdmins({
  supabase,
  subject,
  body,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  subject: string;
  body: string;
}): Promise<boolean> {
  const { data, error } = await supabase.from("user_campus_role").select("user_id").eq("role", "system_admin");
  if (error) {
    console.error("[handleInboundEmail] system_admin lookup failed", error.message);
    return false;
  }
  const unique = Array.from(
    new Set(((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id).filter(Boolean))
  );
  if (unique.length === 0) {
    console.warn("[handleInboundEmail] no system_admin users — reply not routed");
    return false;
  }
  const result = await sendNotification({
    recipientUserIds: unique,
    channel: "in_app",
    subject,
    body,
    link: "/staff/communications/inbound",
  });
  if (result.error) {
    console.error("[handleInboundEmail] system_admin notification failed", result.error);
    return false;
  }
  return true;
}
