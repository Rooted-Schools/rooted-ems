/**
 * Inbound SMS — the receiving half of two-way texting.
 *
 * Outbound already works (lib/sms.ts → Twilio REST, fired from lib/notify.ts).
 * Everything a family texted back, though, used to land at Twilio and stop
 * there. This module is what the Twilio webhook (app/api/webhooks/twilio/
 * route.ts) calls once a delivery has been proven authentic.
 *
 * What it does, in order:
 *   1. Normalize the sender and match it — guardians first, then CRM leads.
 *      Matching is on the last 10 digits, because a number Twilio hands us as
 *      "+15555550100" may live in the database as "(555) 555-0100".
 *   2. Honor consent commands. STOP/UNSUBSCRIBE/CANCEL/QUIT clears
 *      sms_consent on EVERY row that number matches; START/UNSTOP/YES sets it
 *      back. Twilio enforces its own carrier-level opt-out, but our own
 *      consent flag is our own responsibility — if it stayed true, staff would
 *      see a family as textable when they are not.
 *   3. Record the message so it exists somewhere a human can find it.
 *   4. Notify campus staff in-app so a reply gets a human answer.
 *
 * Rules this module keeps, no exceptions:
 *   - Never throws. The webhook must always be able to return 200 once the
 *     signature has passed; a database problem is ours, not Twilio's, and a
 *     non-200 just buys us a retry storm.
 *   - Never notifies across campuses. An unmatched number belongs to no
 *     campus, so nobody is notified about it — it is logged and recorded, and
 *     that is the honest outcome rather than paging the wrong school.
 *   - Never invents data. If the inbound_sms table is not there yet, we say so
 *     in the log and still deliver the reply to staff with the body embedded,
 *     rather than pretending the message was filed.
 *
 * Migration dependency: supabase/migrations/00035_inbound_sms.sql. Migrations
 * are applied manually, so every path here degrades if it is absent.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { sendNotification } from "@/lib/mutations/communications";
import { normalizePhone, phoneDigits10 } from "@/lib/sms";

// ─── Body classification ─────────────────────────────────────────────────────

/**
 * Carrier-standard opt-out keywords. Twilio recognizes this exact set at its
 * own layer; we mirror it so our sms_consent flag never disagrees with what
 * the carrier is actually enforcing.
 */
const STOP_KEYWORDS = new Set([
  "stop",
  "stopall",
  "stop all",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

/** Carrier-standard opt-in keywords — the way back after a STOP. */
const START_KEYWORDS = new Set(["start", "unstop", "yes"]);

export type InboundSmsIntent = "stop" | "start" | "message";

/**
 * Classify a message body. Case-insensitive and whitespace-trimmed, and only
 * an exact keyword match counts: "stop by the open house tomorrow" is a
 * question for staff, not an opt-out request.
 */
export function classifyInboundBody(body: string): InboundSmsIntent {
  const normalized = body.trim().toLowerCase().replace(/\s+/g, " ");
  if (STOP_KEYWORDS.has(normalized)) return "stop";
  if (START_KEYWORDS.has(normalized)) return "start";
  return "message";
}

// ─── Phone matching ──────────────────────────────────────────────────────────

/**
 * Common written forms of a 10-digit US number, for a cheap indexed equality
 * lookup before falling back to a scan. Covers what the application forms and
 * staff entry actually produce.
 */
export function phoneVariants(digits10: string): string[] {
  const area = digits10.slice(0, 3);
  const prefix = digits10.slice(3, 6);
  const line = digits10.slice(6);
  return [
    digits10,
    `+1${digits10}`,
    `1${digits10}`,
    `(${area}) ${prefix}-${line}`,
    `(${area})${prefix}-${line}`,
    `${area}-${prefix}-${line}`,
    `${area}.${prefix}.${line}`,
    `${area} ${prefix} ${line}`,
    `1-${area}-${prefix}-${line}`,
    `+1 ${area} ${prefix} ${line}`,
    `+1 (${area}) ${prefix}-${line}`,
  ];
}

interface PhoneRow {
  id: string;
  phone: string | null;
  [key: string]: unknown;
}

/**
 * Find every row in `table` whose phone is the same number as `digits10`.
 *
 * Two passes. The first is an equality lookup against the formats people
 * actually type, which is indexable and answers almost every real case. The
 * second narrows on the trailing four digits and then compares the true last
 * ten in JS, which catches formats the first pass never anticipated (leading
 * country codes, stray extensions, non-breaking spaces) without scanning the
 * whole table.
 */
async function matchByPhone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  columns: string,
  digits10: string,
  logTag: string
): Promise<PhoneRow[]> {
  const exact = await supabase.from(table).select(columns).in("phone", phoneVariants(digits10));
  if (exact.error) {
    console.error(`[${logTag}] ${table} exact phone lookup failed`, exact.error.message);
  } else {
    const rows = ((exact.data ?? []) as PhoneRow[]).filter(
      (row) => phoneDigits10(row.phone) === digits10
    );
    if (rows.length > 0) return rows;
  }

  const fuzzy = await supabase.from(table).select(columns).ilike("phone", `%${digits10.slice(-4)}`);
  if (fuzzy.error) {
    console.error(`[${logTag}] ${table} fallback phone lookup failed`, fuzzy.error.message);
    return [];
  }
  return ((fuzzy.data ?? []) as PhoneRow[]).filter(
    (row) => phoneDigits10(row.phone) === digits10
  );
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

/**
 * Say it once, not once per text. A pending migration is a deploy-state fact,
 * and repeating it on every inbound message would bury the message bodies we
 * are deliberately logging alongside it.
 */
function warnMissingInboundTable(context: string): void {
  if (warnedMissingInboundTable) return;
  warnedMissingInboundTable = true;
  console.warn(
    `[handleInboundSms] inbound_sms table not present (${context}) — migration 00035_inbound_sms.sql has not been applied. ` +
      "Inbound replies are being logged and routed to staff notifications only, not stored."
  );
}

// ─── Public entry point ──────────────────────────────────────────────────────

export interface InboundSmsInput {
  /** Twilio's `From` — E.164, but normalized again defensively. */
  from: string;
  /** Twilio's `Body`. */
  body: string;
  /** Twilio's `MessageSid` — the dedupe key. */
  messageSid: string;
}

export interface InboundSmsOutcome {
  /** What we understood the text to be. */
  intent: InboundSmsIntent | "unusable";
  /** True when this MessageSid had already been recorded. */
  duplicate: boolean;
  /** Whether the number resolved to a person we know. */
  matched: "guardian" | "lead" | "none";
  /** True when the message row was actually written. */
  stored: boolean;
  /** True when campus staff were notified. */
  notified: boolean;
}

const UNHANDLED: InboundSmsOutcome = {
  intent: "unusable",
  duplicate: false,
  matched: "none",
  stored: false,
  notified: false,
};

/**
 * Process one inbound text. Returns a description of what happened (useful in
 * tests and logs) and never throws — the caller returns 200 regardless.
 */
export async function handleInboundSms(input: InboundSmsInput): Promise<InboundSmsOutcome> {
  try {
    return await processInboundSms(input);
  } catch (err) {
    console.error("[handleInboundSms] unexpected", err);
    return UNHANDLED;
  }
}

async function processInboundSms({
  from,
  body,
  messageSid,
}: InboundSmsInput): Promise<InboundSmsOutcome> {
  const normalizedFrom = normalizePhone(from);
  const digits10 = phoneDigits10(normalizedFrom ?? from);
  if (!digits10) {
    console.warn("[handleInboundSms] unusable From number — ignoring", { messageSid });
    return UNHANDLED;
  }

  const last4 = digits10.slice(-4);
  const supabase = createServiceRoleClient();

  // ── Dedupe. Twilio retries anything it doesn't get a prompt 200 for, and a
  // retry must not double-notify staff. When the table is absent we cannot
  // dedupe at all — say so rather than claiming a clean check.
  const existing = await supabase
    .from("inbound_sms")
    .select("id")
    .eq("message_sid", messageSid)
    .maybeSingle();
  let canStore = true;
  if (existing.error) {
    if (isMissingRelation(existing.error)) {
      warnMissingInboundTable("dedupe lookup");
      canStore = false;
    } else {
      console.error("[handleInboundSms] dedupe lookup failed", existing.error.message, {
        messageSid,
      });
    }
  } else if (existing.data) {
    return { intent: "message", duplicate: true, matched: "none", stored: false, notified: false };
  }

  // ── Match the sender. Both tables are always queried: the notification goes
  // to one best surface, but a consent change must land on every row that
  // number belongs to.
  const guardians = (await matchByPhone(
    supabase,
    "guardian",
    "id, first_name, last_name, phone",
    digits10,
    "handleInboundSms"
  )) as Array<PhoneRow & { first_name?: string; last_name?: string }>;

  const leads = (await matchByPhone(
    supabase,
    "lead",
    "id, first_name, last_name, phone, campus_id",
    digits10,
    "handleInboundSms"
  )) as Array<PhoneRow & { first_name?: string; last_name?: string; campus_id?: string | null }>;

  const guardian = guardians[0] ?? null;
  const lead = leads[0] ?? null;
  const matched: InboundSmsOutcome["matched"] = guardian ? "guardian" : lead ? "lead" : "none";

  // ── Resolve the campus and the staff surface for whoever this is.
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
      console.error("[handleInboundSms] application lookup failed", app.error.message);
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
  const who = displayName ?? `the number ending ${last4}`;

  const intent = classifyInboundBody(body);

  // ── Consent. Ours to keep accurate, independent of Twilio's own opt-out.
  if (intent === "stop" || intent === "start") {
    await applyConsent({
      supabase,
      consent: intent === "start",
      guardianIds: guardians.map((g) => g.id),
      leadIds: leads.map((l) => l.id),
      last4,
    });
  }

  // ── Record the message. Consent commands are recorded too — the text a
  // family actually sent is the evidence behind the flag we just flipped.
  const stored = canStore
    ? await storeInboundSms({
        supabase,
        messageSid,
        fromPhone: normalizedFrom ?? `+${digits10}`,
        guardianId: guardian?.id ?? null,
        leadId: guardian ? null : (lead?.id ?? null),
        campusId,
        body,
      })
    : false;

  // Always leave a server-side trace of the content. When the table is
  // missing this line is the only record that exists, so it carries the body.
  console.info("[handleInboundSms] inbound text", {
    messageSid,
    from: `…${last4}`,
    matched,
    campusId,
    intent,
    stored,
    body: stored ? undefined : body.slice(0, 320),
  });

  // ── Notify campus staff. No campus means no audience: an unrecognized
  // number is not routed to anyone, because guessing a campus would put one
  // school's family in another school's queue.
  let notified = false;
  if (campusId) {
    const subject =
      intent === "stop"
        ? `Text opt-out from ${who}`
        : intent === "start"
          ? `Text opt-in from ${who}`
          : `Text reply from ${who}`;

    const preview = body.trim().slice(0, 160);
    const notificationBody =
      intent === "stop"
        ? `${who} replied "${preview}" and has been opted out of text messages. Reach them by phone or email instead.`
        : intent === "start"
          ? `${who} replied "${preview}" and is opted back in to text messages.`
          : preview || "(empty message)";

    const link =
      matched === "lead" && lead
        ? `/staff/recruitment/${lead.id}`
        : applicationId
          ? `/staff/applications/${applicationId}`
          : null;

    if (link) {
      notified = await notifyCampusStaff({ supabase, campusId, subject, body: notificationBody, link });
    }
  } else if (matched === "none") {
    // Deliberately silent beyond the log above: there is no campus to scope a
    // notification to, and no staff surface exists for an unknown number.
    console.warn("[handleInboundSms] no guardian or lead matched this number", {
      messageSid,
      from: `…${last4}`,
    });
  }

  return { intent, duplicate: false, matched, stored, notified };
}

// ─── Consent ─────────────────────────────────────────────────────────────────

async function applyConsent({
  supabase,
  consent,
  guardianIds,
  leadIds,
  last4,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  consent: boolean;
  guardianIds: string[];
  leadIds: string[];
  last4: string;
}): Promise<void> {
  if (guardianIds.length > 0) {
    const { error } = await supabase
      .from("guardian")
      .update({ sms_consent: consent })
      .in("id", guardianIds);
    if (error) {
      console.error("[handleInboundSms] guardian consent update failed", error.message, {
        from: `…${last4}`,
      });
    }
  }

  if (leadIds.length > 0) {
    const { error } = await supabase
      .from("lead")
      .update({ sms_consent: consent })
      .in("id", leadIds);
    if (error) {
      console.error("[handleInboundSms] lead consent update failed", error.message, {
        from: `…${last4}`,
      });
    } else {
      // The lead timeline is where recruitment staff read a family's history,
      // so the consent change belongs on it as an activity, not only in a flag.
      const { error: activityError } = await supabase.from("lead_activity").insert(
        leadIds.map((leadId) => ({
          lead_id: leadId,
          activity_type: "sms",
          body: consent
            ? "Replied START — opted back in to text messages."
            : "Replied STOP — opted out of text messages.",
        }))
      );
      if (activityError) {
        console.error("[handleInboundSms] lead activity insert failed", activityError.message);
      }
    }
  }
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function storeInboundSms({
  supabase,
  messageSid,
  fromPhone,
  guardianId,
  leadId,
  campusId,
  body,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  messageSid: string;
  fromPhone: string;
  guardianId: string | null;
  leadId: string | null;
  campusId: string | null;
  body: string;
}): Promise<boolean> {
  const { error } = await supabase.from("inbound_sms").insert({
    message_sid: messageSid,
    from_phone: fromPhone,
    matched_guardian_id: guardianId,
    matched_lead_id: leadId,
    campus_id: campusId,
    body,
  });

  if (!error) return true;

  if (isMissingRelation(error)) {
    warnMissingInboundTable("insert");
    return false;
  }
  // A unique-violation on message_sid means a concurrent retry won the race.
  // That is the dedupe working, not a failure.
  if (error.code === "23505") return false;

  console.error("[handleInboundSms] insert failed", error.message, { messageSid });
  return false;
}

// ─── Staff notification ──────────────────────────────────────────────────────

/**
 * Minimal replication of lib/notify.ts's notifyStaff + getStaffUserIdsForCampus.
 * Duplicated rather than imported on purpose: notify.ts is an outbound-events
 * module and pulling an inbound dependency through it would tangle the two
 * directions. The behavior — every staff member assigned to the campus, in-app
 * channel, failures logged and swallowed — is deliberately identical.
 */
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
  const { data, error } = await supabase
    .from("user_campus_role")
    .select("user_id")
    .eq("campus_id", campusId);

  if (error) {
    console.error("[handleInboundSms] staff lookup failed", error.message, { campusId });
    return false;
  }

  const userIds = ((data ?? []) as Array<{ user_id: string }>)
    .map((row) => row.user_id)
    .filter(Boolean);
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) {
    console.warn("[handleInboundSms] no staff assigned to campus — reply not routed", { campusId });
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
    console.error("[handleInboundSms] notification failed", result.error, { campusId });
    return false;
  }
  return true;
}
