import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import { sendSms, SMS_NOT_CONFIGURED } from "@/lib/sms";
import * as emailTemplates from "@/lib/email-templates";

/**
 * Closes the event RSVP conversion loop: pre-event reminders, then
 * next-morning follow-ups split by whether the family actually showed up.
 * Events currently capture RSVPs and stop — this is the reminder / check-in
 * / follow-up machinery that turns an RSVP into either an application or an
 * honest "we missed you, here's what's next".
 *
 * Four independent, idempotent operations per run:
 *   1. ~24h-before reminder  (event_rsvp.reminded_24h_at)
 *   2. ~2h-before reminder   (event_rsvp.reminded_2h_at)
 *   3. Next-morning attendee follow-up  (checked_in_at set)
 *   4. Next-morning no-show follow-up   (checked_in_at never set)
 *      — 3 and 4 share one dedupe column, event_rsvp.followup_sent_at.
 *
 * Cadence assumption: every operation claims its own row atomically (a
 * NULL-guarded UPDATE ... WHERE col IS NULL, same pattern as
 * app/api/cron/offer-reminders and app/api/cron/keep-the-seat), so calling
 * this route more than once for the same window is always safe — nothing
 * double-sends. That said, the two pre-event reminders only land close to
 * their ~24h/~2h targets if this route actually runs every 15-30 minutes.
 * This repo's vercel.json currently only wires up daily crons (Vercel
 * Hobby-plan cadence), so whoever schedules this route in production needs
 * either a Pro-plan frequent cron entry or an external scheduler hitting it
 * with the CRON_SECRET bearer token every 15-30 min. Run only daily, it
 * still works correctly — reminded_24h_at/reminded_2h_at dedupe means
 * nothing double-sends — a reminder would just land anywhere within its
 * ~24h/~2h window instead of near the edge of it.
 *
 * Every read/write against reminded_24h_at, reminded_2h_at, checked_in_at,
 * and followup_sent_at (migration 00037_event_rsvp_loop.sql, applied
 * manually) degrades gracefully: if a column isn't there yet, that specific
 * section is skipped and logged once — never a blind double-send, never a
 * 500 for the whole run.
 *
 * Authentication: CRON_SECRET via Authorization header as "Bearer <secret>".
 */

const REMINDER_24H_WINDOW_MS = 24 * 60 * 60 * 1000;
const REMINDER_2H_WINDOW_MS = 2 * 60 * 60 * 1000;

/** How long after an event effectively ends before its RSVPs are eligible
 *  for the next-morning follow-up. 8h comfortably covers "event ends at
 *  7pm, cron runs at 6am" without needing per-campus timezone/calendar-day
 *  math. */
const FOLLOWUP_DELAY_MS = 8 * 60 * 60 * 1000;
/** The staff "new event" form only captures a start time (see
 *  app/staff/recruitment/events/events-client.tsx) — ends_at is almost
 *  always null in practice. When absent, assume a 90-minute event for the
 *  follow-up-eligibility calculation only; never used for anything family-
 *  facing. */
const DEFAULT_EVENT_DURATION_MS = 90 * 60 * 1000;
/** Only look as far back as this for follow-up candidates, to bound query
 *  size — a follow-up more than a month late isn't useful, and by then
 *  followup_sent_at would already be set or the row is stale. */
const FOLLOWUP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

// ─── Missing-column tolerance (migration 00037 applied manually) ─────────

function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

const warnedOnce = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(message);
}

// ─── Local send helpers ────────────────────────────────────────────────
// Duplicated in miniature from lib/notify.ts's emailGuardian/smsGuardian
// rather than imported — this route's territory doesn't include notify.ts,
// and the behavior (never throw, consent-gate SMS, log-and-continue on
// failure) is small enough to keep self-contained here, same rationale
// lib/inbound-sms.ts gives for its own local notifyCampusStaff.

async function emailFamily(
  to: string | null,
  template: { subject: string; html: string; text: string },
  replyTo: string | null,
  logTag: string
): Promise<void> {
  if (!to) return;
  const result = await sendEmail({ to, subject: template.subject, html: template.html, text: template.text, replyTo: replyTo ?? undefined });
  if (!result.ok && result.error !== "email not configured") {
    console.error(`[${logTag}] email failed`, result.error);
  }
}

async function smsFamily(phone: string | null, smsConsent: boolean, body: string, logTag: string): Promise<void> {
  if (!smsConsent || !phone) return;
  const result = await sendSms({ to: phone, body });
  if (!result.ok && result.error !== SMS_NOT_CONFIGURED) {
    console.error(`[${logTag}] sms failed`, result.error);
  }
}

function whenText(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// ─── Row shapes ──────────────────────────────────────────────────────────

interface CampusEmbed { name: string | null; email: string | null }
interface EventEmbed {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  campus_id: string;
  campus: CampusEmbed | null;
}
interface LeadEmbed { sms_consent: boolean | null }
interface RsvpJoinRow {
  id: string;
  event_id: string;
  lead_id: string | null;
  guardian_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  checked_in_at?: string | null;
  event: EventEmbed | null;
  lead: LeadEmbed | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Order matters. The 2h window is a strict subset of the 24h window, so an
  // event starting in 90 minutes qualifies for both passes. Running 2h first
  // lets it claim those rows, and the 24h pass then starts its window at
  // now + 2h so it can never pick the same event up in the same run and send
  // a second, near-identical reminder minutes later.
  const reminders2h = await runReminders(supabase, now, "2h");
  const reminders24h = await runReminders(supabase, now, "24h");
  const results = {
    reminders_24h: reminders24h,
    reminders_2h: reminders2h,
    followups: await runFollowups(supabase, now),
  };

  console.log(
    `[cron/event-followups] 24h reminders: ${results.reminders_24h.sent}/${results.reminders_24h.checked} · ` +
      `2h reminders: ${results.reminders_2h.sent}/${results.reminders_2h.checked} · ` +
      `follow-ups: ${results.followups.sent}/${results.followups.checked} · errors ${
        results.reminders_24h.errors + results.reminders_2h.errors + results.followups.errors
      }`
  );

  return NextResponse.json({ ...results, timestamp: nowIso });
}

// ─── Reminders ───────────────────────────────────────────────────────────

async function runReminders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date,
  kind: "24h" | "2h"
): Promise<{ checked: number; sent: number; errors: number }> {
  const column = kind === "24h" ? "reminded_24h_at" : "reminded_2h_at";
  const windowMs = kind === "24h" ? REMINDER_24H_WINDOW_MS : REMINDER_2H_WINDOW_MS;
  // The 24h pass starts where the 2h pass ends. Without this floor the two
  // windows overlap for everything inside two hours, and a single run would
  // send both reminders to the same family. The 2h pass runs first (see GET),
  // so anything in that band has already been claimed and answered.
  const floorIso =
    kind === "24h"
      ? new Date(now.getTime() + REMINDER_2H_WINDOW_MS).toISOString()
      : now.toISOString();
  const cutoffIso = new Date(now.getTime() + windowMs).toISOString();

  const { data, error } = await supabase
    .from("event_rsvp")
    .select(
      `id, event_id, lead_id, guardian_name, email, phone, status, ${column},
       event:event_id!inner (id, title, starts_at, ends_at, location, campus_id, campus:campus_id (name, email)),
       lead:lead_id (sms_consent)`
    )
    .neq("status", "cancelled")
    .is(column as never, null)
    .gt("event.starts_at", floorIso)
    .lte("event.starts_at", cutoffIso);

  if (error) {
    if (isMissingColumn(error)) {
      warnOnce(
        `reminder-${kind}`,
        `[cron/event-followups] event_rsvp.${column} not present — migration 00037_event_rsvp_loop.sql has not been applied. Skipping ${kind} reminders.`
      );
      return { checked: 0, sent: 0, errors: 0 };
    }
    console.error(`[cron/event-followups] ${kind} fetch`, error.message);
    return { checked: 0, sent: 0, errors: 1 };
  }

  const rows = (data ?? []) as RsvpJoinRow[];
  let sent = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const event = row.event;
      if (!event) continue;

      // Atomic claim: only one runner flips this column from NULL.
      const claimNowIso = new Date().toISOString();
      const { data: claimed, error: claimErr } = await supabase
        .from("event_rsvp")
        .update({ [column]: claimNowIso } as never)
        .eq("id", row.id)
        .is(column as never, null)
        .select("id");

      if (claimErr) {
        console.error(`[cron/event-followups] ${kind} claim ${row.id}`, claimErr.message);
        errors++;
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // another run already sent this one

      const campusName = event.campus?.name ?? "your school";
      const campusEmail = event.campus?.email ?? null;
      const firstName = row.guardian_name?.trim().split(/\s+/)[0] || undefined;
      const when = whenText(event.starts_at);

      // Urgency reflects actual time remaining at send, not which cron pass
      // (24h vs 2h window query) picked up the row — a daily-only cron
      // schedule (see module doc comment) can easily fire the "24h" pass
      // with only a handful of hours left, and claiming "tomorrow" then
      // would be a lie. <=3h: starting soon. 18-26h: genuinely tomorrow.
      // Anything in between: neutral, state the real date/time.
      const hoursUntil = (new Date(event.starts_at).getTime() - new Date().getTime()) / (60 * 60 * 1000);
      const urgency: "starting_soon" | "day_before" | "coming_soon" =
        hoursUntil <= 3 ? "starting_soon" : hoursUntil >= 18 && hoursUntil <= 26 ? "day_before" : "coming_soon";

      const template = emailTemplates.eventReminder({
        guardianFirstName: firstName,
        campusName,
        eventTitle: event.title,
        whenText: when,
        location: event.location ?? undefined,
        urgency,
      });

      const smsBody =
        urgency === "day_before"
          ? `Rooted Schools: Reminder — ${event.title} at ${campusName} is tomorrow, ${when}${event.location ? ` at ${event.location}` : ""}. See you there!\nRecordatorio — ${event.title} en ${campusName} es mañana. ¡Nos vemos!`
          : urgency === "starting_soon"
            ? `Rooted Schools: ${event.title} at ${campusName} is starting soon (${when})${event.location ? ` — ${event.location}` : ""}. See you shortly!\n${event.title} en ${campusName} comienza pronto. ¡Nos vemos!`
            : `Rooted Schools: Reminder — ${event.title} at ${campusName} is coming up soon, ${when}${event.location ? ` at ${event.location}` : ""}. See you there!\nRecordatorio — ${event.title} en ${campusName} se acerca pronto, ${when}. ¡Nos vemos!`;

      await Promise.all([
        emailFamily(row.email, template, campusEmail, "cron/event-followups reminder"),
        smsFamily(row.phone, row.lead?.sms_consent === true, smsBody, "cron/event-followups reminder"),
      ]);

      sent++;
    } catch (err) {
      console.error(`[cron/event-followups] ${kind} ${row.id}`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { checked: rows.length, sent, errors };
}

// ─── Follow-ups ──────────────────────────────────────────────────────────

async function runFollowups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date
): Promise<{ checked: number; sent: number; errors: number }> {
  const nowIso = now.toISOString();
  const lookbackIso = new Date(now.getTime() - FOLLOWUP_LOOKBACK_MS).toISOString();
  // Coarse, inclusive pre-filter on starts_at only (ends_at is usually
  // null): any row genuinely eligible has starts_at at least
  // FOLLOWUP_DELAY_MS in the past, since ends_at (real or assumed) is
  // never before starts_at. The precise eligibility check happens in JS
  // below using each row's real ends_at when present.
  const startedBeforeIso = new Date(now.getTime() - FOLLOWUP_DELAY_MS).toISOString();

  const query = await supabase
    .from("event_rsvp")
    .select(
      `id, event_id, lead_id, guardian_name, email, phone, status, checked_in_at, followup_sent_at,
       event:event_id!inner (id, title, starts_at, ends_at, location, campus_id, campus:campus_id (name, email)),
       lead:lead_id (sms_consent)`
    )
    .neq("status", "cancelled")
    .is("followup_sent_at" as never, null)
    .gte("event.starts_at", lookbackIso)
    .lte("event.starts_at", startedBeforeIso);

  if (query.error && isMissingColumn(query.error)) {
    // Either followup_sent_at or checked_in_at is absent — with no dedupe
    // marker and no honest attendee/no-show signal, skip entirely rather
    // than risk a repeat or misclassified send.
    warnOnce(
      "followup-column",
      "[cron/event-followups] event_rsvp.followup_sent_at / checked_in_at not present — migration 00037_event_rsvp_loop.sql has not been applied. Skipping follow-ups."
    );
    return { checked: 0, sent: 0, errors: 0 };
  }

  if (query.error) {
    console.error("[cron/event-followups] followups fetch", query.error.message);
    return { checked: 0, sent: 0, errors: 1 };
  }

  const rows = (query.data ?? []) as RsvpJoinRow[];
  let sent = 0;
  let errors = 0;
  const nextEventCache = new Map<string, { id: string; title: string; starts_at: string; location: string | null } | null>();

  async function nextUpcomingEvent(campusId: string, excludeEventId: string) {
    const cacheKey = `${campusId}:${excludeEventId}`;
    if (nextEventCache.has(cacheKey)) return nextEventCache.get(cacheKey) ?? null;
    const { data } = await supabase
      .from("event")
      .select("id, title, starts_at, location")
      .eq("campus_id", campusId)
      .eq("is_published", true)
      .neq("id", excludeEventId)
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const found = (data as { id: string; title: string; starts_at: string; location: string | null } | null) ?? null;
    nextEventCache.set(cacheKey, found);
    return found;
  }

  for (const row of rows) {
    try {
      const event = row.event;
      if (!event) continue;

      const startsAtMs = new Date(event.starts_at).getTime();
      const effectiveEndMs = event.ends_at ? new Date(event.ends_at).getTime() : startsAtMs + DEFAULT_EVENT_DURATION_MS;
      if (now.getTime() - effectiveEndMs < FOLLOWUP_DELAY_MS) continue; // not eligible yet — real check, filter above was only coarse

      // checked_in_at is the primary signal; status 'attended' is an OR
      // fallback for RSVPs checked in before this migration existed (when
      // checkInRsvp/setRsvpStatus could only write status, not the
      // timestamp) — never excludes a genuine attendee.
      const attended = row.checked_in_at != null || row.status === "attended";

      // Atomic claim on followup_sent_at.
      const claimNowIso = new Date().toISOString();
      const { data: claimed, error: claimErr } = await supabase
        .from("event_rsvp")
        .update({ followup_sent_at: claimNowIso } as never)
        .eq("id", row.id)
        .is("followup_sent_at" as never, null)
        .select("id");

      if (claimErr) {
        console.error(`[cron/event-followups] followup claim ${row.id}`, claimErr.message);
        errors++;
        continue;
      }
      if (!claimed || claimed.length === 0) continue;

      const campusName = event.campus?.name ?? "your school";
      const campusEmail = event.campus?.email ?? null;
      const firstName = row.guardian_name?.trim().split(/\s+/)[0] || undefined;

      if (attended) {
        const template = emailTemplates.eventFollowupAttended({
          guardianFirstName: firstName,
          campusName,
          eventTitle: event.title,
        });
        await Promise.all([
          emailFamily(row.email, template, campusEmail, "cron/event-followups attended"),
          smsFamily(
            row.phone,
            row.lead?.sms_consent === true,
            `Rooted Schools: It was great to meet you at ${event.title}! Ready to apply? It takes 5 minutes: ${APP_URL}/login\nFue un gusto conocerle. ¿Listo(a) para aplicar? Tome 5 minutos: ${APP_URL}/login`,
            "cron/event-followups attended"
          ),
        ]);
      } else {
        const next = await nextUpcomingEvent(event.campus_id, event.id);
        const nextEventPayload = next
          ? { title: next.title, whenText: whenText(next.starts_at), url: `${APP_URL}/events/${next.id}` }
          : undefined;
        const template = emailTemplates.eventFollowupNoShow({
          guardianFirstName: firstName,
          campusName,
          eventTitle: event.title,
          nextEvent: nextEventPayload,
        });
        const smsCta = next ? `${APP_URL}/events/${next.id}` : `${APP_URL}/inquire`;
        await Promise.all([
          emailFamily(row.email, template, campusEmail, "cron/event-followups no-show"),
          smsFamily(
            row.phone,
            row.lead?.sms_consent === true,
            `Rooted Schools: We missed you at ${event.title}! ${next ? `Join us next at ${next.title}: ` : "We'd still love to connect: "}${smsCta}\nLe extrañamos. ${next ? "Le esperamos en nuestro próximo evento: " : "Nos encantaría conectar: "}${smsCta}`,
            "cron/event-followups no-show"
          ),
        ]);
      }

      if (row.lead_id) {
        await supabase.from("lead_activity").insert({
          lead_id: row.lead_id,
          activity_type: "note",
          body: attended ? `Sent post-event follow-up (attended ${event.title}).` : `Sent post-event follow-up (missed ${event.title}).`,
        });
      }

      sent++;
    } catch (err) {
      console.error("[cron/event-followups] followup", row.id, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { checked: rows.length, sent, errors };
}
